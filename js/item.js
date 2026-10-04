const params = new URLSearchParams(location.search);
const itemId = params.get("id");

const els = {
  backButton: document.querySelector("#backButton"),
  loading: document.querySelector("#detailLoading"),
  error: document.querySelector("#detailError"),
  hero: document.querySelector("#pageHero"),
  itemMeta: document.querySelector("#itemMeta"),
  finding: document.querySelector("#findingSection"),
  findingTitle: document.querySelector("#findingTitle"),
  findingContext: document.querySelector("#findingContext"),
  metaForge: document.querySelector("#metaForgePanel"),
  arcTracker: document.querySelector("#arcTrackerPanel")
};

const MAP_CONFIG = {
  dam_battlegrounds: {
    label: "Dam Battlegrounds",
    width: 1095, height: 1000,
    image: "assets/maps/dam_battlegrounds.webp"
  },
  the_spaceport: {
    label: "The Spaceport",
    width: 1000, height: 1000,
    image: "assets/maps/the_spaceport.webp"
  },
  buried_city: {
    label: "Buried City",
    width: 1000, height: 1000,
    image: "assets/maps/buried_city.webp"
  },
  the_blue_gate: {
    label: "The Blue Gate",
    layered: true,
    layers: {
      upper: { label: "Superficie", width: 1300, height: 1000, image: "assets/maps/the_blue_gate.webp" },
      lower: { label: "Underground", width: 1000, height: 475, image: "assets/maps/the_blue_gate_underground.webp" }
    }
  },
  stella_montis: {
    label: "Stella Montis",
    layered: true,
    layers: {
      upper: { label: "Upper", width: 1667, height: 1000, image: "assets/maps/stella_montis_upper.webp" },
      lower: { label: "Lower", width: 1400, height: 1000, image: "assets/maps/stella_montis_lower.webp" }
    }
  },
  riven_tides: {
    label: "Riven Tides",
    width: 6144, height: 6144,
    tiled: true
  }
};

const heat = {
  entry: null,
  arcData: null,
  mapId: null,
  condition: "all",
  layer: null,
  scale: 1,
  fitScale: 1,
  tx: 0,
  ty: 0,
  worldWidth: 1000,
  worldHeight: 1000,
  dragging: false,
  pointerId: null,
  lastX: 0,
  lastY: 0,
  initialized: false
};

els.backButton.addEventListener("click", () => {
  try {
    if (document.referrer && new URL(document.referrer).origin === location.origin) {
      history.back();
      return;
    }
  } catch {}
  location.href = "index.html?blueprint=yes";
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initials(name) {
  return String(name).replace(/\([^)]*\)/g, "").split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => part[0]).join("").toUpperCase();
}

function rarityClass(item) {
  return `rarity-${String(item.rarity || "Unknown").toLowerCase()}`;
}

function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .toLowerCase()
    .replace(/\bblueprint\b/g, "")
    .replace(/magazine/g, "mag")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

async function loadJson(url, fallback = null) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

function renderHero(item) {
  const rClass = rarityClass(item);
  const visual = item.image
    ? `<div class="page-hero-image ${rClass}"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}"></div>`
    : `<div class="page-hero-image ${rClass}">${initials(item.name)}</div>`;

  els.hero.innerHTML = `
    ${visual}
    <div class="page-hero-copy">
      <p class="eyebrow">${escapeHtml(item.type)}</p>
      <h1>${escapeHtml(item.name)}</h1>
      <div class="badges">
        <span class="badge ${rClass}">${escapeHtml(item.rarity)}</span>
        ${item.hasBlueprint ? '<span class="badge">Blueprint disponibile</span>' : '<span class="badge">No blueprint</span>'}
      </div>
      ${item.description ? `<p class="page-description">${escapeHtml(item.description)}</p>` : ""}
    </div>
  `;
  els.hero.hidden = false;

  const variants = Array.isArray(item.variants) ? item.variants : [];
  if (variants.length > 1) {
    els.itemMeta.innerHTML = `
      <div class="page-section-heading compact-heading">
        <div><p class="eyebrow">Famiglia</p><h2>Varianti</h2></div>
      </div>
      <div class="variant-list">${variants.map(v => `<span class="variant-pill">${escapeHtml(v.name)}</span>`).join("")}</div>
    `;
    els.itemMeta.hidden = false;
  }
}

