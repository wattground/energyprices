import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
PRICE_DIR = DATA_DIR / "colocation_prices"
PREFIX = "window.COLOCATION_PRICE_DATA = "


def main():
    profiles = json.loads((DATA_DIR / "generation_profiles.json").read_text(encoding="utf-8"))
    expected_iso3 = set(profiles["technologies"]["solar_pv"]["countries"])
    files = {path.stem: path for path in PRICE_DIR.glob("*.js")}
    if set(files) != expected_iso3:
        raise SystemExit(
            "Colocation country coverage mismatch: "
            f"missing={sorted(expected_iso3 - set(files))}, extra={sorted(set(files) - expected_iso3)}"
        )

    total_days = 0
    total_periods = 0
    for iso3, path in files.items():
        text = path.read_text(encoding="utf-8")
        if not text.startswith(PREFIX) or not text.endswith(";\n"):
            raise SystemExit(f"Malformed JavaScript wrapper: {path}")
        payload = json.loads(text[len(PREFIX):-2])
        if payload.get("iso3") != iso3 or not payload.get("years"):
            raise SystemExit(f"Malformed country payload: {path}")
        for year in payload["years"].values():
            for days in year["months"].values():
                for day, rows in days:
                    if not isinstance(day, int) or len(rows) not in (23, 24, 25):
                        raise SystemExit(f"Invalid market day in {path}: {day}")
                    for hour, price in rows:
                        if not isinstance(hour, int) or not 0 <= hour <= 23 or not math.isfinite(price):
                            raise SystemExit(f"Invalid hourly value in {path}: day={day}, hour={hour}, price={price}")
                    total_days += 1
                    total_periods += len(rows)

    print(f"Colocation country files: {len(files)}")
    print(f"Complete market days: {total_days:,}")
    print(f"Hourly day-ahead prices: {total_periods:,}")


if __name__ == "__main__":
    main()
