#!/usr/bin/env python3
"""Generate a static JSON snapshot for GitHub Pages (no third-party Python packages)."""
import datetime
import json
import pathlib
import shutil
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / "_site"
DEST.mkdir(parents=True, exist_ok=True)
(DEST / "data").mkdir(exist_ok=True)
now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")

def load(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Dolor-Public-Dashboard/1.0 (GitHub Pages; public exchange rates)", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as reply:
        if reply.status != 200:
            raise ValueError(f"HTTP {reply.status}")
        return json.load(reply)

def valid_rate(value):
    n = int(str(value).replace(",", "").strip())
    if not (1000 < n < 1_000_000_000):
        raise ValueError("Unreasonable market rate")
    return n

result = None
try:
    data = load("https://nerkh.jahankhahan.shop/data/live.json")
    toman = valid_rate(data["rates"]["dollar"])
    result = {
        "price_irr": toman * 10, "price_toman": toman, "unit": "IRR",
        "source": "nerkhsanj", "market_date": str(data.get("date") or ""),
        "market_time": str(data.get("time") or ""),
        "fetched_at": now, "stale": not bool(data.get("time"))
    }
except Exception as e:
    print(f"Primary provider unavailable: {e}")
if result is None:
    try:
        payload = load("https://raw.githubusercontent.com/iran-market/iran-market.github.io/main/data/popular.json")
        item = next(item for item in payload["data"] if item.get("symbol") == "USD_IRR_FREE")
        toman = valid_rate(item["price"])
        result = {
            "price_irr": toman * 10, "price_toman": toman, "unit": "IRR",
            "source": "iran-market",
            "market_date": str(item.get("date_jalali") or ""),
            "market_time": str(item.get("timestamp_tehran") or ""),
            "fetched_at": now, "stale": True
        }
    except Exception as e:
        print(f"Backup provider unavailable: {e}")
if result is None:
    result = {
        "price_irr": None, "price_toman": None, "unit": "IRR",
        "source": None, "market_date": None, "market_time": None,
        "fetched_at": now, "stale": True, "error": "Both data sources unavailable"
    }
for path in ["index.html", "config.json"]:
    shutil.copy2(ROOT / path, DEST / path)
(DEST / "data" / "dollar.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(DEST / ".nojekyll").write_text("", encoding="utf-8")
print(json.dumps(result, ensure_ascii=False))
