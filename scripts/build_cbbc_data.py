#!/usr/bin/env python3
"""Build data/cbbc-latest.json from HKEX's public CBBC files.

Sources (all public, no auth):
  full list  https://www.hkex.com.hk/eng/cbbc/search/cbbcFullList.csv
             attrs + outstanding %, refreshed ~06:15 HKT each trading morning
  monthly    https://www.hkex.com.hk/eng/cbbc/download/CBBC{MM}.zip
             per-CBBC daily rows (outstanding, turnover), appended nightly
  MCE today  https://www.hkex.com.hk/eng/cbbc/mce/mcetoday.htm
             intraday, entries appear 30-60 min after each call event

Dev usage (offline):
  python3 scripts/build_cbbc_data.py --fulllist f.csv --monthly a.csv b.csv --mce m.html
"""
import argparse
import csv
import io
import json
import re
import sys
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

FULL_LIST = "https://www.hkex.com.hk/eng/cbbc/search/cbbcFullList.csv"
MONTHLY = "https://www.hkex.com.hk/eng/cbbc/download/CBBC{:02d}.zip"
MCE_URL = "https://www.hkex.com.hk/eng/cbbc/mce/mcetoday.htm"
INDEXES = ["HSI", "HSCEI", "HSTECH"]
TOP_STOCKS = 6
TOP_ISSUERS = 10
TREND_DAYS = 30
NEWLIST_DAYS = 12
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

ISSUERS = {
    "BI": "BOCI 中銀", "BP": "BNP 法巴", "CT": "Citi 花旗", "EL": "Everbright 光大",
    "GJ": "GTJA 國泰君安", "GS": "Goldman 高盛", "HS": "HSBC 滙豐", "HT": "Haitong 海通",
    "JP": "J.P. Morgan 摩通", "MB": "Macquarie 麥格理", "MS": "M. Stanley 大摩",
    "SG": "SocGen 法興", "UB": "UBS 瑞銀", "VT": "Vontobel"
}


def http_get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (personal educational project; ytsang.com)",
        "Referer": "https://www.hkex.com.hk/eng/cbbc/search/listsearch.asp",
    })
    return urllib.request.urlopen(req, timeout=90).read()


def nice_step(x: float) -> float:
    import math
    if x <= 0:
        return 1.0
    exp = math.floor(math.log10(x))
    frac = x / 10 ** exp
    best = min((1, 2, 2.5, 5, 10), key=lambda n: abs(n - frac))
    return best * 10 ** exp


def bucket_of(call: float, step: float) -> float:
    lv = int(call / step + 1e-9) * step
    return round(lv, 2) if step < 1 else lv


def parse_full_list(lines: list[str]):
    m = re.match(r"Updated: (\S+)(?: \(except for O/S \(%\) below: ([^)]+)\))?", lines[0])
    updated = m.group(1) if m else lines[0][:40]
    os_asof = (m.group(2) or updated) if m else updated
    rows = list(csv.reader(lines[1:], delimiter="\t"))
    hdr = rows[0]
    i = {c: n for n, c in enumerate(hdr)}
    attrs = {}   # code -> dict
    for r in rows[1:]:
        if len(r) < len(hdr):
            continue
        side = r[i["Bull/Bear"]].strip()
        if side not in ("Bull", "Bear"):
            continue
        try:
            attrs[r[i["CBBC Code"]].strip()] = {
                "ul": r[i["UL"]].strip(),
                "side": side,
                "call": float(r[i["Call Level"]].replace(",", "")),
                "ratio": float(r[i["Entitlement Ratio^"]].replace(",", "")),
                "size": float(r[i["Total Issue Size"]].replace(",", "")),
                "os": float(r[i["O/S (%)"]]) / 100,
                "issuer": r[i["Issuer"]].strip(),
                "listed": r[i["Listing"]].strip(),      # dd-mm-yyyy
            }
        except ValueError:
            continue
    return updated, os_asof, attrs


def parse_monthly(text: str):
    """-> ({date: {code: outstanding_shares}}, {code: (ul, side)})"""
    rows = list(csv.reader(text.splitlines(), delimiter="\t"))
    hdr = rows[0]
    i = {c: n for n, c in enumerate(hdr)}
    out = defaultdict(dict)
    meta = {}
    ci, di, oi = i["CBBC Code"], i["Trade Date"], i["No. of CBBC still out in market *"]
    ui, si = i["Underlying"], i["Bull/Bear"]
    for r in rows[1:]:
        if len(r) <= max(ci, di, oi, ui, si):
            continue
        code = r[ci].strip()
        try:
            out[r[di]][code] = float(r[oi].replace(",", ""))
        except ValueError:
            continue
        if code not in meta:
            meta[code] = (r[ui].strip(), r[si].strip())
    return out, meta


