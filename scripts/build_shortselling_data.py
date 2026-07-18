#!/usr/bin/env python3
"""Build data/shortselling-latest.json from HKEX's public Daily Quotation
Sheet — specifically its "SHORT SELLING TURNOVER - DAILY REPORT" section,
which lists every stock with short-selling activity that day (shares and
value, alongside that stock's total shares and value traded).

Source (public, no auth): one ~30MB HTML file per trading day —
  https://www.hkex.com.hk/eng/stat/smstat/dayquot/d{YYMMDD}e.htm
Because each day's file is large, production only ever fetches *today's*
file and appends one compact summary row to data/shortselling-history.json
(same accumulate-over-time pattern as data/cbbc-history.json) — it never
re-downloads history.

Dev/backfill usage (reads cached d*.htm-style files, named YYMMDD.htm,
to seed a realistic trend for local preview without 20 separate fetches):
  python3 scripts/build_shortselling_data.py --backfill /path/to/cached/days
"""
import argparse
import re
import sys
import json
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

URL = "https://www.hkex.com.hk/eng/stat/smstat/dayquot/d{}e.htm"
LIQUIDITY_FLOOR = 5_000_000    # HKD-equivalent total turnover; below this, ratio is noise
TOP_N = 15
HISTORY_KEEP = 250
TREND_DAYS = 30

ROW = re.compile(
    r"^\s*[%#\*]?\s*(\d+)\s+(.+?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s*$"
)
TAG = re.compile(r"</?(font|pre)[^>]*>")


def num(s: str) -> float:
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return 0.0


def unescape(s: str) -> str:
    return (s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
             .strip().title())


def parse_dayquot(raw: str):
    """-> (date_str, [ (code, name, ss_val, total_val) ])"""
    dm = re.search(r"DATE:\s*(\d{1,2} [A-Z]{3} \d{4})", raw)
    date_str = None
    if dm:
        date_str = datetime.strptime(dm.group(1), "%d %b %Y").strftime("%Y-%m-%d")

    lines = raw.splitlines()
    try:
        start = next(i for i, l in enumerate(lines) if 'name = "short_selling"' in l)
        end = next(i for i, l in enumerate(lines) if 'name = "adj_short"' in l)
    except StopIteration:
        return date_str, []

    rows = []
    for line in lines[start:end]:
        clean = TAG.sub("", line).rstrip("\n")
        if not clean.strip():
            continue
        m = ROW.match(clean)
        if not m:
            continue
        code, name, ss_sh, ss_val, tot_sh, tot_val = m.groups()
        rows.append((code, unescape(name), num(ss_val), num(tot_val)))
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


def day_summary(rows):
    ss_total = sum(r[2] for r in rows)
    tot_total = sum(r[3] for r in rows)
    ratio = ss_total / tot_total if tot_total else 0.0
    return {"ss_turnover": round(ss_total), "total_turnover": round(tot_total),
            "ratio": round(ratio, 5), "n": len(rows)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", help="dir of cached YYMMDD.htm files (dev only)")
    a = ap.parse_args()
    root = Path(__file__).resolve().parent.parent
    hist_path = root / "data" / "shortselling-history.json"
    history = json.loads(hist_path.read_text()) if hist_path.exists() else []
    by_date = {h["date"]: h for h in history}

    latest_rows, latest_date = [], None

    if a.backfill:
        for p in sorted(Path(a.backfill).glob("*.htm")):
            raw = p.read_text(encoding="utf-8", errors="replace")
            if len(raw) < 10000:      # holiday/error stub page
                continue
            date_str, rows = parse_dayquot(raw)
            if not date_str or not rows:
                continue
            by_date[date_str] = day_summary(rows)
            if latest_date is None or date_str > latest_date:
                latest_date, latest_rows = date_str, rows
    else:
        now = datetime.now(timezone.utc)
        for back in range(4):     # today, then a few days back in case of holiday/late publish
            d = now - __import__("datetime").timedelta(days=back)
            ds = d.strftime("%y%m%d")
            raw = http_get(URL.format(ds))
            if raw and len(raw) > 10000:
                date_str, rows = parse_dayquot(raw)
                if date_str and rows:
                    latest_date, latest_rows = date_str, rows
                    by_date[date_str] = day_summary(rows)
                    break

    if not latest_rows:
        sys.exit("no short-selling data retrieved")

    history = [by_date[d] | {"date": d} for d in sorted(by_date)][-HISTORY_KEEP:]
    hist_path.write_text(json.dumps(history, ensure_ascii=False, separators=(",", ":")) + "\n",
                          encoding="utf-8")

    market = day_summary(latest_rows)
    ranked = sorted(
        (r for r in latest_rows if r[3] >= LIQUIDITY_FLOOR),
        key=lambda r: -(r[2] / r[3]),
    )
    top = [[code, name, round(ssv / tv, 4), round(ssv), round(tv)]
           for code, name, ssv, tv in ranked[:TOP_N]]

    trend = [[h["date"][5:], h["ratio"]] for h in history[-TREND_DAYS:]]

    out = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "date": latest_date,
        "market": market,
        "top_stocks": top,
        "trend": trend,
        "liquidity_floor": LIQUIDITY_FLOOR,
    }
    dest = root / "data" / "shortselling-latest.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                    encoding="utf-8")
    print(f"{dest.name}: {latest_date}, market ratio {market['ratio']:.2%}, "
          f"{market['n']} stocks, {len(history)} history days")


if __name__ == "__main__":
    main()
