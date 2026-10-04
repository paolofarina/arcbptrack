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
  emptyState: document.querySelector("#emptyState")
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
