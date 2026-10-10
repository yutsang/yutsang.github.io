#!/usr/bin/env python3
"""Build data/stockconnect-latest.json from HKEX's public Stock Connect
daily statistics widget.

Source (per calendar day, public, no auth):
  https://www.hkex.com.hk/eng/csm/DailyStat/data_tab_daily_{YYYYMMDD}e.js
  A JS assignment `tabData = [...]` covering four channels for that date:
  SSE Northbound, SSE Southbound, SZSE Northbound, SZSE Southbound.
  Non-trading days (weekends/holidays) 404. Verified same-day publication:
  the file's Last-Modified is consistently ~17:27-17:30 HKT on the trading
  date itself (checked across several days), i.e. shortly after the 16:00
  HKT market close — this is same-day data, unlike CBBC's next-morning O/S.

"Southbound" = mainland money buying HK stocks — what HK commentary calls
北水 ("northern water"). "Northbound" = HK/international money buying
Shanghai/Shenzhen stocks.

Dev usage (offline, reads cached *.js named YYYYMMDD.js in a directory):
  python3 scripts/build_stockconnect_data.py --dir /path/to/cached/days
"""
import argparse
import json
import re
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

URL = "https://www.hkex.com.hk/eng/csm/DailyStat/data_tab_daily_{}e.js"
LOOKBACK_CALENDAR_DAYS = 45   # enough to find TREND_DAYS trading days
TREND_DAYS = 30
TOP_WINDOW_DAYS = 10
TOP_N = 10


def http_get(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (personal educational project; ytsang.com)",
    })
    try:
        return urllib.request.urlopen(req, timeout=20).read()
    except Exception:
        return None


