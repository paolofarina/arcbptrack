#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ITEMS_FILE = path.join(ROOT, "data", "items.json");
const OUT_FILE = path.join(ROOT, "data", "metaforge-location-votes.json");
const API = "https://metaforge.app/api/arc-raiders/item-location-votes";

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url, attempts = 4) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "arcbptrack-data-cache/1.0 (+https://github.com/paolofarina/arcbptrack)"
        }
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(600 * attempt * attempt);
    }
  }

  throw lastError;
}

function summarize(rows) {
  const groups = {
    container: [],
    map: [],
    event: []
  };

  for (const row of rows) {
    if (!groups[row.source_type]) continue;
    groups[row.source_type].push({
      key: row.source_key,
      name: row.display_name || row.source_key,
      votes: Number(row.vote_count) || 0
    });
  }

  const totals = {};
  const top = {};

  for (const [type, values] of Object.entries(groups)) {
    values.sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
    totals[type] = values.reduce((sum, row) => sum + row.votes, 0);

    for (const row of values) {
      row.percent = totals[type] > 0
        ? Math.round((row.votes / totals[type]) * 1000) / 10
        : 0;
    }

    top[type] = values[0] || null;
  }

  return {
    totalVotes: Object.values(totals).reduce((sum, value) => sum + value, 0),
    totals,
    top,
    groups
  };
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(ITEMS_FILE, "utf8"));
  const items = Array.isArray(catalog.items) ? catalog.items : [];

  const out = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      provider: "MetaForge",
      endpoint: API
    },
    totalItems: items.length,
    queriedItems: 0,
    itemsWithVotes: 0,
    items: {}
  };

  let done = 0;
  let failed = 0;

  for (const item of items) {
    const sourceItemId = item.hasBlueprint
      ? item.blueprint?.id
      : item.source?.itemId;

    if (!sourceItemId) continue;

    const url = new URL(API);
    url.searchParams.set("item_id", sourceItemId);

    try {
      const response = await fetchWithRetry(url);
      const payload = await response.json();
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      const summary = summarize(rows);

      out.items[item.id] = {
        itemId: sourceItemId,
        available: rows.length > 0,
        ...summary
      };

      out.queriedItems += 1;
      if (rows.length > 0) out.itemsWithVotes += 1;
      done += 1;

      if (done % 25 === 0 || done === items.length) {
        console.log(`Votes: ${done}/${items.length} queried, ${out.itemsWithVotes} with data`);
      }

      await wait(75);
    } catch (error) {
      failed += 1;
      console.warn(`Votes failed for ${item.name} (${sourceItemId}): ${error.message}`);
    }
  }

  out.failed = failed;
  out.generatedAt = new Date().toISOString();

  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2) + "\n");

  console.log(JSON.stringify({
    totalItems: out.totalItems,
    queriedItems: out.queriedItems,
    itemsWithVotes: out.itemsWithVotes,
    failed
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
