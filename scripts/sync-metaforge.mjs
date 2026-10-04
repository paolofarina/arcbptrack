#!/usr/bin/env node

/**
 * Refreshes the local ARC Raiders item catalog from MetaForge.
 *
 * Runtime users never call MetaForge: GitHub Pages reads the generated JSON
 * and cached images from this repository.
 *
 * Default image policy:
 *   - cache every item that has a blueprint
 *   - cache Rare / Epic / Legendary non-blueprint items
 * Use --all-images to cache every available item icon.
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const IMAGE_DIR = path.join(ROOT, "assets", "items");
const ITEMS_FILE = path.join(DATA_DIR, "items.json");
const RAW_FILE = path.join(DATA_DIR, "metaforge-items.json");
const MANIFEST_FILE = path.join(DATA_DIR, "image-manifest.json");

const API = "https://metaforge.app/api/arc-raiders/items";
const PAGE_SIZE = 50;
const CACHE_ALL_IMAGES = process.argv.includes("--all-images");
const INTERESTING_RARITIES = new Set(["Rare", "Epic", "Legendary"]);

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function normalizeRarity(value) {
  if (!value) return "Unknown";
  const v = String(value).trim().toLowerCase();
  return v ? v[0].toUpperCase() + v.slice(1) : "Unknown";
}

function normalizeType(value) {
  return value ? String(value).trim() : "Unknown";
}

function itemType(item) {
  return normalizeType(item.item_type ?? item.type);
}

function isBlueprint(item) {
  return itemType(item).toLowerCase() === "blueprint"
    || /\sblueprint$/i.test(item.name || "");
}

function blueprintTargetName(name = "") {
  return name.replace(/\s+blueprint$/i, "").trim();
}

function key(value = "") {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function safeId(value = "") {
  return key(value).replace(/\s+/g, "-") || crypto.randomUUID();
}

function normalizeIcon(icon) {
  if (!icon) return null;
  try {
    return new URL(icon, "https://static.metaforge.app").href;
  } catch {
    return null;
  }
}

async function fetchWithRetry(url, options = {}, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Accept": "application/json",
          "User-Agent": "arcbptrack-data-cache/1.0 (+https://github.com/paolofarina/arcbptrack)",
          ...(options.headers || {})
        }
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} for ${url}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(750 * attempt * attempt);
    }
  }
  throw lastError;
}

async function fetchAllItems() {
  const all = [];
  let page = 1;

  while (true) {
    const url = new URL(API);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(PAGE_SIZE));

    const response = await fetchWithRetry(url);
    const payload = await response.json();
    const rows = Array.isArray(payload?.data) ? payload.data : [];

    if (!Array.isArray(rows)) {
      throw new Error("Unexpected MetaForge /items response: data[] missing");
    }

    all.push(...rows);
    console.log(`MetaForge page ${page}: +${rows.length} (total ${all.length})`);

    const hasNext = Boolean(payload?.pagination?.hasNextPage);
    if (!hasNext) break;

    page += 1;
    await wait(200);
  }

  return all;
}

function buildCatalog(rawItems) {
  const blueprints = rawItems.filter(isBlueprint);
  const baseItems = rawItems.filter(item => !isBlueprint(item));

  const blueprintsByTarget = new Map();
  for (const bp of blueprints) {
    const target = key(blueprintTargetName(bp.name));
    if (!target) continue;
    if (!blueprintsByTarget.has(target)) blueprintsByTarget.set(target, []);
    blueprintsByTarget.get(target).push(bp);
  }

  const catalog = baseItems.map(item => {
    const matches = blueprintsByTarget.get(key(item.name)) || [];
    const bp = matches[0] || null;
    const rarity = normalizeRarity(item.rarity);
    const type = itemType(item);
    const baseIcon = normalizeIcon(item.icon);
    const blueprintIcon = normalizeIcon(bp?.icon);

    return {
      id: item.id || safeId(item.name),
      name: item.name,
      description: item.description || null,
      rarity,
      type,
      hasBlueprint: Boolean(bp),
      imageRemote: blueprintIcon || baseIcon,
      itemImageRemote: baseIcon,
      blueprint: bp ? {
        id: bp.id || safeId(bp.name),
        name: bp.name,
        rarity: normalizeRarity(bp.rarity),
        imageRemote: blueprintIcon
      } : null,
      spawn: {
        provider: "MetaForge",
        lootArea: item.loot_area || null,
        sources: Array.isArray(item.sources) ? item.sources : [],
        locations: Array.isArray(item.locations) ? item.locations : [],
        droppedBy: Array.isArray(item.dropped_by)
          ? item.dropped_by.map(entry => ({
              id: entry?.arc?.id || entry?.arc_id || entry?.id || null,
              name: entry?.arc?.name || null
            })).filter(entry => entry.id || entry.name)
          : []
      },
      source: {
        provider: "MetaForge",
        itemId: item.id || null,
        itemType: type
      }
    };
  });

  // Keep blueprint records whose craftable target is missing from the API so
  // new/unusual entries are not silently lost.
  const baseKeys = new Set(baseItems.map(item => key(item.name)));
  for (const bp of blueprints) {
    const targetName = blueprintTargetName(bp.name);
    if (baseKeys.has(key(targetName))) continue;

    catalog.push({
      id: `bp-target-${bp.id || safeId(targetName)}`,
      name: targetName,
      description: bp.description || null,
      rarity: "Unknown",
      type: "Unknown",
      hasBlueprint: true,
      imageRemote: normalizeIcon(bp.icon),
      itemImageRemote: null,
      blueprint: {
        id: bp.id || safeId(bp.name),
        name: bp.name,
        rarity: normalizeRarity(bp.rarity),
        imageRemote: normalizeIcon(bp.icon)
      },
      spawn: {
        provider: "MetaForge",
        lootArea: bp.loot_area || null,
        sources: Array.isArray(bp.sources) ? bp.sources : [],
        locations: Array.isArray(bp.locations) ? bp.locations : [],
        droppedBy: Array.isArray(bp.dropped_by)
          ? bp.dropped_by.map(entry => ({
              id: entry?.arc?.id || entry?.arc_id || entry?.id || null,
              name: entry?.arc?.name || null
            })).filter(entry => entry.id || entry.name)
          : []
      },
      source: {
        provider: "MetaForge",
        itemId: null
      }
    });
  }

  catalog.sort((a, b) => a.name.localeCompare(b.name));

  const byRarity = {};
  const byType = {};
  let withBlueprint = 0;

  for (const item of catalog) {
    byRarity[item.rarity] = (byRarity[item.rarity] || 0) + 1;
    byType[item.type] = (byType[item.type] || 0) + 1;
    if (item.hasBlueprint) withBlueprint += 1;
  }

  return {
    items: catalog,
    summary: {
      totalRawRecords: rawItems.length,
      totalItems: catalog.length,
      withBlueprint,
      withoutBlueprint: catalog.length - withBlueprint,
      rawBlueprintRecords: blueprints.length,
      byRarity,
      byType
    }
  };
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function extensionFromUrl(url) {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    return [".webp", ".png", ".jpg", ".jpeg"].includes(ext) ? ext : ".webp";
  } catch {
    return ".webp";
  }
}

function shouldCacheImage(item) {
  if (!item.imageRemote) return false;
  if (CACHE_ALL_IMAGES) return true;
  return item.hasBlueprint || INTERESTING_RARITIES.has(item.rarity);
}

async function syncImages(items) {
  await fs.mkdir(IMAGE_DIR, { recursive: true });
  const oldManifest = await readJson(MANIFEST_FILE, { items: {} });
  const manifest = {
    generatedAt: new Date().toISOString(),
    policy: CACHE_ALL_IMAGES
      ? "all"
      : "blueprints plus Rare/Epic/Legendary items",
    items: {}
  };

  let downloaded = 0;
  let reused = 0;
  let failed = 0;

  for (const item of items) {
    if (!shouldCacheImage(item)) continue;

    const ext = extensionFromUrl(item.imageRemote);
    const filename = `${safeId(item.id || item.name)}${ext}`;
    const relative = `assets/items/${filename}`;
    const absolute = path.join(ROOT, relative);
    const old = oldManifest?.items?.[item.id];

    let exists = false;
    try {
      await fs.access(absolute);
      exists = true;
    } catch {}

    if (exists && old?.source === item.imageRemote) {
      reused += 1;
    } else {
      try {
        const response = await fetchWithRetry(item.imageRemote, {
          headers: { "Accept": "image/avif,image/webp,image/png,image/*,*/*;q=0.8" }
        });
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length < 100) throw new Error("image response unexpectedly small");
        await fs.writeFile(absolute, buffer);
        downloaded += 1;
        await wait(80);
      } catch (error) {
        console.warn(`Image failed for ${item.name}: ${error.message}`);
        failed += 1;
        continue;
      }
    }

    item.image = relative;
    manifest.items[item.id] = {
      source: item.imageRemote,
      file: relative
    };
  }

  console.log(`Images: ${downloaded} downloaded, ${reused} reused, ${failed} failed`);
  await fs.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + "\n");
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const rawItems = await fetchAllItems();
  if (rawItems.length < 100) {
    throw new Error(`Safety stop: only ${rawItems.length} MetaForge item records returned`);
  }

  const { items, summary } = buildCatalog(rawItems);
  await syncImages(items);

  const now = new Date().toISOString();
  const out = {
    schemaVersion: 2,
    generatedAt: now,
    source: {
      provider: "MetaForge",
      api: API,
      attribution: "https://metaforge.app/arc-raiders"
    },
    summary,
    items
  };

  await fs.writeFile(RAW_FILE, JSON.stringify({
    generatedAt: now,
    count: rawItems.length,
    data: rawItems
  }, null, 2) + "\n");

  await fs.writeFile(ITEMS_FILE, JSON.stringify(out, null, 2) + "\n");

  console.log("Summary:");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${path.relative(ROOT, ITEMS_FILE)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