function voteRowsHtml(rows = []) {
  return rows.map(row => {
    const label = row.key === "base_container" ? "Container (generico)" : row.name;
    return `
      <div class="vote-row">
        <span>${escapeHtml(label)}</span>
        <span>${formatPercent(row.percent)}</span>
      </div>
    `;
  }).join("");
}

function voteGroupHtml(label, rows = []) {
  if (!rows.length) return "";
  const visible = rows.slice(0, 5);
  const hidden = rows.slice(5);
  return `
    <div class="vote-group">
      <div class="vote-group-title">${escapeHtml(label)}</div>
      <div class="vote-list">
        ${voteRowsHtml(visible)}
        ${hidden.length ? `
          <details class="vote-more">
            <summary>Altro… (+${hidden.length})</summary>
            <div class="vote-more-list">${voteRowsHtml(hidden)}</div>
          </details>
        ` : ""}
      </div>
    </div>
  `;
}

function metaForgePreview(votes) {
  const parts = [];
  if (votes?.totalVotes) parts.push(`${votes.totalVotes} voti`);
  for (const type of ["container", "map", "event"]) {
    const top = votes?.top?.[type];
    if (top) {
      const label = top.key === "base_container" ? "Container (generico)" : top.name;
      parts.push(`${label} ${formatPercent(top.percent)}`);
    }
  }
  return parts.join(" · ");
}

function renderMetaForge(item, votes) {
  if (votes?.available) {
    els.metaForge.innerHTML = `
      <details class="source-panel">
        <summary class="source-panel-summary">
          <div>
            <strong>MetaForge</strong>
            <span class="source-panel-kicker">Player-Voted Locations</span>
          </div>
          <span class="source-panel-preview">${escapeHtml(metaForgePreview(votes))}</span>
          <span class="source-status">dati</span>
        </summary>
        <div class="source-panel-body source-body-votes">
          ${voteGroupHtml("Containers", votes.groups?.container)}
          ${voteGroupHtml("Maps", votes.groups?.map)}
          ${voteGroupHtml("Events", votes.groups?.event)}
        </div>
      </details>
    `;
    return;
  }

  const spawn = item.spawn || {};
  const fallback = [];
  if (spawn.lootArea) fallback.push(`Area: ${spawn.lootArea}`);
  if (spawn.locations?.length) fallback.push(`${spawn.locations.length} location`);

  els.metaForge.innerHTML = `
    <div class="source-panel source-panel-empty">
      <div class="source-panel-summary static-summary">
        <div><strong>MetaForge</strong><span class="source-panel-kicker">Player-Voted Locations</span></div>
        <span class="source-panel-preview">${escapeHtml(fallback.join(" · ") || "Nessun dato community disponibile")}</span>
        <span class="source-status">vuoto</span>
      </div>
    </div>
  `;
}

function findArcEntry(item, arcData) {
  if (!item.hasBlueprint || !arcData?.blueprints) return null;

  const target = normalizeName(item.name);
  const candidates = Object.entries(arcData.blueprints)
    .filter(([name]) => normalizeName(name) === target);

  if (!candidates.length) return null;
  if (candidates.length === 1) return { name: candidates[0][0], data: candidates[0][1] };

  const current = arcData.currentVersion?.versionString;
  candidates.sort((a, b) => {
    const ca = a[1].v?.find(row => row[0] === current)?.[1] || 0;
    const cb = b[1].v?.find(row => row[0] === current)?.[1] || 0;
    return cb - ca;
  });
  return { name: candidates[0][0], data: candidates[0][1] };
}

