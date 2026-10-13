#!/usr/bin/env python3
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API_URL = "https://metaforge.app/api/arc-raiders/weekly-trials"
OUTPUT = Path("data/weekly-trials.json")
IMAGE_DIR = Path("assets/weekly-trials")

def fetch_json():
    req = urllib.request.Request(
        API_URL,
        headers={
            "User-Agent": "arcbptrack-weekly-trials-cache/2.0 (+https://github.com/paolofarina/arcbptrack)",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)

def inferred_maps(row):
    image = (row.get("image_url") or "").lower()
    name = (row.get("name") or row.get("content_name") or "").lower()

    inferred = []
    if "pendola-pass" in image or "pendola pass" in name:
        inferred.append({"id": "pendola-pass", "name": "Pendola Pass"})

    return inferred

def cache_image(row):
    url = row.get("image_url") or ""
    trial_id = row.get("trial_id") or ""
    if not url or not trial_id:
        return ""

    suffix = Path(url.split("?", 1)[0]).suffix.lower()
    if suffix not in {".webp", ".jpg", ".jpeg", ".png"}:
        suffix = ".webp"

    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    target = IMAGE_DIR / f"{trial_id}{suffix}"

    req = urllib.request.Request(
        url,
        headers={"User-Agent": "arcbptrack-weekly-trials-cache/2.1 (+https://github.com/paolofarina/arcbptrack)"}
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        target.write_bytes(response.read())

    return target.as_posix()

def compact_trial(row):
    map_links = []
    seen = set()
    for link in row.get("map_links") or []:
        map_id = link.get("mapId")
        map_name = link.get("mapName")
        if not map_id or map_id in seen:
            continue
        seen.add(map_id)
        map_links.append({
            "id": map_id,
            "name": map_name or map_id,
        })

    if not map_links:
        explicit_names = row.get("map_names") or []
        for value in explicit_names:
            if isinstance(value, str) and value.strip():
                map_links.append({"id": value.strip().lower().replace(" ", "-"), "name": value.strip()})

    if not map_links:
        map_links = inferred_maps(row)

    return {
        "id": row.get("id"),
        "trialId": row.get("trial_id"),
        "name": row.get("name") or row.get("content_name") or "",
        "image": row.get("image_url") or "",
        "localImage": cache_image(row),
        "guideLink": row.get("guide_link") or "",
        "multiplier": row.get("multiplier"),
        "type": row.get("type") or "",
        "mapNames": row.get("map_names") or [],
        "mapCondition": row.get("map_condition"),
        "maps": map_links,
        "windowStart": row.get("window_start"),
        "windowEnd": row.get("window_end"),
    }

def main():
    payload = fetch_json()
    rows = payload.get("data")
    if not isinstance(rows, list):
        raise RuntimeError("Unexpected API payload: missing data[]")

    current = [compact_trial(row) for row in rows if row.get("is_active") is True]
    upcoming = [compact_trial(row) for row in rows if row.get("upcoming") is True]

    current.sort(key=lambda row: row["name"].casefold())
    upcoming.sort(key=lambda row: row["name"].casefold())

    if not current:
        raise RuntimeError("API returned no active weekly trials")

    output = {
        "schemaVersion": 2,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "provider": "MetaForge",
            "endpoint": API_URL,
        },
        "current": current,
        "upcoming": upcoming,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Weekly trials API: {API_URL}")
    print(f"Current: {len(current)}")
    for row in current:
        print(f"  - {row['name']} | multiplier={row['multiplier']} | type={row['type'] or 'n/a'} | maps={len(row['maps'])}")
    print(f"Upcoming: {len(upcoming)}")
    for row in upcoming:
        print(f"  - {row['name']} | multiplier={row['multiplier']} | type={row['type'] or 'n/a'} | maps={len(row['maps'])}")
    print(f"Wrote: {OUTPUT}")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
