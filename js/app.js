const MAIN_TYPES = ["Weapon", "Mod", "Grenade", "Quick Use", "Augment", "Material"];
const rarityOrder = ["Legendary", "Epic", "Rare", "Uncommon", "Common", "Unknown"];

const state = {
  items: [],
  type: "All",
  rarity: "All",
  blueprint: "Yes",
  query: "",
  sort: "name",
  showOtherTypes: false
};

const els = {
  grid: document.querySelector("#grid"),
  visibleCount: document.querySelector("#visibleCount"),
  searchInput: document.querySelector("#searchInput"),
  typeFilters: document.querySelector("#typeFilters"),
  rarityFilters: document.querySelector("#rarityFilters"),
  blueprintFilters: document.querySelector("#blueprintFilters"),
  sortSelect: document.querySelector("#sortSelect"),
  clearFilters: document.querySelector("#clearFilters"),
  emptyState: document.querySelector("#emptyState"),
  weeklyTrials: document.querySelector("#weeklyTrials"),
  weeklyMeta: document.querySelector("#weeklyMeta"),
  weeklyCurrent: document.querySelector("#weeklyCurrent"),
  weeklyUpcoming: document.querySelector("#weeklyUpcoming"),
  weeklyUpcomingGrid: document.querySelector("#weeklyUpcomingGrid"),
  weeklyUpcomingToggle: document.querySelector("#weeklyUpcomingToggle")
};

function readUrlState() {
  const p = new URLSearchParams(location.search);
  const bp = (p.get("blueprint") || "yes").toLowerCase();
  state.blueprint = bp === "no" ? "No" : bp === "all" ? "All" : "Yes";
  state.type = p.get("type") || "All";
  state.rarity = p.get("rarity") || "All";
  state.query = p.get("q") || "";
  state.sort = ["name", "rarity", "type"].includes(p.get("sort")) ? p.get("sort") : "name";
  state.showOtherTypes = p.get("other") === "1"
    || (state.type !== "All" && !MAIN_TYPES.includes(state.type));
}

function syncUrl() {
  const p = new URLSearchParams();
  p.set("blueprint", state.blueprint.toLowerCase());
  if (state.type !== "All") p.set("type", state.type);
  if (state.rarity !== "All") p.set("rarity", state.rarity);
  if (state.query.trim()) p.set("q", state.query.trim());
  if (state.sort !== "name") p.set("sort", state.sort);
  if (state.showOtherTypes) p.set("other", "1");
  history.replaceState(null, "", `${location.pathname}?${p.toString()}`);
}

async function loadCatalog() {
  readUrlState();

  let data;
  try {
    const response = await fetch("data/items.json", { cache: "no-store" });
    if (!response.ok) throw new Error("items.json not available");
    data = await response.json();
  } catch {
    const response = await fetch("data/blueprints.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Catalog load failed: ${response.status}`);
    data = await response.json();
  }

  state.items = (data.items || []).map(item => ({
    ...item,
    hasBlueprint: typeof item.hasBlueprint === "boolean" ? item.hasBlueprint : true,
    isPrimaryType: item.isPrimaryType ?? MAIN_TYPES.includes(item.type)
  }));

  els.searchInput.value = state.query;
  els.sortSelect.value = state.sort;
  render();
  restoreScroll();
}

function queryMatches(item) {
  const query = state.query.trim().toLowerCase();
  return !query || item.name.toLowerCase().includes(query);
}

function matchesBlueprint(item, value = state.blueprint) {
  return value === "All"
    || (value === "Yes" && item.hasBlueprint)
    || (value === "No" && !item.hasBlueprint);
}

function matchesType(item, value = state.type) {
  return value === "All" || item.type === value;
}

function matchesRarity(item, value = state.rarity) {
  return value === "All" || item.rarity === value;
}

function facetBase(ignore) {
  return state.items.filter(item => {
    if (!queryMatches(item)) return false;
    if (ignore !== "type" && !matchesType(item)) return false;
    if (ignore !== "rarity" && !matchesRarity(item)) return false;
    if (ignore !== "blueprint" && !matchesBlueprint(item)) return false;
    return true;
  });
}

function countFacet(key, value) {
  const base = facetBase(key);
  if (key === "type") return value === "All" ? base.length : base.filter(item => item.type === value).length;
  if (key === "rarity") return value === "All" ? base.length : base.filter(item => item.rarity === value).length;
  if (key === "blueprint") return value === "All"
    ? base.length
    : base.filter(item => item.hasBlueprint === (value === "Yes")).length;
  return 0;
}

function buildFilters() {
  const allOtherTypes = [...new Set(
    state.items.map(item => item.type).filter(type => !MAIN_TYPES.includes(type))
  )].sort((a, b) => a.localeCompare(b));

  const otherTypes = allOtherTypes.filter(type => countFacet("type", type) > 0);
  const typeValues = ["All", ...MAIN_TYPES];
  if (state.showOtherTypes) typeValues.push(...otherTypes);

  renderChips(els.typeFilters, typeValues, "type");

  const more = document.createElement("button");
  more.type = "button";
  more.className = "chip chip-more";
  more.textContent = state.showOtherTypes ? "Meno…" : `Altro… (${otherTypes.length})`;
  more.disabled = otherTypes.length === 0;
  more.setAttribute("aria-expanded", String(state.showOtherTypes));
  more.addEventListener("click", () => {
    state.showOtherTypes = !state.showOtherTypes;
    if (!state.showOtherTypes && state.type !== "All" && !MAIN_TYPES.includes(state.type)) state.type = "All";
    syncUrl();
    render();
  });
  els.typeFilters.append(more);

  const rarities = ["All", ...rarityOrder.filter(rarity => state.items.some(item => item.rarity === rarity))];
  renderChips(els.rarityFilters, rarities, "rarity");
  renderChips(els.blueprintFilters, ["Yes", "No", "All"], "blueprint");
}

function renderChips(container, values, key) {
  container.replaceChildren(...values.map(value => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";

    const labels = { All: "Tutti", Yes: "Sì", No: "No" };
    const count = countFacet(key, value);
    button.textContent = `${labels[value] || value} (${count})`;
    button.dataset.value = value;
    button.setAttribute("aria-pressed", String(state[key] === value));
    button.disabled = count === 0 && state[key] !== value;

    button.addEventListener("click", () => {
      state[key] = value;
      syncUrl();
      render();
    });
    return button;
  }));
}