def http_last_modified(url: str) -> str | None:
    req = urllib.request.Request(url, method="HEAD", headers={
        "User-Agent": "Mozilla/5.0 (personal educational project; ytsang.com)",
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.headers.get("Last-Modified")
    except Exception:
        return None


def parse_day(raw: bytes):
    """One day's tabData -> {market_name: {turnover, buy, sell, trades, top10}}"""
    txt = raw.decode("utf-8", errors="replace")
    txt = re.sub(r"^\s*tabData\s*=\s*", "", txt.strip())
    txt = txt.rstrip(";\n ")
    entries = json.loads(txt)

    def num(s):
        try:
            return float(s.replace(",", ""))
        except (ValueError, AttributeError):
            return 0.0

    out = {}
    for e in entries:
        market = e["market"]
        trading = {}
        top10 = []
        for block in e.get("content", []):
            t = block["table"]
            schema = t["schema"][0]
            rows = [r["td"][0] for r in t["tr"]]
            if t["classname"] == "tradingTable":
                trading = {schema[i]: num(rows[i][0]) for i in range(len(schema))}
            elif t["classname"] == "top10Table":
                for row in rows:
                    rec = dict(zip(schema, row))
                    top10.append(rec)
        out[market] = {"trading": trading, "top10": top10, "date": e["date"]}
    return out


def load_days(cache_dir: str | None):
    days = {}
    if cache_dir:
        for p in sorted(Path(cache_dir).glob("*.js")):
            parsed = parse_day(p.read_bytes())
            any_market = next(iter(parsed.values()))
            days[any_market["date"]] = parsed
        return days

    d = datetime.now(timezone.utc) + timedelta(hours=8)   # today in HKT
    tried = 0
    while len(days) < TREND_DAYS + 2 and tried < LOOKBACK_CALENDAR_DAYS:
        ds = d.strftime("%Y%m%d")
        raw = http_get(URL.format(ds))
        if raw:
            try:
                parsed = parse_day(raw)
                days[list(parsed.values())[0]["date"]] = parsed
            except Exception as e:
                print(f"warn: parse failed for {ds}: {e}", file=sys.stderr)
        d -= timedelta(days=1)
        tried += 1
    return days


def southbound(days: dict, sse_key: str, szse_key: str):
    """Southbound tables carry a Buy/Sell split -> net flow is meaningful.
    top10Table amounts are raw currency; tradingTable amounts are in
    currency-millions. Normalise everything to millions for display."""
    dates = sorted(days)[-TREND_DAYS:]
    trend = []
    exch_latest = {"SSE": {"buy": 0.0, "sell": 0.0}, "SZSE": {"buy": 0.0, "sell": 0.0}}
    top_agg = defaultdict(lambda: {"name": "", "buy": 0.0, "sell": 0.0, "days": 0})

    for idx, dt in enumerate(dates):
        day = days[dt]
        sse = day.get(sse_key, {}).get("trading", {})
        szse = day.get(szse_key, {}).get("trading", {})
        buy = sse.get("Buy Turnover", 0) + szse.get("Buy Turnover", 0)
        sell = sse.get("Sell Turnover", 0) + szse.get("Sell Turnover", 0)
        trend.append([dt[5:], round(buy - sell, 1), round(buy, 1), round(sell, 1)])

        if idx == len(dates) - 1:
            exch_latest["SSE"] = {"buy": sse.get("Buy Turnover", 0), "sell": sse.get("Sell Turnover", 0)}
            exch_latest["SZSE"] = {"buy": szse.get("Buy Turnover", 0), "sell": szse.get("Sell Turnover", 0)}

        if idx >= len(dates) - TOP_WINDOW_DAYS:
            for mkey in (sse_key, szse_key):
                for rec in day.get(mkey, {}).get("top10", []):
                    code = rec.get("Stock Code", "").strip()
                    if not code:
                        continue
                    a = top_agg[code]
                    a["name"] = rec.get("Stock Name", "").title()
                    a["buy"] += num_field(rec, "Buy Turnover") / 1e6
                    a["sell"] += num_field(rec, "Sell Turnover") / 1e6
                    a["days"] += 1

    ranked = sorted(top_agg.items(), key=lambda kv: -(kv[1]["buy"] - kv[1]["sell"]))
    picks = ranked[:TOP_N] + (ranked[-TOP_N:] if len(ranked) > TOP_N else [])
    seen, dedup = set(), []
    for code, v in picks:
        if code not in seen:
            seen.add(code)
            dedup.append([code, v["name"], round(v["buy"] - v["sell"], 1),
                          round(v["buy"], 1), round(v["sell"], 1), v["days"]])
    dedup.sort(key=lambda r: -r[2])

    latest = trend[-1] if trend else [None, 0, 0, 0]
    return {
        "currency": "HKD",
        "trend": trend,
        "latest": {"date": dates[-1] if dates else None, "net": latest[1], "buy": latest[2], "sell": latest[3]},
        "by_exchange": [
            ["SSE", round(exch_latest["SSE"]["buy"]), round(exch_latest["SSE"]["sell"])],
            ["SZSE", round(exch_latest["SZSE"]["buy"]), round(exch_latest["SZSE"]["sell"])],
        ],
        "top_stocks": dedup,
        "window_days": min(TOP_WINDOW_DAYS, len(dates)),
    }


def northbound(days: dict, sse_key: str, szse_key: str):
    """Northbound tables have no buy/sell split (HKEX schema: Total
    Turnover, Total Trade Count, DQB, ETF Turnover) — DQB is a sentinel
    (999,999,999 = no binding daily quota), not usable data. Only a
    turnover trend is meaningful here."""
    dates = sorted(days)[-TREND_DAYS:]
    trend = []
    for dt in dates:
        day = days[dt]
        sse = day.get(sse_key, {}).get("trading", {})
        szse = day.get(szse_key, {}).get("trading", {})
        total = sse.get("Total Turnover", 0) + szse.get("Total Turnover", 0)
        trend.append([dt[5:], round(total, 1)])
    latest = trend[-1] if trend else [None, 0]
    return {
        "currency": "RMB",
        "trend": trend,
        "latest": {"date": dates[-1] if dates else None, "turnover": latest[1]},
    }


def num_field(rec: dict, key: str) -> float:
    try:
        return float(rec.get(key, "0").replace(",", ""))
    except (ValueError, AttributeError):
        return 0.0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", help="directory of cached YYYYMMDD.js files (dev/offline)")
    a = ap.parse_args()

    days = load_days(a.dir)
    if not days:
        sys.exit("no Stock Connect data retrieved")

    latest_date = sorted(days)[-1]
    published_at = None
    if not a.dir:
        published_at = http_last_modified(URL.format(latest_date.replace("-", "")))

    out = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "published_at": published_at,   # Last-Modified of the latest day's file, e.g. same-day ~17:30 HKT
        "trading_days": sorted(days)[-TREND_DAYS:],
        "southbound": southbound(days, "SSE Southbound", "SZSE Southbound"),
        "northbound": northbound(days, "SSE Northbound", "SZSE Northbound"),
    }

    root = Path(__file__).resolve().parent.parent
    dest = root / "data" / "stockconnect-latest.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{dest.name}: {len(days)} trading days loaded, "
          f"latest {out['southbound']['latest']['date']}, "
          f"southbound net {out['southbound']['latest']['net']:+.1f}m")


if __name__ == "__main__":
    main()
