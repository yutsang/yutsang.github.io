#!/usr/bin/env python3
"""Build data/rrag-graph.json from the rrag wiki's [[wikilinks]].

Usage: python3 scripts/build_rrag_graph.py <path-to-rrag-checkout>

Run by .github/workflows/rrag-graph.yml on a weekly schedule so the graph
on /projects/rrag/ tracks the wiki as it grows.
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

WIKILINK = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]")


def group_of(rel: Path) -> str:
    parts = rel.parts
    return parts[0] if len(parts) > 1 else "index"


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    wiki = Path(sys.argv[1]) / "wiki"
    if not wiki.is_dir():
        sys.exit(f"no wiki/ directory under {sys.argv[1]}")

    pages = sorted(wiki.rglob("*.md"))
    nodes = []
    by_key = {}
    for p in pages:
        rel = p.relative_to(wiki)
        stem = p.stem
        by_key[stem.lower()] = len(nodes)
        nodes.append({
            "id": stem,
            "group": group_of(rel),
            "path": str(rel).replace("\\", "/"),
        })

    seen = set()
    links = []
    for i, p in enumerate(pages):
        text = p.read_text(encoding="utf-8", errors="replace")
        for m in WIKILINK.finditer(text):
            target = m.group(1).strip().lower()
            j = by_key.get(target)
            if j is None or j == i:
                continue
            key = (min(i, j), max(i, j))
            if key in seen:
                continue
            seen.add(key)
            links.append([key[0], key[1]])

    deg = [0] * len(nodes)
    for s, t in links:
        deg[s] += 1
        deg[t] += 1
    for n, d in zip(nodes, deg):
        n["deg"] = d

    out = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "nodes": nodes,
        "links": links,
    }
    dest = Path(__file__).resolve().parent.parent / "data" / "rrag-graph.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{dest}: {len(nodes)} nodes, {len(links)} links")


if __name__ == "__main__":
    main()
