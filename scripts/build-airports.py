"""Builds src/lib/data/world-airports.json from public airport data.

Sources (download first, then pass the paths):
  OurAirports (public domain): airports.csv and countries.csv from
    https://github.com/davidmegginson/ourairports-data
  mwgg/Airports (MIT), for time zones: airports.json from
    https://github.com/mwgg/Airports

Usage: python3 -I scripts/build-airports.py airports.csv countries.csv mwgg.json
Keeps airports with an IATA code and scheduled passenger flights.
"""

import csv
import json
import sys

airports_csv, countries_csv, mwgg_json = sys.argv[1:4]

with open(mwgg_json, encoding="utf-8") as f:
    mwgg = json.load(f)
tz_by_icao = {k: v.get("tz") for k, v in mwgg.items() if v.get("tz")}
tz_by_iata = {v["iata"]: v.get("tz") for v in mwgg.values() if v.get("iata") and v.get("tz")}

countries = {}
with open(countries_csv, encoding="utf-8") as f:
    for row in csv.DictReader(f):
        countries[row["code"]] = row["name"]

rows = []
missing_tz = 0
seen = set()
with open(airports_csv, encoding="utf-8") as f:
    for row in csv.DictReader(f):
        iata = (row["iata_code"] or "").strip().upper()
        if len(iata) != 3 or not iata.isalpha() or iata in seen:
            continue
        if row["scheduled_service"] != "yes" or row["type"] not in ("large_airport", "medium_airport"):
            continue
        tz = tz_by_icao.get(row["icao_code"]) or tz_by_icao.get(row["ident"]) or tz_by_iata.get(iata)
        if not tz:
            missing_tz += 1
            continue
        seen.add(iata)
        rows.append([
            iata,
            row["name"].strip(),
            (row["municipality"] or "").strip(),
            row["iso_country"],
            round(float(row["latitude_deg"]), 3),
            round(float(row["longitude_deg"]), 3),
            tz,
            3 if row["type"] == "large_airport" else 2,
            row["continent"],
        ])

rows.sort(key=lambda r: r[0])
used = {r[3] for r in rows}
out = {
    "source": "OurAirports (public domain) and mwgg/Airports (MIT) time zones",
    "countries": {k: v for k, v in sorted(countries.items()) if k in used},
    "airports": rows,
}
with open("src/lib/data/world-airports.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print(f"{len(rows)} airports, {len(used)} countries, skipped {missing_tz} without a time zone")
