#!/usr/bin/env python3
"""Build data/cbbc-latest.json from HKEX's public CBBC full list.

Usage:
  python3 scripts/build_cbbc_data.py            # fetch from HKEX
  python3 scripts/build_cbbc_data.py file.csv   # use a local copy (dev)

Run each trading morning by .github/workflows/cbbc-data.yml after HKEX
refreshes outstanding quantities (~06:15 HKT). Source file is UTF-16,
tab-delimited: https://www.hkex.com.hk/eng/cbbc/search/cbbcFullList.csv
"""
import csv
import json
import re
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

SOURCE = "https://www.hkex.com.hk/eng/cbbc/search/cbbcFullList.csv"
INDEXES = ["HSI", "HSCEI", "HSTECH"]
TOP_STOCKS = 6
HISTORY_KEEP = 250

NAMES = {
    "HSI": ("Hang Seng Index", "恒生指數"),
    "HSCEI": ("Hang Seng China Enterprises", "國企指數"),
    "HSTECH": ("Hang Seng TECH", "恒生科指"),
    "00005": ("HSBC Holdings", "滙豐控股"),
    "00020": ("SenseTime", "商湯"),
    "00386": ("Sinopec", "中石化"),
    "00388": ("HKEX", "香港交易所"),
    "00700": ("Tencent", "騰訊控股"),
    "00939": ("CCB", "建設銀行"),
    "00941": ("China Mobile", "中國移動"),
    "00981": ("SMIC", "中芯國際"),
    "00883": ("CNOOC", "中海油"),
    "01024": ("Kuaishou", "快手"),
    "01398": ("ICBC", "工商銀行"),
    "01810": ("Xiaomi", "小米集團"),
    "02318": ("Ping An", "中國平安"),
    "02628": ("China Life", "中國人壽"),
    "03690": ("Meituan", "美團"),
    "09992": ("Pop Mart", "泡泡瑪特"),
    "09988": ("Alibaba", "阿里巴巴"),
}


def nice_step(x: float) -> float:
    """Snap x to the nearest 1/2/2.5/5 x 10^k."""
    import math
    if x <= 0:
        return 1.0
    exp = math.floor(math.log10(x))
    frac = x / 10 ** exp
    best = min((1, 2, 2.5, 5, 10), key=lambda n: abs(n - frac))
    return best * 10 ** exp


def load(source: str) -> list[str]:
    if source.startswith("http"):
        req = urllib.request.Request(source, headers={
            "User-Agent": "Mozilla/5.0 (personal educational project; ytsang.com)",
            "Referer": "https://www.hkex.com.hk/eng/cbbc/search/listsearch.asp",
        })
        raw = urllib.request.urlopen(req, timeout=60).read()
        return raw.decode("utf-16").splitlines()
    return Path(source).read_text(encoding="utf-16").splitlines()


def main() -> None:
    source = sys.argv[1] if len(sys.argv) > 1 else SOURCE
    lines = load(source)

    m = re.match(r"Updated: (\S+)(?: \(except for O/S \(%\) below: ([^)]+)\))?", lines[0])
    updated = m.group(1) if m else lines[0][:40]
    os_asof = (m.group(2) or updated) if m else updated

    rows = list(csv.reader(lines[1:], delimiter="\t"))
    hdr = rows[0]
    i = {c: n for n, c in enumerate(hdr)}

    per_ul = defaultdict(list)   # ul -> [(side, call, units)]
    for r in rows[1:]:
        if len(r) < len(hdr):
            continue
        ul = r[i["UL"]].strip()
        side = r[i["Bull/Bear"]].strip()
        try:
            call = float(r[i["Call Level"]].replace(",", ""))
            os_pct = float(r[i["O/S (%)"]]) / 100
            size = float(r[i["Total Issue Size"]].replace(",", ""))
            ratio = float(r[i["Entitlement Ratio^"]].replace(",", ""))
        except ValueError:
            continue
        if side not in ("Bull", "Bear") or os_pct <= 0 or ratio <= 0:
            continue
        per_ul[ul].append((side, call, os_pct * size / ratio))

    stocks = sorted(
        (ul for ul in per_ul if ul not in INDEXES),
        key=lambda ul: -len(per_ul[ul]),
    )[:TOP_STOCKS]
    selected = [ul for ul in INDEXES if ul in per_ul] + stocks

    out_uls = {}
    for ul in selected:
        recs = per_ul[ul]
        bulls = [c for s, c, u in recs if s == "Bull"]
        bears = [c for s, c, u in recs if s == "Bear"]
        if not bulls or not bears:
            continue
        spot = (max(bulls) + min(bears)) / 2
        step = nice_step(spot * 0.004)
        buckets = defaultdict(lambda: [0.0, 0.0])
        for s, c, u in recs:
            level = int(c / step) * step if step >= 1 else round(int(c / step) * step, 2)
            buckets[level][0 if s == "Bull" else 1] += u
        en, zh = NAMES.get(ul, (ul, ul))
        out_uls[ul] = {
            "en": en, "zh": zh, "step": step,
            "spot": round(spot, 2),
            "bull": round(sum(u for s, c, u in recs if s == "Bull")),
            "bear": round(sum(u for s, c, u in recs if s == "Bear")),
            "n": len(recs),
            "buckets": [[lv, round(b[0]), round(b[1])]
                        for lv, b in sorted(buckets.items())],
        }

    root = Path(__file__).resolve().parent.parent
    out = {
        "updated": updated,
        "os_asof": os_asof,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "underlyings": out_uls,
    }
    dest = root / "data" / "cbbc-latest.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                    encoding="utf-8")

    hist_path = root / "data" / "cbbc-history.json"
    hist = json.loads(hist_path.read_text()) if hist_path.exists() else []
    entry = {"date": updated,
             **{ul: [d["bull"], d["bear"]] for ul, d in out_uls.items() if ul in INDEXES}}
    hist = [h for h in hist if h.get("date") != updated] + [entry]
    hist_path.write_text(json.dumps(hist[-HISTORY_KEEP:], ensure_ascii=False,
                                    separators=(",", ":")) + "\n", encoding="utf-8")

    print(f"{dest}: {len(out_uls)} underlyings "
          f"({', '.join(out_uls)}) · updated {updated}, O/S as of {os_asof}")


if __name__ == "__main__":
    main()
