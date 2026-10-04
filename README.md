# arcbptrack

Mobile-first ARC Raiders blueprint browser.

## Goal

Provide a fast, visual, filterable blueprint catalog with detail views for maps, conditions, containers and future heatmaps.

## Data strategy

- Runtime is offline-first: the app reads JSON stored in this repository.
- MetaForge is the preferred external source for refresh jobs. Their API documentation explicitly recommends caching data locally and requires attribution for public projects.
- Arc Blueprint Tracker is **not** queried automatically. Any future sync with that service should only be added with explicit permission from its maintainers.
- No user/community submission identifiers are stored in the current repository.

## Current milestone

- 83 blueprint catalog snapshot
- filters by type and rarity
- optional text search
- responsive card grid
- blueprint detail dialog
- structure ready for images and location statistics

## Run locally

Serve the repository with any static HTTP server. Opening `index.html` directly may block JSON loading in some browsers.

Example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Sources

Catalog classification snapshot: Arc Blueprint Tracker public grid, captured 2026-10-04.

Future catalog enrichment/update source: [MetaForge ARC Raiders API](https://metaforge.app/arc-raiders/api).

ARC Raiders and related game assets are property of their respective owners.
