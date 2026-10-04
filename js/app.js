const state = {
  items: [],
  type: "All",
  rarity: "All",
  query: "",
  sort: "name"
};

const rarityOrder = ["Legendary", "Epic", "Rare", "Uncommon", "Common"];

const els = {
  grid: document.querySelector("#grid"),
  visibleCount: document.querySelector("#visibleCount"),
  searchInput: document.querySelector("#searchInput"),
  typeFilters: document.querySelector("#typeFilters"),
  rarityFilters: document.querySelector("#rarityFilters"),
  sortSelect: document.querySelector("#sortSelect"),
  clearFilters: document.querySelector("#clearFilters"),
  emptyState: document.querySelector("#emptyState"),
  detailDialog: document.querySelector("#detailDialog"),
  detailHero: document.querySelector("#detailHero"),
  detailContent: document.querySelector("#detailContent"),
  closeDialog: document.querySelector("#closeDialog")
};

async function loadCatalog() {
  const response = await fetch("data/blueprints.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Catalog load failed: ${response.status}`);
  const data = await response.json();
  state.items = data.items;
  buildFilters();
  render();
}

function buildFilters() {
  const types = ["All", ...new Set(state.items.map(item => item.type))];
  const rarities = ["All", ...rarityOrder.filter(rarity => state.items.some(item => item.rarity === rarity))];

  renderChips(els.typeFilters, types, "type");
  renderChips(els.rarityFilters, rarities, "rarity");
}

function renderChips(container, values, key) {
  container.replaceChildren(...values.map(value => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = value === "All" ? "Tutti" : value;
    button.dataset.value = value;
    button.setAttribute("aria-pressed", String(state[key] === value));
    button.addEventListener("click", () => {
      state[key] = value;
      [...container.children].forEach(child =>
        child.setAttribute("aria-pressed", String(child.dataset.value === value))
      );
      render();
    });
    return button;
  }));
}

function filteredItems() {
  const query = state.query.trim().toLowerCase();

  return state.items
    .filter(item => state.type === "All" || item.type === state.type)
    .filter(item => state.rarity === "All" || item.rarity === state.rarity)
    .filter(item => !query || item.name.toLowerCase().includes(query))
    .sort((a, b) => {
      if (state.sort === "rarity") {
        return rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity) || a.name.localeCompare(b.name);
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
}

function createCard(item) {
  const card = document.createElement("article");
  card.className = "card";
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
  image.className = "card-image";
  if (item.image) {
    const img = document.createElement("img");
    img.src = item.image;
    img.alt = item.name;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
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
      <span class="badge rarity-${item.rarity.toLowerCase()}">${escapeHtml(item.rarity)}</span>
    </div>
  `;

  card.append(image, body);

  if (item.reward) {
    const reward = document.createElement("span");
    reward.className = "badge reward-badge";
    reward.textContent = `${item.reward} reward`;
    card.append(reward);
  }

  return card;
}

function openDetail(item) {
  const detailVisual = item.image
    ? `<div class="detail-thumb"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" onerror="this.remove(); this.parentElement.textContent='${initials(item.name)}'"></div>`
    : `<div class="detail-thumb">${initials(item.name)}</div>`;

  els.detailHero.innerHTML = `
    ${detailVisual}
    <div>
      <p class="eyebrow">${escapeHtml(item.type)}</p>
      <h2>${escapeHtml(item.name)}</h2>
      <div class="badges">
        <span class="badge rarity-${item.rarity.toLowerCase()}">${escapeHtml(item.rarity)}</span>
        ${item.reward ? `<span class="badge">${escapeHtml(item.reward)} reward</span>` : ""}
      </div>
    </div>
  `;

  els.detailContent.innerHTML = `
    <section class="detail-section">
      <h3>Mappe e condizioni</h3>
      <p>Qui compariranno le statistiche locali per mappa e condizione. Aprire il dettaglio non genera richieste esterne.</p>
    </section>
    <section class="detail-section">
      <h3>Contenitori</h3>
      <p>Qui comparirà la distribuzione dei contenitori quando aggiungeremo il dataset locale.</p>
    </section>
    <section class="detail-section">
      <h3>Heatmap</h3>
      <p>La heatmap verrà generata localmente usando coordinate salvate nel repository.</p>
    </section>
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
  state.query = "";
  els.searchInput.value = "";
  buildFilters();
  render();
});

els.closeDialog.addEventListener("click", () => els.detailDialog.close());
els.detailDialog.addEventListener("click", event => {
  if (event.target === els.detailDialog) els.detailDialog.close();
});

loadCatalog().catch(error => {
  console.error(error);
  els.emptyState.hidden = false;
  els.emptyState.textContent = "Impossibile caricare il catalogo locale dei blueprint.";
});