function filteredItems() {
  return state.items
    .filter(queryMatches)
    .filter(item => matchesType(item))
    .filter(item => matchesRarity(item))
    .filter(item => matchesBlueprint(item))
    .sort((a, b) => {
      if (state.sort === "rarity") {
        return rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity)
          || a.name.localeCompare(b.name);
      }
      if (state.sort === "type") return a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
}

function render() {
  const items = filteredItems();
  els.visibleCount.textContent = items.length;
  els.emptyState.hidden = items.length > 0;
  els.grid.replaceChildren(...items.map(createCard));
  buildFilters();
}

function createCard(item) {
  const rarityClass = `rarity-${String(item.rarity || "Unknown").toLowerCase()}`;
  const card = document.createElement("article");
  card.className = `card ${rarityClass}`;
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `Apri ${item.name}`);

  const open = () => goToDetail(item);
  card.addEventListener("click", open);
  card.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  });

  const image = document.createElement("div");
  image.className = `card-image ${rarityClass}`;

  if (item.image) {
    const img = document.createElement("img");
    img.src = item.image;
    img.alt = item.name;
    img.loading = "lazy";
    img.addEventListener("error", () => {
      image.replaceChildren();
      image.textContent = initials(item.name);
    }, { once: true });
    image.append(img);
  } else {
    image.textContent = initials(item.name);
  }

  const body = document.createElement("div");
  body.className = "card-body";
  body.innerHTML = `
    <h2>${escapeHtml(item.name)}</h2>
    <div class="badges">
      <span class="badge">${escapeHtml(item.type)}</span>
      <span class="badge ${rarityClass}">${escapeHtml(item.rarity)}</span>
      ${item.hasBlueprint ? '<span class="badge">BP</span>' : ""}
    </div>
  `;

  card.append(image, body);
  return card;
}

function goToDetail(item) {
  syncUrl();
  const returnKey = `${location.pathname}${location.search}`;
  sessionStorage.setItem(`catalogScroll:${returnKey}`, String(window.scrollY));
  location.href = `item.html?id=${encodeURIComponent(item.id)}`;
}

function restoreScroll() {
  const key = `catalogScroll:${location.pathname}${location.search}`;
  const saved = sessionStorage.getItem(key);
  if (saved == null) return;
  sessionStorage.removeItem(key);
  requestAnimationFrame(() => requestAnimationFrame(() => scrollTo(0, Number(saved) || 0)));
}

function initials(name) {
  return name.replace(/\([^)]*\)/g, "").split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => part[0]).join("").toUpperCase();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

els.searchInput.addEventListener("input", event => {
  state.query = event.target.value;
  syncUrl();
  render();
});

els.sortSelect.addEventListener("change", event => {
  state.sort = event.target.value;
  syncUrl();
  render();
});

els.clearFilters.addEventListener("click", () => {
  state.type = "All";
  state.rarity = "All";
  state.blueprint = "Yes";
  state.query = "";
  state.sort = "name";
  state.showOtherTypes = false;
  els.searchInput.value = "";
  els.sortSelect.value = "name";
  syncUrl();
  render();
});

loadCatalog().catch(error => {
  console.error(error);
  els.emptyState.hidden = false;
  els.emptyState.textContent = "Impossibile caricare il catalogo locale degli oggetti.";
});


const WEEKLY_MAP_LINKS = {
  "dam": "dam_battlegrounds",
  "buried-city": "buried_city",
  "spaceport": "the_spaceport",
  "blue-gate": "the_blue_gate",
  "stella-montis": "stella_montis",
  "riven-tides": "riven_tides"
};

