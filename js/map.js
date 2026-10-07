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

const state = {
  arc: null,
  mapId: "stella_montis",
  layer: null,
  condition: "all",
  selected: new Set(),
  stats: [],
  scale: 1,
  fitScale: 1,
  tx: 0,
  ty: 0,
  worldWidth: 1000,
  worldHeight: 1000,
  dragging: false,
  pointerId: null,
  lastX: 0,
  lastY: 0
};

const els = {
  versionBadge: document.querySelector("#versionBadge"),
  mapSelector: document.querySelector("#mapSelector"),
  layerSelector: document.querySelector("#layerSelector"),
  conditionSelect: document.querySelector("#conditionSelect"),
  mapStats: document.querySelector("#mapStats"),
  exclusiveTable: document.querySelector("#exclusiveTable"),
  sharedTable: document.querySelector("#sharedTable"),
  selectExclusive: document.querySelector("#selectExclusive"),
  selectTop: document.querySelector("#selectTop"),
  clearSelected: document.querySelector("#clearSelected"),
  selectedBlueprints: document.querySelector("#selectedBlueprints"),
  heatmapTitle: document.querySelector("#heatmapTitle"),
  heatmapSubtitle: document.querySelector("#heatmapSubtitle"),
  viewport: document.querySelector("#mapHeatViewport"),
  world: document.querySelector("#mapHeatWorld"),
  overlay: document.querySelector("#mapHeatOverlay"),
  empty: document.querySelector("#heatmapEmpty"),
  zoomIn: document.querySelector("#mapZoomIn"),
  zoomOut: document.querySelector("#mapZoomOut"),
  reset: document.querySelector("#mapReset")
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Impossibile caricare ${url}`);
  return await response.json();
}

function currentVersion() {
  return state.arc?.currentVersion?.versionString || "";
}

function mapName(mapId) {
  return MAP_CONFIG[mapId]?.label || mapId;
}

function mapDisplayLayer(mapId, rawLayer) {
  if (mapId === "stella_montis") return Number(rawLayer) === 0 ? "lower" : "upper";
  return Number(rawLayer) === 0 ? "upper" : "lower";
}

function mapConfig(mapId = state.mapId, layer = state.layer) {
  const base = MAP_CONFIG[mapId];
  if (!base) return null;
  if (!base.layered) return base;
  return { ...base.layers[layer || "upper"], label: base.label, mapId, layer };
}

function currentCount(entry) {
  const version = currentVersion();
  return entry?.v?.find(row => row[0] === version)?.[1] || 0;
}

function reportsOnMap(entry, mapIndex) {
  return (entry?.b || []).reduce((sum, row) => {
    return sum + (row[0] === mapIndex ? Number(row[5] || 1) : 0);
  }, 0);
}

function sampleLabel(count) {
  if (count >= 15) return "ampio";
  if (count >= 5) return "discreto";
  return "debole";
}

function sampleClass(count) {
  if (count >= 15) return "sample-high";
  if (count >= 5) return "sample-mid";
  return "sample-low";
}

function buildStats() {
  const mapIndex = state.arc.maps.indexOf(state.mapId);
  const rows = [];

  for (const [name, entry] of Object.entries(state.arc.blueprints || {})) {
    const total = currentCount(entry);
    if (!total) continue;

    const mapReports = reportsOnMap(entry, mapIndex);
    if (!mapReports) continue;

    const concentration = Number(((mapReports / total) * 100).toFixed(1));
    rows.push({
      name,
      entry,
      currentTotal: total,
      mapReports,
      concentration,
      exclusive: mapReports === total,
      historical: Number(entry.t || 0)
    });
  }

  rows.sort((a, b) =>
    Number(b.exclusive) - Number(a.exclusive)
    || b.concentration - a.concentration
    || b.mapReports - a.mapReports
    || a.name.localeCompare(b.name)
  );

  state.stats = rows;
}

function defaultLayer() {
  if (!MAP_CONFIG[state.mapId]?.layered) return null;
  const mapIndex = state.arc.maps.indexOf(state.mapId);
  const counts = new Map();

  for (const row of state.stats) {
    for (const bin of row.entry.b || []) {
      if (bin[0] !== mapIndex) continue;
      const layer = mapDisplayLayer(state.mapId, bin[3]);
      counts.set(layer, (counts.get(layer) || 0) + Number(bin[5] || 1));
    }
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "upper";
}

function totalReportsOnSelectedMap() {
  return state.stats.reduce((sum, row) => sum + row.mapReports, 0);
}

function renderMapSelector() {
  els.mapSelector.innerHTML = state.arc.maps
    .filter(id => MAP_CONFIG[id])
    .map(id => {
      const count = (() => {
        const index = state.arc.maps.indexOf(id);
        let total = 0;
        for (const entry of Object.values(state.arc.blueprints || {})) {
          total += reportsOnMap(entry, index);
        }
        return total;
      })();

      return `
        <button type="button" class="heat-chip" data-map="${escapeHtml(id)}" aria-pressed="${id === state.mapId}">
          ${escapeHtml(mapName(id))} <small>${count}</small>
        </button>
      `;
    }).join("");

  els.mapSelector.querySelectorAll("[data-map]").forEach(button => {
    button.addEventListener("click", () => {
      changeMap(button.dataset.map);
    });
  });
}

function renderLayerSelector() {
  const config = MAP_CONFIG[state.mapId];
  if (!config?.layered) {
    els.layerSelector.innerHTML = "";
    return;
  }

  els.layerSelector.innerHTML = `
    <span class="heat-control-label">Livello</span>
    <div class="heat-chip-row">
      ${["upper", "lower"].map(layer => `
        <button type="button" class="heat-chip" data-layer="${layer}" aria-pressed="${state.layer === layer}">
          ${escapeHtml(config.layers[layer].label)}
        </button>
      `).join("")}
    </div>
  `;

  els.layerSelector.querySelectorAll("[data-layer]").forEach(button => {
    button.addEventListener("click", () => {
      state.layer = button.dataset.layer;
      state.condition = "all";
      syncUrl();
      renderLayerSelector();
      renderConditions();
      buildMapWorld();
      resetHeatView();
    });
  });
}

function conditionCounts() {
  const mapIndex = state.arc.maps.indexOf(state.mapId);
  const source = state.selected.size
    ? state.stats.filter(row => state.selected.has(row.name))
    : state.stats;

  const counts = new Map();
  for (const row of source) {
    for (const bin of row.entry.b || []) {
      if (bin[0] !== mapIndex) continue;
      if (MAP_CONFIG[state.mapId]?.layered && state.layer && mapDisplayLayer(state.mapId, bin[3]) !== state.layer) continue;
      const condition = bin[4];
      counts.set(condition, (counts.get(condition) || 0) + Number(bin[5] || 1));
    }
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function renderConditions() {
  const counts = conditionCounts();
  els.conditionSelect.innerHTML = `
    <option value="all">Tutte</option>
    ${counts.map(([index, count]) => `
      <option value="${index}" ${String(state.condition) === String(index) ? "selected" : ""}>
        ${escapeHtml(state.arc.conditions[index])} (${count})
      </option>
    `).join("")}
  `;

  if (state.condition !== "all" && !counts.some(([index]) => String(index) === String(state.condition))) {
    state.condition = "all";
    els.conditionSelect.value = "all";
  }
}

function renderStats() {
  const exclusive = state.stats.filter(row => row.exclusive);
  els.mapStats.innerHTML = `
    <div class="map-stat"><span>Versione</span><strong>${escapeHtml(currentVersion())}</strong><small>${escapeHtml(state.arc.currentVersion?.name || "")}</small></div>
    <div class="map-stat"><span>Segnalazioni</span><strong>${totalReportsOnSelectedMap()}</strong><small>su ${escapeHtml(mapName(state.mapId))}</small></div>
    <div class="map-stat"><span>Blueprint</span><strong>${state.stats.length}</strong><small>segnalati sulla mappa</small></div>
    <div class="map-stat"><span>Solo qui</span><strong>${exclusive.length}</strong><small>nella versione corrente</small></div>
  `;
}

function blueprintTable(title, rows, emptyText) {
  if (!rows.length) {
    return `
      <section class="bp-map-table-section">
        <h3>${escapeHtml(title)}</h3>
        <p class="muted-copy">${escapeHtml(emptyText)}</p>
      </section>
    `;
  }

  return `
    <section class="bp-map-table-section">
      <h3>${escapeHtml(title)} <small>${rows.length}</small></h3>
      <div class="bp-map-table">
        <div class="bp-map-row bp-map-row-head">
          <span>Blueprint</span>
          <span>Report</span>
          <span>Quota</span>
          <span>Campione</span>
        </div>
        ${rows.map(row => `
          <button type="button" class="bp-map-row" data-blueprint="${escapeHtml(row.name)}" aria-pressed="${state.selected.has(row.name)}">
            <span class="bp-map-name">
              <i class="bp-map-check" aria-hidden="true"></i>
              <strong>${escapeHtml(row.name)}</strong>
            </span>
            <span>${row.mapReports}/${row.currentTotal}</span>
            <span><strong>${row.concentration}%</strong></span>
            <span class="bp-sample ${sampleClass(row.mapReports)}">${sampleLabel(row.mapReports)}</span>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function renderTables() {
  const exclusive = state.stats
    .filter(row => row.exclusive)
    .sort((a, b) => b.mapReports - a.mapReports || a.name.localeCompare(b.name));

  const shared = state.stats
    .filter(row => !row.exclusive)
    .sort((a, b) => b.concentration - a.concentration || b.mapReports - a.mapReports || a.name.localeCompare(b.name));

  els.exclusiveTable.innerHTML = blueprintTable(
    "Segnalati solo su questa mappa",
    exclusive,
    "Nessun blueprint risulta esclusivo di questa mappa nello snapshot corrente."
  );

  els.sharedTable.innerHTML = blueprintTable(
    "Segnalati anche altrove",
    shared,
    "Nessun altro blueprint segnalato."
  );

  document.querySelectorAll("[data-blueprint]").forEach(button => {
    button.addEventListener("click", () => {
      toggleBlueprint(button.dataset.blueprint);
    });
  });
}

function renderSelected() {
  const names = [...state.selected];
  els.selectedBlueprints.innerHTML = names.length
    ? names.map(name => `
        <button type="button" class="selected-blueprint-pill" data-remove-blueprint="${escapeHtml(name)}">
          ${escapeHtml(name)} <span>×</span>
        </button>
      `).join("")
    : '<span class="muted-copy">Nessun blueprint selezionato.</span>';

  els.selectedBlueprints.querySelectorAll("[data-remove-blueprint]").forEach(button => {
    button.addEventListener("click", () => toggleBlueprint(button.dataset.removeBlueprint));
  });

  els.heatmapTitle.textContent = names.length
    ? `${names.length} blueprint · ${mapName(state.mapId)}`
    : "Seleziona i blueprint";

  const reports = selectedReportCount();
  els.heatmapSubtitle.textContent = names.length
    ? `${reports} segnalazioni incluse · ${currentVersion()} · heatmap combinata`
    : `Versione ${currentVersion()} · scegli una o più righe dalla tabella.`;

  els.empty.hidden = names.length > 0;
}

function selectedReportCount() {
  const mapIndex = state.arc.maps.indexOf(state.mapId);
  let total = 0;

  for (const row of state.stats) {
    if (!state.selected.has(row.name)) continue;
    for (const bin of row.entry.b || []) {
      if (bin[0] !== mapIndex) continue;
      if (MAP_CONFIG[state.mapId]?.layered && state.layer && mapDisplayLayer(state.mapId, bin[3]) !== state.layer) continue;
      if (state.condition !== "all" && String(bin[4]) !== String(state.condition)) continue;
      total += Number(bin[5] || 1);
    }
  }
  return total;
}

function toggleBlueprint(name) {
  if (state.selected.has(name)) state.selected.delete(name);
  else state.selected.add(name);

  state.condition = "all";
  syncUrl();
  renderTables();
  renderSelected();
  renderConditions();
  renderHeatSpots();
}

function setSelection(names) {
  state.selected = new Set(names.filter(name => state.stats.some(row => row.name === name)));
  state.condition = "all";
  syncUrl();
  renderTables();
  renderSelected();
  renderConditions();
  renderHeatSpots();
}

function changeMap(mapId) {
  if (!MAP_CONFIG[mapId]) return;
  state.mapId = mapId;
  buildStats();
  state.layer = defaultLayer();
  state.condition = "all";

  const exclusive = state.stats.filter(row => row.exclusive);
  const defaults = exclusive.length
    ? exclusive.map(row => row.name)
    : state.stats.slice(0, 3).map(row => row.name);
  state.selected = new Set(defaults);

  syncUrl();
  renderAll();
  buildMapWorld();
  resetHeatView();
}

function syncUrl() {
  const p = new URLSearchParams();
  p.set("map", state.mapId);
  if (state.layer) p.set("layer", state.layer);
  if (state.condition !== "all") p.set("condition", state.condition);
  for (const name of state.selected) p.append("bp", name);
  history.replaceState(null, "", `${location.pathname}?${p.toString()}`);
}

function renderAll() {
  renderMapSelector();
  renderLayerSelector();
  renderConditions();
  renderStats();
  renderTables();
  renderSelected();
}

function buildMapWorld() {
  const config = mapConfig();
  if (!config) return;

  state.worldWidth = config.width;
  state.worldHeight = config.height;
  els.world.style.width = `${config.width}px`;
  els.world.style.height = `${config.height}px`;
  els.world.replaceChildren();

  if (MAP_CONFIG[state.mapId]?.tiled) {
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
        els.world.append(img);
      }
    }
  } else {
    const img = document.createElement("img");
    img.className = "map-image";
    img.src = config.image;
    img.alt = mapName(state.mapId);
    img.draggable = false;
    els.world.append(img);
  }
}

function filteredHeatBins() {
  if (!state.selected.size) return [];

  const mapIndex = state.arc.maps.indexOf(state.mapId);
  const grouped = new Map();

  for (const row of state.stats) {
    if (!state.selected.has(row.name)) continue;

    for (const bin of row.entry.b || []) {
      const [mi, x, y, rawLayer, conditionIndex, count] = bin;
      if (mi !== mapIndex) continue;
      if (MAP_CONFIG[state.mapId]?.layered && state.layer && mapDisplayLayer(state.mapId, rawLayer) !== state.layer) continue;
      if (state.condition !== "all" && String(conditionIndex) !== String(state.condition)) continue;

      const key = `${x}:${y}`;
      const old = grouped.get(key);
      if (old) {
        old.count += Number(count || 1);
        old.blueprints.add(row.name);
      } else {
        grouped.set(key, {
          x: Number(x),
          y: Number(y),
          count: Number(count || 1),
          blueprints: new Set([row.name])
        });
      }
    }
  }

  return [...grouped.values()];
}

function renderHeatSpots() {
  els.overlay.replaceChildren();
  const bins = filteredHeatBins();
  const max = Math.max(1, ...bins.map(point => point.count));

  for (const point of bins) {
    const sx = state.tx + point.x * state.scale;
    const sy = state.ty + (state.worldHeight - point.y) * state.scale;
    const ratio = point.count / max;
    const size = 24 + ratio * 54;
    const hue = 120 - ratio * 120;
    const opacity = .44 + ratio * .46;

    const spot = document.createElement("div");
    spot.className = "heat-spot";
    spot.style.left = `${sx}px`;
    spot.style.top = `${sy}px`;
    spot.style.width = `${size}px`;
    spot.style.height = `${size}px`;
    spot.style.opacity = String(opacity);
    spot.style.background = `radial-gradient(circle, hsla(${hue}, 90%, 50%, .98) 0%, hsla(${hue}, 90%, 50%, .62) 45%, hsla(${hue}, 90%, 50%, .22) 65%, hsla(${hue}, 90%, 50%, 0) 80%)`;
    spot.title = `${point.count} segnalazioni · ${[...point.blueprints].join(", ")}`;
    els.overlay.append(spot);
  }

  renderSelected();
}

function applyHeatTransform() {
  els.world.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
  renderHeatSpots();
}

function resetHeatView() {
  if (!els.viewport || !state.worldWidth || !state.worldHeight) return;
  const width = els.viewport.clientWidth;
  const height = els.viewport.clientHeight;
  if (!width || !height) return;

  state.fitScale = Math.min(
    (width - 24) / state.worldWidth,
    (height - 24) / state.worldHeight
  );
  state.scale = state.fitScale;
  state.tx = (width - state.worldWidth * state.scale) / 2;
  state.ty = (height - state.worldHeight * state.scale) / 2;
  applyHeatTransform();
}

function zoomHeat(factor, cx = null, cy = null) {
  const old = state.scale;
  const min = state.fitScale * .8;
  const max = state.fitScale * 8;
  const next = Math.max(min, Math.min(max, old * factor));
  if (next === old) return;

  const x = cx ?? els.viewport.clientWidth / 2;
  const y = cy ?? els.viewport.clientHeight / 2;
  const ratio = next / old;
  state.tx = x - (x - state.tx) * ratio;
  state.ty = y - (y - state.ty) * ratio;
  state.scale = next;
  applyHeatTransform();
}

function bindNavigation() {
  els.viewport.addEventListener("wheel", event => {
    event.preventDefault();
    const rect = els.viewport.getBoundingClientRect();
    zoomHeat(
      event.deltaY < 0 ? 1.15 : 1 / 1.15,
      event.clientX - rect.left,
      event.clientY - rect.top
    );
  }, { passive: false });

  els.viewport.addEventListener("pointerdown", event => {
    if (event.target.closest(".heatmap-zoom")) return;
    state.dragging = true;
    state.pointerId = event.pointerId;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    els.viewport.setPointerCapture(event.pointerId);
    els.viewport.classList.add("is-dragging");
  });

  els.viewport.addEventListener("pointermove", event => {
    if (!state.dragging || event.pointerId !== state.pointerId) return;
    state.tx += event.clientX - state.lastX;
    state.ty += event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    applyHeatTransform();
  });

  const endDrag = event => {
    if (event.pointerId !== state.pointerId) return;
    state.dragging = false;
    state.pointerId = null;
    els.viewport.classList.remove("is-dragging");
  };

  els.viewport.addEventListener("pointerup", endDrag);
  els.viewport.addEventListener("pointercancel", endDrag);

  els.zoomIn.addEventListener("click", () => zoomHeat(1.25));
  els.zoomOut.addEventListener("click", () => zoomHeat(1 / 1.25));
  els.reset.addEventListener("click", resetHeatView);

  new ResizeObserver(() => resetHeatView()).observe(els.viewport);
}

function readUrlSelection() {
  const p = new URLSearchParams(location.search);
  const requestedMap = p.get("map");
  if (requestedMap && MAP_CONFIG[requestedMap] && state.arc.maps.includes(requestedMap)) {
    state.mapId = requestedMap;
  }

  buildStats();

  const requestedLayer = p.get("layer");
  const config = MAP_CONFIG[state.mapId];
  if (config?.layered && ["upper", "lower"].includes(requestedLayer)) {
    state.layer = requestedLayer;
  } else {
    state.layer = defaultLayer();
  }

  const requested = p.getAll("bp").filter(name => state.stats.some(row => row.name === name));
  if (requested.length) {
    state.selected = new Set(requested);
  } else {
    const exclusive = state.stats.filter(row => row.exclusive);
    state.selected = new Set(
      (exclusive.length ? exclusive : state.stats.slice(0, 3)).map(row => row.name)
    );
  }

  const requestedCondition = p.get("condition");
  state.condition = requestedCondition || "all";
}

els.conditionSelect.addEventListener("change", event => {
  state.condition = event.target.value;
  syncUrl();
  renderSelected();
  renderHeatSpots();
});

els.selectExclusive.addEventListener("click", () => {
  setSelection(state.stats.filter(row => row.exclusive).map(row => row.name));
});

els.selectTop.addEventListener("click", () => {
  setSelection(state.stats.slice(0, 5).map(row => row.name));
});

els.clearSelected.addEventListener("click", () => setSelection([]));

async function init() {
  state.arc = await loadJson("data/arctracker-ui.json");

  els.versionBadge.innerHTML = `
    <span>Versione spaziale</span>
    <strong>${escapeHtml(state.arc.currentVersion.versionString)}</strong>
    <small>${escapeHtml(state.arc.currentVersion.name)} · ${state.arc.currentVersion.reports} report</small>
  `;

  readUrlSelection();
  renderAll();
  buildMapWorld();
  bindNavigation();
  syncUrl();
  requestAnimationFrame(resetHeatView);
}

init().catch(error => {
  console.error(error);
  document.querySelector(".map-page-shell").innerHTML = `
    <div class="empty-state">${escapeHtml(error.message || "Impossibile caricare la vista per mappa.")}</div>
  `;
});
