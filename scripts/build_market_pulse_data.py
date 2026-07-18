#!/usr/bin/env python3
"""Build data/marketpulse-latest.json from HKEX's public Daily Quotation
Sheet — its main "QUOTATIONS" section, which lists last price, previous
close, high/low, volume, and turnover for every stock traded that day
(~15,000 rows, two lines each). Same source file already fetched daily
for short-selling; this reads a different section of it.

Source (public, no auth): one ~30MB HTML file per trading day —
  https://www.hkex.com.hk/eng/stat/smstat/dayquot/d{YYMMDD}e.htm
Production only ever fetches *today's* file and appends one compact
breadth summary to data/marketpulse-history.json — it never re-downloads
history (same pattern as CBBC / short-selling).

Dev/backfill usage (reads cached d*.htm-style files, named YYMMDD.htm):
  python3 scripts/build_market_pulse_data.py --backfill /path/to/cached/days
"""
import argparse
import re
import sys
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

URL = "https://www.hkex.com.hk/eng/stat/smstat/dayquot/d{}e.htm"
LIQUIDITY_FLOOR = 5_000_000    # HKD total turnover; below this, % moves are noise
TOP_N = 15
HISTORY_KEEP = 250
TREND_DAYS = 30

TAG = re.compile(r"</?(font|pre)[^>]*>")
QROW1 = re.compile(r"^\s*[%#\*]?\s*(\d+)\s+(.+?)\s+(HKD|USD|CNY|RMB)\s+(.*)$")
QROW2 = re.compile(r"^\s*([\d,.\-]+)\s+([\d,.\-]+)\s+([\d,.\-]+)\s+([\d,.\-]+)\s*$")
QSUSPENDED = re.compile(r"TRADING (SUSPENDED|HALTED)")
# HKEX names structured products with an issuer/side marker punctuating
# the name -- CBBCs as "II#UNDERLYING RxNNNNL" (e.g. "SG#HSI RP2904J"),
# warrants as "IIUNDERLY@ExNNNNL" or "II-UNDERLY @ExNNNNL" (e.g.
# "UBTENCT@EP2610A"). Real equity/ETF names never contain '@' or '#'.
# Naive gainers/losers/volume rankings are otherwise 60%+ swamped by
# these penny-priced, fast-decaying instruments -- confirmed by counting
# matches against the full ~15k-row universe before shipping this filter.
# (A plain substring check, not a regex: the marker can sit anywhere in
# the name, and re.match() only anchors at position 0 -- easy to get
# silently wrong with a regex here.)
#
# Leveraged & Inverse (L&I) Products carry none of that punctuation but
# are still geared, decay-prone derivatives, not operating-company
# stock -- HKEX's short names for these prefix the underlying with a
# 3-character issuer+gearing code. Verified against a full day's ~2,800
# post-filter names: exactly these four prefixes account for every L&I
# product (CSOP and a second issuer's leveraged/inverse families), with
# zero false positives against real names sharing a letter+digit start
# (e.g. "K2 F&B", a real company, does not match any of them). Extend
# this set if a new L&I issuer prefix shows up in a future data pull.
LEVERAGED_INVERSE_PREFIXES = ("XL2", "XI2", "FL2", "FI2")


def is_structured_product(name: str) -> bool:
    if "@" in name or "#" in name:
        return True
    return name.upper().replace(" ", "").startswith(LEVERAGED_INVERSE_PREFIXES)


def num(s: str) -> float:
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return 0.0


def unescape(s: str) -> str:
    return (s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
             .strip().title())


def parse_quotations(raw: str):
    """-> (date_str, [(code, name, last, prv_close, volume, turnover)])"""
    dm = re.search(r"DATE:\s*(\d{1,2} [A-Z]{3} \d{4})", raw)
    date_str = None
    if dm:
        date_str = datetime.strptime(dm.group(1), "%d %b %Y").strftime("%Y-%m-%d")

    lines = raw.splitlines()
    try:
        start = next(i for i, l in enumerate(lines) if 'name = "quotations"' in l)
        end = next(i for i, l in enumerate(lines) if 'name = "sales_all"' in l)
    except StopIteration:
        return date_str, []

    section = [TAG.sub("", l).rstrip("\n") for l in lines[start:end]]
    rows = []
    i = 0
    while i < len(section):
        m = QROW1.match(section[i])
        if not m:
            i += 1
            continue
        code, name, _cur, rest = m.groups()
        if QSUSPENDED.search(rest):
            i += 1
            continue
        vals = rest.split()
        if len(vals) != 4:
            i += 1
            continue
        prv_clo, _ask, _high, volume = vals
        j = i + 1
        if j < len(section):
            m2 = QROW2.match(section[j])
            if m2:
                closing, _bid, _low, turnover = m2.groups()
                rows.append((code, unescape(name), num(closing), num(prv_clo),
                             num(volume), num(turnover)))
                i = j + 1
                continue
        i += 1
    # Structured products (warrants/CBBCs) are excluded at the source: they
    # outnumber real equities in this file and their penny prices/time
    # decay would otherwise swamp every ranking with meaningless noise.
    rows = [r for r in rows if not is_structured_product(r[1])]
    return date_str, rows