function countBy(rows, index) {
  const map = new Map();
  for (const row of rows || []) {
    map.set(row[index], (map.get(row[index]) || 0) + Number(row[5] || 1));
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function arcCurrentCount(entry, arcData) {
  const version = arcData.currentVersion?.versionString;
  return entry?.v?.find(row => row[0] === version)?.[1] || 0;
}

function versionHistoryHtml(entry, arcData) {
  const current = arcData.currentVersion?.versionString;
  const rows = entry.v || [];
  return `
    <details class="arc-history">
      <summary>Segnalazioni per versione</summary>
      <div class="arc-history-list">
        ${rows.map(([version, count]) => `
          <div><span>${escapeHtml(version)}${version === current ? " · corrente" : ""}</span><strong>${count}</strong></div>
        `).join("")}
      </div>
    </details>
  `;
}

function containerRowsHtml(rows = []) {
  if (!rows.length) return '<p class="muted-copy">Nessun container indicato nella versione corrente.</p>';
  return `
    <div class="arc-container-list">
      ${rows.map(([name, count, percent]) => `
        <div class="arc-container-row">
          <span>${escapeHtml(name)}</span>
          <span><strong>${count}</strong> · ${formatPercent(percent)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function mapDisplayLayer(mapId, rawLayer) {
  if (mapId === "stella_montis") return Number(rawLayer) === 0 ? "lower" : "upper";
  return Number(rawLayer) === 0 ? "upper" : "lower";
}

function mapConfig(mapId, layer = null) {
  const base = MAP_CONFIG[mapId];
  if (!base) return null;
  if (!base.layered) return base;
  return { ...base.layers[layer || "upper"], label: base.label, mapId, layer };
}

function mapName(mapId) {
  return MAP_CONFIG[mapId]?.label || mapId;
}

function renderArcTracker(item, match, arcData) {
  if (!item.hasBlueprint) {
    els.arcTracker.innerHTML = "";
    return;
  }

  if (!match) {
    els.arcTracker.innerHTML = `
      <div class="source-panel source-panel-empty">
        <div class="source-panel-summary static-summary">
          <div><strong>ArcBlueprintTracker</strong><span class="source-panel-kicker">Community reports</span></div>
          <span class="source-panel-preview">Nessuna corrispondenza nel snapshot HAR</span>
          <span class="source-status">vuoto</span>
        </div>
      </div>
    `;
    return;
  }

  const entry = match.data;
  const current = arcCurrentCount(entry, arcData);
  const mapCounts = countBy(entry.b, 0);
  const conditionCounts = countBy(entry.b, 4);
  const topMap = mapCounts[0] ? mapName(arcData.maps[mapCounts[0][0]]) : "—";
  const topCondition = conditionCounts[0] ? arcData.conditions[conditionCounts[0][0]] : "—";

  els.arcTracker.innerHTML = `
    <section class="source-panel arc-source-panel">
      <div class="source-panel-summary static-summary arc-source-heading">
        <div>
          <strong>ArcBlueprintTracker</strong>
          <span class="source-panel-kicker">Community reports · snapshot HAR</span>
        </div>
        <span class="source-panel-preview">${entry.t} storici · ${current} su ${escapeHtml(arcData.currentVersion.versionString)} · ${escapeHtml(topMap)} · ${escapeHtml(topCondition)}</span>
        <span class="source-status">dati</span>
      </div>

      <div class="source-panel-body arc-panel-body">
        <div class="arc-stat-grid">
          <div class="arc-stat">
            <span>Storico</span>
            <strong>${entry.t}</strong>
            <small>segnalazioni totali</small>
          </div>
          <div class="arc-stat current-stat">
            <span>${escapeHtml(arcData.currentVersion.name)}</span>
            <strong>${current}</strong>
            <small>versione ${escapeHtml(arcData.currentVersion.versionString)}</small>
          </div>
          <div class="arc-stat">
            <span>Mappa principale</span>
            <strong class="stat-text">${escapeHtml(topMap)}</strong>
            <small>versione corrente</small>
          </div>
          <div class="arc-stat">
            <span>Condizione</span>
            <strong class="stat-text">${escapeHtml(topCondition)}</strong>
            <small>più segnalata</small>
          </div>
        </div>

        ${versionHistoryHtml(entry, arcData)}

        <div class="arc-current-grid">
          <div>
            <h3>Container · ${escapeHtml(arcData.currentVersion.versionString)}</h3>
            ${containerRowsHtml(entry.cn)}
          </div>
          <div>
            <h3>Heatmap · ${escapeHtml(arcData.currentVersion.versionString)}</h3>
            <p class="muted-copy">Mappa reale con densità delle segnalazioni della versione corrente.</p>
          </div>
        </div>

        <div id="heatmapControls" class="heatmap-controls"></div>
        <div id="heatmapViewport" class="heatmap-viewport" aria-label="Heatmap blueprint">
          <div id="heatmapWorld" class="heatmap-world"></div>
          <div id="heatmapOverlay" class="heatmap-overlay"></div>
          <div class="heatmap-zoom">
            <button id="heatZoomIn" type="button" aria-label="Zoom avanti">+</button>
            <button id="heatZoomOut" type="button" aria-label="Zoom indietro">−</button>
            <button id="heatReset" type="button">Reset</button>
          </div>
          <div class="heatmap-legend">
            <span>bassa</span>
            <i class="legend-gradient"></i>
            <span>alta</span>
          </div>
        </div>
      </div>
    </section>
  `;

  heat.entry = entry;
  heat.arcData = arcData;
  const availableMaps = mapCounts.map(([index]) => arcData.maps[index]).filter(id => MAP_CONFIG[id]);
  heat.mapId = availableMaps[0] || null;
  heat.condition = "all";
  heat.layer = defaultLayerForMap(heat.mapId);
  setupHeatmap();
}

function defaultLayerForMap(mapId) {
  if (!MAP_CONFIG[mapId]?.layered || !heat.entry) return null;
  const index = heat.arcData.maps.indexOf(mapId);
  const counts = new Map();
  for (const row of heat.entry.b || []) {
    if (row[0] !== index) continue;
    const layer = mapDisplayLayer(mapId, row[3]);
    counts.set(layer, (counts.get(layer) || 0) + Number(row[5] || 1));
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "upper";
}

function setupHeatmap() {
  renderHeatControls();
  buildMapWorld();
  bindHeatmapNavigation();
  requestAnimationFrame(resetHeatView);
}

function availableMapCounts() {
  return countBy(heat.entry?.b, 0)
    .map(([index, count]) => ({ id: heat.arcData.maps[index], count }))
    .filter(row => MAP_CONFIG[row.id]);
}

function availableConditions() {
  const mapIndex = heat.arcData.maps.indexOf(heat.mapId);
  const counts = new Map();
  for (const row of heat.entry?.b || []) {
    if (row[0] !== mapIndex) continue;
    if (MAP_CONFIG[heat.mapId]?.layered && heat.layer && mapDisplayLayer(heat.mapId, row[3]) !== heat.layer) continue;
    const id = row[4];
    counts.set(id, (counts.get(id) || 0) + Number(row[5] || 1));
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function renderHeatControls() {
  const container = document.querySelector("#heatmapControls");
  if (!container || !heat.mapId) return;

  const maps = availableMapCounts();
  const conditions = availableConditions();
  const layered = MAP_CONFIG[heat.mapId]?.layered;

  container.innerHTML = `
    <div class="heat-control-group">
      <span class="heat-control-label">Mappa</span>
      <div class="heat-chip-row">
        ${maps.map(({ id, count }) => `
          <button type="button" class="heat-chip" data-map="${escapeHtml(id)}" aria-pressed="${id === heat.mapId}">
            ${escapeHtml(mapName(id))} <small>${count}</small>
          </button>
        `).join("")}
      </div>
    </div>

    ${layered ? `
      <div class="heat-control-group">
        <span class="heat-control-label">Livello</span>
        <div class="heat-chip-row">
          ${["upper", "lower"].map(layer => `
            <button type="button" class="heat-chip" data-layer="${layer}" aria-pressed="${layer === heat.layer}">
              ${escapeHtml(MAP_CONFIG[heat.mapId].layers[layer].label)}
            </button>
          `).join("")}
        </div>
      </div>
    ` : ""}

    <label class="heat-condition">
      <span class="heat-control-label">Condizione</span>
      <select id="heatConditionSelect">
        <option value="all">Tutte</option>
        ${conditions.map(([index, count]) => `
          <option value="${index}" ${String(index) === String(heat.condition) ? "selected" : ""}>
            ${escapeHtml(heat.arcData.conditions[index])} (${count})
          </option>
        `).join("")}
      </select>
    </label>
  `;

  container.querySelectorAll("[data-map]").forEach(button => {
    button.addEventListener("click", () => {
      heat.mapId = button.dataset.map;
      heat.layer = defaultLayerForMap(heat.mapId);
      heat.condition = "all";
      renderHeatControls();
      buildMapWorld();
      resetHeatView();
    });
  });

  container.querySelectorAll("[data-layer]").forEach(button => {
    button.addEventListener("click", () => {
      heat.layer = button.dataset.layer;
      heat.condition = "all";
      renderHeatControls();
      buildMapWorld();
      resetHeatView();
    });
  });

  container.querySelector("#heatConditionSelect")?.addEventListener("change", event => {
    heat.condition = event.target.value;
    renderHeatSpots();
  });
}

function buildMapWorld() {
  const world = document.querySelector("#heatmapWorld");
  const config = mapConfig(heat.mapId, heat.layer);
  if (!world || !config) return;

  heat.worldWidth = config.width;
  heat.worldHeight = config.height;
  world.style.width = `${config.width}px`;
  world.style.height = `${config.height}px`;
  world.replaceChildren();

  if (MAP_CONFIG[heat.mapId]?.tiled) {
    const tileSize = 2048;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const img = document.createElement("img");
        img.className = "map-tile";
        img.src = `assets/maps/riven_tides/tiles/map_${col}_${2 - row}.jpg`;
        img.alt = "";
        img.draggable = false;
        Object.assign(img.style, {
          left: `${col * tileSize}px`,
          top: `${row * tileSize}px`,
          width: `${tileSize}px`,
          height: `${tileSize}px`
        });
        world.append(img);
      }
    }
  } else {
    const img = document.createElement("img");
    img.className = "map-image";
    img.src = config.image;
    img.alt = mapName(heat.mapId);
    img.draggable = false;
    world.append(img);
  }
}

function filteredHeatBins() {
  const mapIndex = heat.arcData.maps.indexOf(heat.mapId);
  const grouped = new Map();

  for (const row of heat.entry?.b || []) {
    const [mi, x, y, rawLayer, conditionIndex, count] = row;
    if (mi !== mapIndex) continue;
    if (MAP_CONFIG[heat.mapId]?.layered && heat.layer && mapDisplayLayer(heat.mapId, rawLayer) !== heat.layer) continue;
    if (heat.condition !== "all" && String(conditionIndex) !== String(heat.condition)) continue;

    const key = `${x}:${y}`;
    const old = grouped.get(key);
    if (old) old.count += Number(count || 1);
    else grouped.set(key, { x, y, count: Number(count || 1) });
  }

  return [...grouped.values()];
}

function renderHeatSpots() {
  const overlay = document.querySelector("#heatmapOverlay");
  if (!overlay) return;
  overlay.replaceChildren();

  const bins = filteredHeatBins();
  const max = Math.max(1, ...bins.map(point => point.count));

  for (const point of bins) {
    const sx = heat.tx + point.x * heat.scale;
    const sy = heat.ty + (heat.worldHeight - point.y) * heat.scale;
    const ratio = point.count / max;
    const size = 22 + ratio * 46;
    const hue = 120 - ratio * 120;
    const opacity = .48 + ratio * .42;

    const spot = document.createElement("div");
    spot.className = "heat-spot";
    spot.style.left = `${sx}px`;
    spot.style.top = `${sy}px`;
    spot.style.width = `${size}px`;
    spot.style.height = `${size}px`;
    spot.style.opacity = String(opacity);
    spot.style.background = `radial-gradient(circle, hsla(${hue}, 88%, 50%, .95) 0%, hsla(${hue}, 88%, 50%, .55) 56%, hsla(${hue}, 88%, 50%, 0) 76%)`;
    spot.title = `${point.count} segnalazion${point.count === 1 ? "e" : "i"}`;
    overlay.append(spot);
  }
}

function applyHeatTransform() {
  const world = document.querySelector("#heatmapWorld");
  if (!world) return;
  world.style.transform = `translate(${heat.tx}px, ${heat.ty}px) scale(${heat.scale})`;
  renderHeatSpots();
}

function resetHeatView() {
  const viewport = document.querySelector("#heatmapViewport");
  if (!viewport || !heat.worldWidth || !heat.worldHeight) return;
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  if (!w || !h) return;

  heat.fitScale = Math.min((w - 24) / heat.worldWidth, (h - 24) / heat.worldHeight);
  heat.scale = heat.fitScale;
  heat.tx = (w - heat.worldWidth * heat.scale) / 2;
  heat.ty = (h - heat.worldHeight * heat.scale) / 2;
  applyHeatTransform();
}

function zoomHeat(factor, cx = null, cy = null) {
  const viewport = document.querySelector("#heatmapViewport");
  if (!viewport) return;
  const old = heat.scale;
  const min = heat.fitScale * .8;
  const max = heat.fitScale * 8;
  const next = Math.max(min, Math.min(max, old * factor));
  if (next === old) return;

  const x = cx ?? viewport.clientWidth / 2;
  const y = cy ?? viewport.clientHeight / 2;
  const ratio = next / old;
  heat.tx = x - (x - heat.tx) * ratio;
  heat.ty = y - (y - heat.ty) * ratio;
  heat.scale = next;
  applyHeatTransform();
}

function bindHeatmapNavigation() {
  const viewport = document.querySelector("#heatmapViewport");
  if (!viewport || viewport.dataset.bound === "1") return;
  viewport.dataset.bound = "1";

  viewport.addEventListener("wheel", event => {
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    zoomHeat(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });

  viewport.addEventListener("pointerdown", event => {
    if (event.target.closest(".heatmap-zoom")) return;
    heat.dragging = true;
    heat.pointerId = event.pointerId;
    heat.lastX = event.clientX;
    heat.lastY = event.clientY;
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("is-dragging");
  });

  viewport.addEventListener("pointermove", event => {
    if (!heat.dragging || event.pointerId !== heat.pointerId) return;
    heat.tx += event.clientX - heat.lastX;
    heat.ty += event.clientY - heat.lastY;
    heat.lastX = event.clientX;
    heat.lastY = event.clientY;
    applyHeatTransform();
  });

  const endDrag = event => {
    if (event.pointerId !== heat.pointerId) return;
    heat.dragging = false;
    heat.pointerId = null;
    viewport.classList.remove("is-dragging");
  };
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);

  document.querySelector("#heatZoomIn")?.addEventListener("click", () => zoomHeat(1.25));
  document.querySelector("#heatZoomOut")?.addEventListener("click", () => zoomHeat(1 / 1.25));
  document.querySelector("#heatReset")?.addEventListener("click", resetHeatView);

  new ResizeObserver(() => resetHeatView()).observe(viewport);
}

async function init() {
  if (!itemId) throw new Error("ID oggetto mancante.");

  const [catalog, voteCache, arcData] = await Promise.all([
    loadJson("data/items.json"),
    loadJson("data/metaforge-location-votes.json", { items: {} }),
    loadJson("data/arctracker-ui.json", null)
  ]);

  const item = catalog?.items?.find(entry => entry.id === itemId);
  if (!item) throw new Error("Oggetto non trovato nel catalogo.");

  document.title = `${item.name} · ARC BP Track`;
  renderHero(item);

  const target = item.hasBlueprint ? "Blueprint" : "oggetto";
  els.findingTitle.textContent = `Dove trovare il ${target}`;
  els.findingContext.textContent = `Dati mostrati: spawn del ${target.toLowerCase()}. Le fonti restano separate per rendere chiaro da dove arriva ogni informazione.`;
  els.finding.hidden = false;

  renderMetaForge(item, voteCache?.items?.[item.id] || null);
  renderArcTracker(item, findArcEntry(item, arcData), arcData);

  els.loading.hidden = true;
}

init().catch(error => {
  console.error(error);
  els.loading.hidden = true;
  els.error.hidden = false;
  els.error.textContent = error.message || "Impossibile caricare il dettaglio.";
});