function weeklyScoreLabel(trial) {
  const n = Number(trial.multiplier);
  if (!Number.isFinite(n)) return "";

  const name = String(trial.name || "").toLowerCase();
  if (trial.type === "Damage") return `${n} pt / danno`;
  if (trial.type === "KillEnemy") return `${n} pt / kill`;
  if (/harvest|plant/.test(name)) return `${n} pt / pianta`;
  if (/container/.test(name)) return `${n} pt / container`;
  if (/cabinet/.test(name)) return `${n} pt / mobile`;
  if (/search/.test(name)) return `${n} pt / ricerca`;
  if (/destroy/.test(name)) return `${n} pt / distruzione`;
  return `${n} pt / azione`;
}

function weeklyDateLabel(epoch) {
  const n = Number(epoch);
  if (!Number.isFinite(n) || !n) return "";
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(n * 1000));
}

function weeklyMapLink(trial) {
  const maps = Array.isArray(trial.maps) ? trial.maps : [];
  if (maps.length !== 1) return "";
  const localId = WEEKLY_MAP_LINKS[maps[0].id];
  if (!localId) return "";
  return `map.html?map=${encodeURIComponent(localId)}`;
}

function weeklyCard(trial) {
  const score = weeklyScoreLabel(trial);
  const maps = Array.isArray(trial.maps) ? trial.maps : [];
  const mapText = maps.length === 1
    ? maps[0].name
    : maps.length === Object.keys(WEEKLY_MAP_LINKS).length
      ? "Tutte le mappe"
      : maps.length > 1
        ? `${maps.length} mappe`
        : "";
  const mapHref = weeklyMapLink(trial);

  const singleMap = maps.length === 1 ? maps[0].name : "";
  const image = trial.localImage || trial.image || "";
  return `
    <article class="weekly-card">
      <div class="weekly-map-banner${singleMap ? "" : " is-empty"}">${singleMap ? escapeHtml(singleMap) : "&nbsp;"}</div>
      ${image ? `
        <button class="weekly-image-strip" type="button" aria-expanded="false" aria-label="Espandi immagine ${escapeHtml(trial.name)}">
          <img src="${escapeHtml(image)}" alt="" loading="lazy">
          <span class="weekly-image-hint" aria-hidden="true">↕</span>
        </button>
      ` : ""}
      <div class="weekly-card-main">
        <h3>${escapeHtml(trial.name)}</h3>
        <div class="weekly-card-tags">
          ${score ? `<span class="weekly-score">${escapeHtml(score)}</span>` : ""}
          ${trial.type ? `<span class="weekly-type">${escapeHtml(trial.type)}</span>` : ""}
          ${!singleMap && mapHref
            ? `<a class="weekly-map" href="${mapHref}">${escapeHtml(mapText)} →</a>`
            : !singleMap && mapText
              ? `<span class="weekly-map">${escapeHtml(mapText)}</span>`
              : ""}
        </div>
      </div>
    </article>
  `;
}

async function loadWeeklyTrials() {
  if (!els.weeklyTrials) return;

  const response = await fetch("data/weekly-trials.json", { cache: "no-store" });
  if (!response.ok) return;
  const data = await response.json();

  const current = Array.isArray(data.current) ? data.current : [];
  const upcoming = Array.isArray(data.upcoming) ? data.upcoming : [];
  if (!current.length) return;

  const end = current.find(trial => trial.windowEnd)?.windowEnd;
  const endText = weeklyDateLabel(end);
  const generated = data.generatedAt
    ? new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        .format(new Date(data.generatedAt))
    : "";

  els.weeklyMeta.textContent = [
    `${current.length} trial attive`,
    endText ? `fino a ${endText}` : "",
    generated ? `cache ${generated}` : ""
  ].filter(Boolean).join(" · ");

  els.weeklyCurrent.innerHTML = current.map(weeklyCard).join("");
  els.weeklyUpcomingGrid.innerHTML = upcoming.map(weeklyCard).join("");

  els.weeklyTrials.querySelectorAll(".weekly-image-strip").forEach(button => {
    button.addEventListener("click", () => {
      const card = button.closest(".weekly-card");
      if (!card) return;
      const expanded = !card.classList.contains("is-image-expanded");
      card.classList.toggle("is-image-expanded", expanded);
      button.setAttribute("aria-expanded", String(expanded));
    });
  });
  els.weeklyUpcomingToggle.hidden = upcoming.length === 0;
  els.weeklyTrials.hidden = false;

  els.weeklyUpcomingToggle?.addEventListener("click", () => {
    const open = els.weeklyUpcoming.hidden;
    els.weeklyUpcoming.hidden = !open;
    els.weeklyUpcomingToggle.setAttribute("aria-expanded", String(open));
    els.weeklyUpcomingToggle.textContent = open ? "Nascondi prossime ↑" : "Prossime →";
  });
}

loadWeeklyTrials().catch(error => {
  console.warn("Weekly trials non disponibili", error);
});