def parse_mce(html: str):
    m = re.search(r"Update Date: ([^<\n]+)", html)
    asof = m.group(1).strip() if m else ""
    items = []
    for row in re.findall(r"<tr><td>.*?</tr>", html, re.S):
        cells = [re.sub(r"<[^>]+>|\s+", " ", c).strip()
                 for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
        if len(cells) < 4 or not cells[0].isdigit():
            continue
        name = cells[1]
        side = "Bull" if re.search(r" RC", name) else ("Bear" if re.search(r" RP", name) else "?")
        ul = ""
        um = re.match(r"..#(\S+)", name)
        if um:
            ul = um.group(1)
        items.append([cells[0], name, cells[2], cells[3], side, ul])
    items.sort(key=lambda x: x[3], reverse=True)
    return asof, items


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fulllist")
    ap.add_argument("--monthly", nargs="*")
    ap.add_argument("--mce")
    a = ap.parse_args()

    # ---- load sources
    if a.fulllist:
        fl_lines = Path(a.fulllist).read_text(encoding="utf-16").splitlines()
    else:
        fl_lines = http_get(FULL_LIST).decode("utf-16").splitlines()
    updated, os_asof, attrs = parse_full_list(fl_lines)

    daily, mcode = {}, {}
    if a.monthly:
        for p in a.monthly:
            d, m = parse_monthly(Path(p).read_text(encoding="utf-16"))
            daily.update(d)
            mcode.update(m)
    else:
        now = datetime.now(timezone.utc)
        months = [now.month] if now.day >= 20 else [(now.month - 2) % 12 + 1, now.month]
        for mm in months:
            try:
                z = zipfile.ZipFile(io.BytesIO(http_get(MONTHLY.format(mm))))
                for n in z.namelist():
                    d, m = parse_monthly(z.read(n).decode("utf-16"))
                    daily.update(d)
                    mcode.update(m)
            except Exception as e:      # keep going: trend is best-effort
                print(f"warn: monthly {mm:02d} failed: {e}", file=sys.stderr)

    mce_asof, mce_items = "", []
    try:
        html = Path(a.mce).read_text(encoding="utf-8", errors="replace") if a.mce \
            else http_get(MCE_URL).decode("utf-8", errors="replace")
        mce_asof, mce_items = parse_mce(html)
    except Exception as e:
        print(f"warn: MCE fetch failed: {e}", file=sys.stderr)

    dates = sorted(daily, key=lambda d: d)           # ISO yyyy-mm-dd sorts fine
    prev_date = dates[-2] if len(dates) >= 2 else None

    # ---- pick underlyings
    per_ul = defaultdict(list)                        # ul -> [(code, attr)]
    for code, at in attrs.items():
        if at["os"] > 0 and at["ratio"] > 0:
            per_ul[at["ul"]].append((code, at))
    stocks = sorted((ul for ul in per_ul if ul not in INDEXES),
                    key=lambda ul: -len(per_ul[ul]))[:TOP_STOCKS]
    selected = [ul for ul in INDEXES if ul in per_ul] + stocks

    def units(at, outstanding_shares=None):
        shares = at["os"] * at["size"] if outstanding_shares is None else outstanding_shares
        return shares / at["ratio"]

    out_uls = {}
    for ul in selected:
        recs = per_ul[ul]
        bulls = [at["call"] for _, at in recs if at["side"] == "Bull"]
        bears = [at["call"] for _, at in recs if at["side"] == "Bear"]
        if not bulls or not bears:
            continue
        spot = (max(bulls) + min(bears)) / 2
        step = nice_step(spot * 0.004)

        buckets = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])   # bull, bear, prev_bull, prev_bear
        for code, at in recs:
            b = buckets[bucket_of(at["call"], step)]
            b[0 if at["side"] == "Bull" else 1] += units(at)
        if prev_date:
            for code, shares in daily.get(prev_date, {}).items():
                at = attrs.get(code)
                if at and at["ul"] == ul and shares > 0 and at["ratio"] > 0:
                    b = buckets[bucket_of(at["call"], step)]
                    b[2 if at["side"] == "Bull" else 3] += shares / at["ratio"]

        issuers = defaultdict(lambda: [0.0, 0.0])
        for code, at in recs:
            issuers[at["issuer"]][0 if at["side"] == "Bull" else 1] += units(at)
        top_iss = sorted(issuers.items(), key=lambda kv: -(kv[1][0] + kv[1][1]))[:TOP_ISSUERS]

        trend = []
        for d in dates[-TREND_DAYS:]:
            tb = tr = 0.0
            for code, shares in daily[d].items():
                at = attrs.get(code)
                if at and at["ul"] == ul and shares > 0 and at["ratio"] > 0:
                    if at["side"] == "Bull":
                        tb += shares / at["ratio"]
                    else:
                        tr += shares / at["ratio"]
            trend.append([d[5:], round(tb), round(tr)])          # "mm-dd"

        # New listings from first appearance in the daily files — the active
        # full list alone would undercount: contracts listed then called
        # within days (common in fast markets) vanish from it.
        newlist = defaultdict(lambda: [0, 0])
        if dates:
            first_seen = {}
            for d in dates:
                for code in daily[d]:
                    first_seen.setdefault(code, d)
            recent = [d for d in dates[1:]][-10:]     # skip window edge
            for code, d0 in first_seen.items():
                cul, cside = mcode.get(code, ("", ""))
                if cul == ul and d0 in recent and cside in ("Bull", "Bear"):
                    newlist[d0[5:]][0 if cside == "Bull" else 1] += 1

        en, zh = NAMES.get(ul, (ul, ul))
        out_uls[ul] = {
            "en": en, "zh": zh, "step": step, "spot": round(spot, 2),
            "bull": round(sum(units(at) for _, at in recs if at["side"] == "Bull")),
            "bear": round(sum(units(at) for _, at in recs if at["side"] == "Bear")),
            "n": len(recs),
            "buckets": [[lv] + [round(v) for v in b] for lv, b in sorted(buckets.items())],
            "issuers": [[c, ISSUERS.get(c, c), round(v[0]), round(v[1])] for c, v in top_iss],
            "trend": trend,
            "newlist": [[d] + v for d, v in sorted(newlist.items())],
        }

    root = Path(__file__).resolve().parent.parent
    out = {
        "updated": updated,
        "os_asof": os_asof,
        "mce_asof": mce_asof,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "mce": {"count": len(mce_items), "items": mce_items[:60]},
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

    print(f"{dest.name}: {len(out_uls)} underlyings, {len(dates)} trend days, "
          f"{len(mce_items)} MCEs today · updated {updated}, O/S {os_asof}")


if __name__ == "__main__":
    main()
