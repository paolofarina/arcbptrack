#!/usr/bin/env node

/**
 * Refresh the local ARC Raiders catalog from MetaForge.
 *
 * - Runtime users never call MetaForge: the site reads local JSON/images.
 * - Weapon tiers I/II/III/IV are collapsed into one family card.
 * - Blueprint data is attached to the corresponding item family.
 * - The six historical blueprint categories are preserved when known.
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
const BLUEPRINTS_FILE = path.join(DATA_DIR, "blueprints.json");
const MANIFEST_FILE = path.join(DATA_DIR, "image-manifest.json");

const API = "https://metaforge.app/api/arc-raiders/items";
const PAGE_SIZE = 50;
const CACHE_ALL_IMAGES = process.argv.includes("--all-images");
const INTERESTING_RARITIES = new Set(["Rare", "Epic", "Legendary"]);
const MAIN_TYPES = ["Weapon", "Mod", "Grenade", "Quick Use", "Augment", "Material"];

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

function familyName(item) {
  let name = String(item.name || "").trim();

  if (itemType(item) === "Weapon") {
    name = name.replace(/\s+(I|II|III|IV)\s*$/i, "").trim();
  }

  if (/^Aphelion Rifle$/i.test(name)) name = "Aphelion";
  return name;
}

function matchKey(value = "") {
  let v = String(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .trim()
    .replace(/\s+blueprint$/i, "");

  v = v.replace(/\bmagazine\b/g, "mag");

  const lightStick = v.match(/^light stick \((blue|green|red|yellow)\)$/);
  if (lightStick) v = `${lightStick[1]} light stick`;

  if (v === "aphelion rifle") v = "aphelion";

  return v
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function safeId(value = "") {
  return matchKey(value).replace(/\s+/g, "-") || crypto.randomUUID();
}

function normalizeIcon(icon) {
  if (!icon) return null;
  try {
    return new URL(icon, "https://static.metaforge.app").href;
  } catch {
    return null;
  }
}

function looksLikeGrenade(name = "") {
  return /\bgrenade\b|\bmine\b|\bnade\b/i.test(name)
    || ["showstopper", "trailblazer", "wolfpack"].includes(matchKey(name));
}

function defaultDisplayType(rawType, name) {
  if (rawType === "Weapon") return "Weapon";
  if (rawType === "Modification") return "Mod";
  if (rawType === "Augment") return "Augment";
  if (rawType === "Quick Use") return looksLikeGrenade(name) ? "Grenade" : "Quick Use";
  if (["Basic Material", "Refined Material", "Topside Material", "Material"].includes(rawType)) return "Material";
  return rawType || "Unknown";
}

function chooseRepresentative(variants) {
  if (variants.length === 1) return variants[0];

  const tierRank = { I: 1, II: 2, III: 3, IV: 4 };

  return [...variants].sort((a, b) => {
    const ta = String(a.name || "").trim().match(/\s+(I|II|III|IV)$/i)?.[1]?.toUpperCase();
    const tb = String(b.name || "").trim().match(/\s+(I|II|III|IV)$/i)?.[1]?.toUpperCase();
    return (tierRank[ta] || 99) - (tierRank[tb] || 99);
  })[0];
}

function spawnFrom(item) {
  return {
    lootArea: item?.loot_area || null,
    sources: Array.isArray(item?.sources) ? item.sources : [],
    locations: Array.isArray(item?.locations) ? item.locations : [],
    droppedBy: Array.isArray(item?.dropped_by)
      ? item.dropped_by.map(entry => ({
          id: entry?.arc?.id || entry?.arc_id || entry?.id || null,
          name: entry?.arc?.name || null
        })).filter(entry => entry.id || entry.name)
      : []
  };
}

function mergeSpawn(variants) {
  const lootAreas = new Set();
  const sources = new Set();
  const locations = new Set();
  const droppedBy = new Map();

  for (const item of variants) {
    const spawn = spawnFrom(item);
    if (spawn.lootArea) lootAreas.add(spawn.lootArea);
    spawn.sources.forEach(v => sources.add(v));
    spawn.locations.forEach(v => locations.add(v));
    for (const arc of spawn.droppedBy) droppedBy.set(arc.id || arc.name, arc);
  }

  return {
    provider: "MetaForge",
    lootArea: [...lootAreas][0] || null,
    lootAreas: [...lootAreas],
    sources: [...sources],
    locations: [...locations],
    droppedBy: [...droppedBy.values()]
  };
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function fetchWithRetry(url, options = {}, attempts = 4) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Accept: "application/json",
          "User-Agent": "arcbptrack-data-cache/1.0 (+https://github.com/paolofarina/arcbptrack)",
          ...(options.headers || {})
        }
      });

      if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
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

    all.push(...rows);
    console.log(`MetaForge page ${page}: +${rows.length} (total ${all.length})`);

    if (!payload?.pagination?.hasNextPage) break;
    page += 1;
    await wait(200);
  }

  return all;
}

async function buildCatalog(rawItems) {
  const blueprintSnapshot = await readJson(BLUEPRINTS_FILE, { items: [] });
  const snapshotByKey = new Map(
    (blueprintSnapshot.items || []).map(item => [matchKey(item.name), item])
  );

  const rawBlueprints = rawItems.filter(isBlueprint);
  const baseItems = rawItems.filter(item => !isBlueprint(item));

  const rawBlueprintByTarget = new Map();
  for (const bp of rawBlueprints) {
    rawBlueprintByTarget.set(matchKey(blueprintTargetName(bp.name)), bp);
  }

  const groups = new Map();

  for (const item of baseItems) {
    const rawType = itemType(item);
    const name = familyName(item);
    const groupKey = rawType === "Weapon"
      ? `weapon:${matchKey(name)}`
      : `item:${item.id || safeId(item.name)}`;

    if (!groups.has(groupKey)) groups.set(groupKey, { name, rawType, variants: [] });
    groups.get(groupKey).variants.push(item);
  }

  const catalog = [];

  for (const group of groups.values()) {
    const representative = chooseRepresentative(group.variants);
    const bpKey = matchKey(group.name);
    const rawBlueprint = rawBlueprintByTarget.get(bpKey) || null;
    const snapshot = snapshotByKey.get(bpKey) || null;
    const hasBlueprint = Boolean(rawBlueprint || snapshot);

    const displayType = snapshot?.type || defaultDisplayType(group.rawType, group.name);
    const rarity = snapshot?.rarity || normalizeRarity(representative.rarity);
    const blueprintIcon = normalizeIcon(rawBlueprint?.icon) || snapshot?.image || null;
    const itemIcon = normalizeIcon(representative.icon);
    const familyId = group.rawType === "Weapon"
      ? safeId(group.name)
      : (representative.id || safeId(group.name));

    catalog.push({
      id: familyId,
      name: snapshot?.name || group.name,
      description: representative.description || null,
      rarity,
      type: displayType,
      rawType: group.rawType,
      isPrimaryType: MAIN_TYPES.includes(displayType),
      hasBlueprint,
      imageRemote: blueprintIcon || itemIcon,
      itemImageRemote: itemIcon,
      blueprint: hasBlueprint ? {
        id: rawBlueprint?.id || snapshot?.id || safeId(`${group.name}-blueprint`),
        name: rawBlueprint?.name || `${snapshot?.name || group.name} Blueprint`,
        rarity: snapshot?.rarity || normalizeRarity(rawBlueprint?.rarity),
        type: snapshot?.type || displayType,
        imageRemote: blueprintIcon,
        reward: snapshot?.reward || null,
        spawn: rawBlueprint ? {
          provider: "MetaForge",
          ...spawnFrom(rawBlueprint)
        } : null
      } : null,
      variants: group.variants.map(item => ({
        id: item.id || safeId(item.name),
        name: String(item.name || "").trim(),
        rarity: normalizeRarity(item.rarity),
        imageRemote: normalizeIcon(item.icon)
      })),
      spawn: mergeSpawn(group.variants),
      source: {
        provider: "MetaForge",
        itemId: representative.id || null,
        itemType: group.rawType
      }
    });
  }

  const familyKeys = new Set(catalog.map(item => matchKey(item.name)));

  for (const rawBlueprint of rawBlueprints) {
    const targetName = blueprintTargetName(rawBlueprint.name);
    const bpKey = matchKey(targetName);
    if (familyKeys.has(bpKey)) continue;

    const snapshot = snapshotByKey.get(bpKey) || null;
    const displayType = snapshot?.type || defaultDisplayType("Unknown", targetName);

    catalog.push({
      id: `bp-target-${rawBlueprint.id || safeId(targetName)}`,
      name: snapshot?.name || targetName,
      description: rawBlueprint.description || null,
      rarity: snapshot?.rarity || normalizeRarity(rawBlueprint.rarity),
      type: displayType,
      rawType: "Unknown",
      isPrimaryType: MAIN_TYPES.includes(displayType),
      hasBlueprint: true,
      imageRemote: normalizeIcon(rawBlueprint.icon) || snapshot?.image || null,
      itemImageRemote: null,
      blueprint: {
        id: rawBlueprint.id || snapshot?.id || safeId(rawBlueprint.name),
        name: rawBlueprint.name,
        rarity: snapshot?.rarity || normalizeRarity(rawBlueprint.rarity),
        type: displayType,
        imageRemote: normalizeIcon(rawBlueprint.icon) || snapshot?.image || null,
        reward: snapshot?.reward || null,
        spawn: { provider: "MetaForge", ...spawnFrom(rawBlueprint) }
      },
      variants: [],
      spawn: { provider: "MetaForge", ...spawnFrom(rawBlueprint) },
      source: {
        provider: "MetaForge",
        itemId: null,
        itemType: "Unknown"
      }
    });
  }

  catalog.sort((a, b) => a.name.localeCompare(b.name));

  const byRarity = {};
  const byType = {};
  const otherTypes = {};
  let withBlueprint = 0;

  for (const item of catalog) {
    byRarity[item.rarity] = (byRarity[item.rarity] || 0) + 1;
    byType[item.type] = (byType[item.type] || 0) + 1;
    if (!item.isPrimaryType) otherTypes[item.type] = (otherTypes[item.type] || 0) + 1;
    if (item.hasBlueprint) withBlueprint += 1;
  }

  return {
    items: catalog,
    summary: {
      totalRawRecords: rawItems.length,
      totalItemRecords: baseItems.length,
      totalFamilies: catalog.length,
      collapsedWeaponRecords: baseItems.length - groups.size,
      withBlueprint,
      withoutBlueprint: catalog.length - withBlueprint,
      rawBlueprintRecords: rawBlueprints.length,
      byRarity,
      byType,
      mainTypes: MAIN_TYPES,
      otherTypes
    }
  };
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
    policy: CACHE_ALL_IMAGES ? "all families" : "blueprints plus Rare/Epic/Legendary families",
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
          headers: { Accept: "image/avif,image/webp,image/png,image/*,*/*;q=0.8" }
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

  const keep = new Set(Object.values(manifest.items).map(entry => entry.file));
  let removed = 0;

  for (const entry of Object.values(oldManifest?.items || {})) {
    if (!entry?.file || keep.has(entry.file)) continue;
    try {
      await fs.unlink(path.join(ROOT, entry.file));
      removed += 1;
    } catch {}
  }

  console.log(`Images: ${downloaded} downloaded, ${reused} reused, ${failed} failed, ${removed} obsolete removed`);
  await fs.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + "\n");
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const rawItems = await fetchAllItems();
  if (rawItems.length < 100) {
    throw new Error(`Safety stop: only ${rawItems.length} MetaForge records returned`);
  }

  const { items, summary } = await buildCatalog(rawItems);
  await syncImages(items);

  const now = new Date().toISOString();
  const out = {
    schemaVersion: 3,
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