def http_get(url: str) -> str | None:
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (personal educational project; ytsang.com)",
    })
    try:
        return urllib.request.urlopen(req, timeout=90).read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"warn: fetch failed: {e}", file=sys.stderr)
        return None


def breadth(rows):
    up = down = flat = 0
    for _c, _n, last, prv, _v, _t in rows:
        if not prv:
            continue
        if last > prv:
            up += 1
        elif last < prv:
            down += 1
        else:
            flat += 1
    return {"n": len(rows), "advancers": up, "decliners": down, "unchanged": flat}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", help="dir of cached YYMMDD.htm files (dev only)")
    a = ap.parse_args()
    root = Path(__file__).resolve().parent.parent
    hist_path = root / "data" / "marketpulse-history.json"
    history = json.loads(hist_path.read_text()) if hist_path.exists() else []
    by_date = {h["date"]: h for h in history}

    latest_rows, latest_date = [], None

    if a.backfill:
        for p in sorted(Path(a.backfill).glob("*.htm")):
            raw = p.read_text(encoding="utf-8", errors="replace")
            if len(raw) < 10000:
                continue
            date_str, rows = parse_quotations(raw)
            if not date_str or not rows:
                continue
            by_date[date_str] = breadth(rows)
            if latest_date is None or date_str > latest_date:
                latest_date, latest_rows = date_str, rows
    else:
        now = datetime.now(timezone.utc)
        for back in range(4):
            d = now - __import__("datetime").timedelta(days=back)
            ds = d.strftime("%y%m%d")
            raw = http_get(URL.format(ds))
            if raw and len(raw) > 10000:
                date_str, rows = parse_quotations(raw)
                if date_str and rows:
                    latest_date, latest_rows = date_str, rows
                    by_date[date_str] = breadth(rows)
                    break

    if not latest_rows:
        sys.exit("no market pulse data retrieved")

    history = [by_date[d] | {"date": d} for d in sorted(by_date)][-HISTORY_KEEP:]
    hist_path.write_text(json.dumps(history, ensure_ascii=False, separators=(",", ":")) + "\n",
                          encoding="utf-8")

    liquid = [r for r in latest_rows if r[5] >= LIQUIDITY_FLOOR and r[3] > 0]

    def chg_row(r):
        code, name, last, prv, _v, turnover = r
        return [code, name, round(last, 3), round((last - prv) / prv * 100, 2), round(turnover)]

    gainers = sorted(liquid, key=lambda r: -(r[2] - r[3]) / r[3])[:TOP_N]
    losers = sorted(liquid, key=lambda r: (r[2] - r[3]) / r[3])[:TOP_N]
    by_turnover = sorted(latest_rows, key=lambda r: -r[5])[:TOP_N]
    by_volume = sorted(latest_rows, key=lambda r: -r[4])[:TOP_N]

    out = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "date": latest_date,
        "market": breadth(latest_rows),
        "trend": [[h["date"][5:], h["advancers"], h["decliners"]] for h in history[-TREND_DAYS:]],
        "gainers": [chg_row(r) for r in gainers],
        "losers": [chg_row(r) for r in losers],
        "turnover": [chg_row(r) for r in by_turnover],
        "volume": [[r[0], r[1], round(r[2], 3), round((r[2] - r[3]) / r[3] * 100, 2) if r[3] else 0,
                    round(r[4])] for r in by_volume],
        "liquidity_floor": LIQUIDITY_FLOOR,
    }
    dest = root / "data" / "marketpulse-latest.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                    encoding="utf-8")
    m = out["market"]
    print(f"{dest.name}: {latest_date}, {m['n']} stocks "
          f"({m['advancers']} up / {m['decliners']} down / {m['unchanged']} flat), "
          f"{len(history)} history days")


if __name__ == "__main__":
    main()
