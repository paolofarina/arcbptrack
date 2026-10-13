#!/usr/bin/env python3
import html
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SOURCE_URL = "https://metaforge.app/arc-raiders/weekly-trials"
OUTPUT = Path("data/weekly-trials.json")

MAP_NAMES = [
    "Dam Battlegrounds",
    "Dam",
    "The Spaceport",
    "Spaceport",
    "Buried City",
    "The Blue Gate",
    "Blue Gate",
    "Stella Montis",
    "Riven Tides",
    "Pendola Pass",
    "Frozen Trail",
]

def fetch_html():
    req = urllib.request.Request(
        SOURCE_URL,
        headers={
            "User-Agent": "arcbptrack-weekly-trials-cache/1.0 (+https://github.com/paolofarina/arcbptrack)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")

def clean_text(fragment):
    fragment = re.sub(r"<script\b[^>]*>.*?</script>", " ", fragment, flags=re.I | re.S)
    fragment = re.sub(r"<style\b[^>]*>.*?</style>", " ", fragment, flags=re.I | re.S)
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    fragment = html.unescape(fragment)
    return re.sub(r"\s+", " ", fragment).strip()

def heading_positions(page, level):
    pattern = re.compile(rf"<h{level}\b[^>]*>(.*?)</h{level}>", re.I | re.S)
    return [(m.start(), m.end(), clean_text(m.group(1))) for m in pattern.finditer(page)]

def section_between(page, start_label, end_label):
    headings = heading_positions(page, 2)
    start = next((h for h in headings if start_label.lower() in h[2].lower()), None)
    if not start:
        raise RuntimeError(f"Section not found: {start_label}")
    end = next((h for h in headings if h[0] > start[0] and end_label.lower() in h[2].lower()), None)
    return page[start[1]: end[0] if end else len(page)]

def section_after(page, start_label):
    headings = heading_positions(page, 2)
    start = next((h for h in headings if start_label.lower() in h[2].lower()), None)
    if not start:
        raise RuntimeError(f"Section not found: {start_label}")
    end = next((h for h in headings if h[0] > start[0]), None)
    return page[start[1]: end[0] if end else len(page)]

def h3_titles(fragment):
    out = []
    seen = set()
    for _, _, title in heading_positions(fragment, 3):
        if not title or title in seen:
            continue
        seen.add(title)
        out.append(title)
    return out

def scoring_rows(fragment):
    matches = list(re.finditer(r"<h4\b[^>]*>(.*?)</h4>", fragment, re.I | re.S))
    scores = {}
    for i, match in enumerate(matches):
        name = clean_text(match.group(1))
        end = matches[i + 1].start() if i + 1 < len(matches) else len(fragment)
        block_text = clean_text(fragment[match.end():end])

        score_match = re.search(r"(Earn\s+.+)$", block_text, re.I)
        score = score_match.group(1).strip() if score_match else ""

        map_name = ""
        for candidate in MAP_NAMES:
            if re.search(rf"\b{re.escape(candidate)}\b", block_text, re.I):
                map_name = candidate
                break

        scores[name.casefold()] = {
            "score": score,
            "map": map_name,
        }
    return scores

def normalize_map_name(value):
    aliases = {
        "dam": "Dam Battlegrounds",
        "spaceport": "The Spaceport",
        "blue gate": "The Blue Gate",
    }
    return aliases.get(value.casefold(), value) if value else ""

def assemble(page):
    current_fragment = section_between(
        page,
        "ARC Raiders Trials This Week",
        "Upcoming ARC Raiders Weekly Trials",
    )
    upcoming_fragment = section_between(
        page,
        "Upcoming ARC Raiders Weekly Trials",
        "Scoring Information",
    )
    scoring_fragment = section_after(page, "Scoring Information")

    current_names = h3_titles(current_fragment)[:5]
    upcoming_names = h3_titles(upcoming_fragment)[:5]
    score_index = scoring_rows(scoring_fragment)

    if len(current_names) != 5 or len(upcoming_names) != 5:
        raise RuntimeError(
            f"Unexpected trial counts: current={len(current_names)}, upcoming={len(upcoming_names)}"
        )

    def enrich(names):
        rows = []
        for name in names:
            meta = score_index.get(name.casefold(), {})
            rows.append({
                "name": name,
                "score": meta.get("score", ""),
                "map": normalize_map_name(meta.get("map", "")),
            })
        return rows

    current = enrich(current_names)
    upcoming = enrich(upcoming_names)

    score_matches = sum(1 for row in current + upcoming if row["score"])
    if score_matches < 8:
        raise RuntimeError(f"Scoring parser looks unreliable: only {score_matches}/10 scores matched")

    return {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "provider": "MetaForge",
            "url": SOURCE_URL,
        },
        "current": current,
        "upcoming": upcoming,
    }

def main():
    page = fetch_html()
    data = assemble(page)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Weekly trials fetched from: {SOURCE_URL}")
    print(f"Current:  {len(data['current'])}")
    for row in data["current"]:
        print(f"  - {row['name']} | {row['score'] or 'score n/a'} | {row['map'] or 'any/unspecified map'}")
    print(f"Upcoming: {len(data['upcoming'])}")
    for row in data["upcoming"]:
        print(f"  - {row['name']} | {row['score'] or 'score n/a'} | {row['map'] or 'any/unspecified map'}")
    print(f"Wrote: {OUTPUT}")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
