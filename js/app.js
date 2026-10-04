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
  detailDialog: document.querySelector("#detailDialog"),
  detailHero: document.querySelector("#detailHero"),
  detailContent: document.querySelector("#detailContent"),
  closeDialog: document.querySelector("#closeDialog")
};

async function loadCatalog() {
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

  render();
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
  if (value === "All") return true;
  return item.type === value;
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

  if (key === "type") {
    if (value === "All") return base.length;
    return base.filter(item => item.type === value).length;
  }

  if (key === "rarity") {
    if (value === "All") return base.length;
    return base.filter(item => item.rarity === value).length;
  }

  if (key === "blueprint") {
    if (value === "All") return base.length;
    return base.filter(item => item.hasBlueprint === (value === "Yes")).length;
  }

  return 0;
}

function buildFilters() {
  const otherTypes = [...new Set(
    state.items
      .map(item => item.type)
      .filter(type => !MAIN_TYPES.includes(type))
  )].sort((a, b) => a.localeCompare(b));

  const typeValues = ["All", ...MAIN_TYPES];
  if (state.showOtherTypes) typeValues.push(...otherTypes);

  renderChips(els.typeFilters, typeValues, "type");

  const otherButton = document.createElement("button");
  otherButton.type = "button";
  otherButton.className = "chip chip-more";
  otherButton.textContent = state.showOtherTypes
    ? "Meno…"
    : `Altro… (${otherTypes.length})`;
  otherButton.setAttribute("aria-expanded", String(state.showOtherTypes));
  otherButton.addEventListener("click", () => {
    state.showOtherTypes = !state.showOtherTypes;
    if (!state.showOtherTypes && !MAIN_TYPES.includes(state.type) && state.type !== "All") {
      state.type = "All";
    }
    render();
  });
  els.typeFilters.append(otherButton);

  const rarities = ["All", ...rarityOrder.filter(rarity =>
    state.items.some(item => item.rarity === rarity)
  )];

  renderChips(els.rarityFilters, rarities, "rarity");
  renderChips(els.blueprintFilters, ["Yes", "No", "All"], "blueprint");
}

function renderChips(container, values, key) {
  container.replaceChildren(...values.map(value => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";

    const labels = {
      All: "Tutti",
      Yes: "Sì",
      No: "No"
    };

    const count = countFacet(key, value);
    button.textContent = `${labels[value] || value} (${count})`;
    button.dataset.value = value;
    button.setAttribute("aria-pressed", String(state[key] === value));
    button.disabled = count === 0 && state[key] !== value;

    button.addEventListener("click", () => {
      state[key] = value;
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

      if (state.sort === "type") {
        return a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
      }

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
  card.addEventListener("click", () => openDetail(item));
  card.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail(item);
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

function openDetail(item) {
  const rarityClass = `rarity-${String(item.rarity || "Unknown").toLowerCase()}`;
  const detailVisual = item.image
    ? `<div class="detail-thumb ${rarityClass}"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" onerror="this.remove(); this.parentElement.textContent='${initials(item.name)}'"></div>`
    : `<div class="detail-thumb ${rarityClass}">${initials(item.name)}</div>`;

  const variants = Array.isArray(item.variants) && item.variants.length > 1
    ? `<section class="detail-section">
        <h3>Varianti</h3>
        <p>${item.variants.map(v => escapeHtml(v.name)).join(" · ")}</p>
      </section>`
    : "";

  const spawnParts = [];
  if (item.spawn?.lootArea) spawnParts.push(`Area: ${escapeHtml(item.spawn.lootArea)}`);
  if (item.spawn?.locations?.length) spawnParts.push(`Location: ${item.spawn.locations.map(escapeHtml).join(", ")}`);
  if (item.spawn?.sources?.length) spawnParts.push(`Fonti: ${item.spawn.sources.map(escapeHtml).join(", ")}`);

  els.detailHero.innerHTML = `
    ${detailVisual}
    <div>
      <p class="eyebrow">${escapeHtml(item.type)}</p>
      <h2>${escapeHtml(item.name)}</h2>
      <div class="badges">
        <span class="badge ${rarityClass}">${escapeHtml(item.rarity)}</span>
        ${item.hasBlueprint ? '<span class="badge">Blueprint disponibile</span>' : '<span class="badge">No blueprint</span>'}
      </div>
    </div>
  `;

  els.detailContent.innerHTML = `
    ${variants}
    <section class="detail-section">
      <h3>MetaForge · dove trovarlo</h3>
      <p>${spawnParts.length ? spawnParts.join("<br>") : "Dati di ritrovamento non presenti nel record corrente."}</p>
    </section>
    ${item.hasBlueprint ? `
      <section class="detail-section">
        <h3>Blueprint</h3>
        <p>Questo oggetto ha un blueprint. Qui agganceremo anche le statistiche/heatmap di ArcBlueprintTracker come fonte aggiuntiva.</p>
      </section>
    ` : ""}
  `;

  els.detailDialog.showModal();
}

function initials(name) {
  return name
    .replace(/\([^)]*\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.searchInput.addEventListener("input", event => {
  state.query = event.target.value;
  render();
});

els.sortSelect.addEventListener("change", event => {
  state.sort = event.target.value;
  render();
});

els.clearFilters.addEventListener("click", () => {
  state.type = "All";
  state.rarity = "All";
  state.blueprint = "Yes";
  state.query = "";
  state.showOtherTypes = false;
  els.searchInput.value = "";
  render();
});

els.closeDialog.addEventListener("click", () => els.detailDialog.close());
els.detailDialog.addEventListener("click", event => {
  if (event.target === els.detailDialog) els.detailDialog.close();
});

loadCatalog().catch(error => {
  console.error(error);
  els.emptyState.hidden = false;
  els.emptyState.textContent = "Impossibile caricare il catalogo locale degli oggetti.";
});
