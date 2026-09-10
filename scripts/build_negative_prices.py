import csv
import json
import math
from collections import defaultdict
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INPUT_CSV = ROOT / "prices" / "all_countries.csv"
OUTPUT_JSON = ROOT / "data" / "negative_prices.json"
OUTPUT_JS = ROOT / "data" / "negative_prices.js"
SPOT_OUTPUT_JSON = ROOT / "data" / "spot_prices.json"
SPOT_OUTPUT_JS = ROOT / "data" / "spot_prices.js"
PROFILE_OUTPUT_JSON = ROOT / "data" / "generation_profiles.json"
PROFILE_OUTPUT_JS = ROOT / "data" / "generation_profiles.js"
IMPACT_OUTPUT_JSON = ROOT / "data" / "renewable_negative_impact.json"
IMPACT_OUTPUT_JS = ROOT / "data" / "renewable_negative_impact.js"
SITE_META_OUTPUT_JS = ROOT / "data" / "site_meta.js"
PV_PROFILE_SOURCE = ROOT / "data" / "pv_profiles_source.json"


def parse_local_datetime(value):
    return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")


def normalize(values):
    total = sum(values)
    return [value / total if total else 0 for value in values]


def wind_onshore_profile(month):
    winter_factor = {
        1: 1.10, 2: 1.08, 3: 1.04, 4: 0.98, 5: 0.94, 6: 0.90,
        7: 0.88, 8: 0.90, 9: 0.96, 10: 1.02, 11: 1.08, 12: 1.12,
    }[month]
    values = []
    for hour in range(24):
        night_bump = 0.06 * math.cos((hour - 2) / 24 * 2 * math.pi)
        evening_bump = 0.025 * math.cos((hour - 21) / 24 * 2 * math.pi)
        values.append(max(0.01, winter_factor + night_bump + evening_bump))
    return normalize(values)


def mean_monthly_profiles(profiles):
    if not profiles:
        raise ValueError("Cannot average an empty profile list")
    return {
        month: [
            sum(profile[month][hour] for profile in profiles) / len(profiles)
            for hour in range(24)
        ]
        for month in (f"{value:02d}" for value in range(1, 13))
    }


def load_country_pv_profiles(expected_iso3_codes):
    if not PV_PROFILE_SOURCE.exists():
        raise FileNotFoundError(f"PV profile source not found: {PV_PROFILE_SOURCE}")
    with PV_PROFILE_SOURCE.open("r", encoding="utf-8") as handle:
        source = json.load(handle)

    source_profiles = source["sourceProfiles"]
    configs = source["countries"]
    resolved = {}
    resolving = set()

    def resolve(iso3):
        if iso3 in resolved:
            return resolved[iso3]
        if iso3 in resolving:
            raise ValueError(f"Circular PV proxy mapping involving {iso3}")
        if iso3 not in configs:
            raise KeyError(f"Missing PV profile mapping for {iso3}")
        resolving.add(iso3)
        config = configs[iso3]

        if "sourceSheets" in config:
            sheets = config["sourceSheets"]
            raw_months = mean_monthly_profiles([
                source_profiles[sheet]["months"] for sheet in sheets
            ])
            source_countries = [{"iso3": iso3, "name": config["name"], "weight": 1.0}]
            source_sheet_weights = {sheet: 1.0 / len(sheets) for sheet in sheets}
        else:
            donors = config["sourceCountries"]
            donor_profiles = [resolve(donor) for donor in donors]
            raw_months = mean_monthly_profiles([
                profile["rawMonths"] for profile in donor_profiles
            ])
            source_countries = [
                {"iso3": donor, "name": configs[donor]["name"], "weight": 1.0 / len(donors)}
                for donor in donors
            ]
            source_sheet_weights = defaultdict(float)
            for profile in donor_profiles:
                for item in profile["sourceSheets"]:
                    source_sheet_weights[item["sheet"]] += item["weight"] / len(donors)

        daily_sums = {month: sum(values) for month, values in raw_months.items()}
        normalized_months = {
            month: normalize(values) for month, values in raw_months.items()
        }
        result = {
            "name": config["name"],
            "label": config["label"],
            "iso3": iso3,
            "method": config["method"],
            "isEstimated": config["method"] == "proxy_mean",
            "sourceCountries": source_countries,
            "sourceSheets": [
                {"sheet": sheet, "weight": weight}
                for sheet, weight in sorted(source_sheet_weights.items())
            ],
            "months": normalized_months,
            "rawMonths": raw_months,
            "dailySums": daily_sums,
        }
        resolving.remove(iso3)
        resolved[iso3] = result
        return result

    for iso3 in configs:
        resolve(iso3)

    missing = set(expected_iso3_codes) - set(resolved)
    extra = set(resolved) - set(expected_iso3_codes)
    if missing or extra:
        raise ValueError(f"PV country coverage mismatch; missing={sorted(missing)}, extra={sorted(extra)}")
    return source, resolved


def generation_profiles_payload(countries):
    pv_source, pv_countries = load_country_pv_profiles(countries.values())
    technologies = {
        "solar_pv": {
            "label": "Solar PV",
            "description": "Country-specific monthly hourly photovoltaic profiles extracted from profili pv.xlsx; proxy countries use documented equal-weight donor averages.",
            "profileScope": "country",
            "countries": pv_countries,
        },
        "wind_onshore": {
            "label": "Wind onshore",
            "description": "Synthetic monthly hourly wind generation profile, normalized so each month sums to 1 across 24 hours.",
            "months": {},
        },
    }
    for month in range(1, 13):
        key = f"{month:02d}"
        technologies["wind_onshore"]["months"][key] = wind_onshore_profile(month)
    return {
        "source": {
            "solar_pv": str(PV_PROFILE_SOURCE.relative_to(ROOT)).replace("\\", "/"),
            "wind_onshore": "synthetic profiles generated by scripts/build_negative_prices.py",
        },
        "normalization": "The months used for captured prices sum to 1 across 24 hours. Solar rawMonths preserve the workbook's seasonal scale.",
        "solarProfileMethodology": pv_source["source"],
        "technologies": technologies,
    }


def technology_month_profile(technology, iso3, month, preserve_seasonality=False):
    if technology.get("profileScope") == "country":
        country_profile = technology["countries"][iso3]
        key = "rawMonths" if preserve_seasonality else "months"
        return country_profile[key][month]
    return technology["months"][month]


def blank_impact_bucket(label):
    return {
        "label": label,
        "totalVolume": 0.0,
        "negativeVolume": 0.0,
        "continuousVolume": 0.0,
        "negativeShare": None,
        "continuousShare": None,
    }


def finalize_impact_bucket(bucket):
    total = bucket["totalVolume"]
    bucket["negativeShare"] = round(bucket["negativeVolume"] / total, 6) if total else None
    bucket["continuousShare"] = round(bucket["continuousVolume"] / total, 6) if total else None
    bucket["totalVolume"] = round(total, 6)
    del bucket["negativeVolume"]
    del bucket["continuousVolume"]


def build_impact_payload(countries, months_by_country, hourly_rows_by_country, profile_payload, latest_local_date):
    payload = {
        "source": str(INPUT_CSV.relative_to(ROOT)).replace("\\", "/"),
        "latestLocalDate": latest_local_date.isoformat() if latest_local_date else None,
        "methodology": (
            "For each observed calendar day, the denominator is the full theoretical daily generation profile. "
            "All negative volume sums profile weights in every negative-price hour. Continuous volume sums profile "
            "weights in every hour belonging to negative-price runs of at least six consecutive observed hours."
        ),
        "countries": [
            {
                "name": country,
                "iso3": countries[country],
                "years": sorted({month[:4] for month in months_by_country[country]}),
            }
            for country in sorted(countries)
        ],
        "technologies": {
            key: {"label": value["label"]}
            for key, value in profile_payload["technologies"].items()
        },
        "series": {},
    }

    for country, rows in hourly_rows_by_country.items():
        sorted_rows = sorted(rows, key=lambda item: item["local_dt"])
        continuous_keys = set()
        run = []
        previous_dt = None

        def close_run():
            if len(run) >= 6:
                continuous_keys.update(item["key"] for item in run)
            run.clear()

        for item in sorted_rows:
            if item["price"] < 0:
                if run and previous_dt is not None:
                    gap_hours = (item["local_dt"] - previous_dt).total_seconds() / 3600
                    if gap_hours > 1:
                        close_run()
                run.append(item)
            else:
                close_run()
            previous_dt = item["local_dt"]
        close_run()

        payload["series"][country] = {"technologies": {}}
        observed_days = sorted({item["local_dt"].strftime("%Y-%m-%d") for item in sorted_rows})

        country_iso3 = countries[country]
        for tech_key, tech in profile_payload["technologies"].items():
            years = {}

            for day_key in observed_days:
                year_key = day_key[:4]
                month_key = day_key[:7]
                day_label = str(int(day_key[8:10]))
                years.setdefault(year_key, blank_impact_bucket(year_key))
                years[year_key].setdefault("months", {})
                years[year_key]["months"].setdefault(month_key, blank_impact_bucket(month_key))
                years[year_key]["months"][month_key].setdefault("days", {})
                years[year_key]["months"][month_key]["days"][day_key] = blank_impact_bucket(day_label)
                daily_volume = sum(technology_month_profile(
                    tech, country_iso3, month_key[5:7], preserve_seasonality=True
                ))
                years[year_key]["totalVolume"] += daily_volume
                years[year_key]["months"][month_key]["totalVolume"] += daily_volume
                years[year_key]["months"][month_key]["days"][day_key]["totalVolume"] = daily_volume

            for item in sorted_rows:
                local_dt = item["local_dt"]
                year_key = local_dt.strftime("%Y")
                month_key = local_dt.strftime("%Y-%m")
                day_key = local_dt.strftime("%Y-%m-%d")
                hour_weight = technology_month_profile(
                    tech, country_iso3, local_dt.strftime("%m"), preserve_seasonality=True
                )[local_dt.hour]
                if item["price"] < 0:
                    years[year_key]["negativeVolume"] += hour_weight
                    years[year_key]["months"][month_key]["negativeVolume"] += hour_weight
                    years[year_key]["months"][month_key]["days"][day_key]["negativeVolume"] += hour_weight
                if item["key"] in continuous_keys:
                    years[year_key]["continuousVolume"] += hour_weight
                    years[year_key]["months"][month_key]["continuousVolume"] += hour_weight
                    years[year_key]["months"][month_key]["days"][day_key]["continuousVolume"] += hour_weight

            for year_bucket in years.values():
                finalize_impact_bucket(year_bucket)
                for month_bucket in year_bucket["months"].values():
                    finalize_impact_bucket(month_bucket)
                    month_bucket["days"] = [
                        day_bucket
                        for _, day_bucket in sorted(month_bucket["days"].items())
                    ]
                    for day_bucket in month_bucket["days"]:
                        finalize_impact_bucket(day_bucket)

            payload["series"][country]["technologies"][tech_key] = {
                "years": {
                    year_key: years[year_key]
                    for year_key in sorted(years)
                }
            }

    return payload


def best_two_cycle_spread(prices_by_hour):
    if not prices_by_hour:
        return None
    prices = list(prices_by_hour)
    if len(prices) != 24:
        return None
    if any(value is None for value in prices):
        return None

    buy_sum = [prices[i] + prices[i + 1] for i in range(23)]
    sell_sum = [prices[i] + prices[i + 1] for i in range(23)]

    # Enumerate valid 2h charge / 2h discharge cycles.
    # charge block start c (covers c,c+1), discharge block start s (covers s,s+1),
    # require discharge to start strictly after charge block ends: s >= c+2.
    cycles = []
    for charge_start in range(23):
        for sell_start in range(charge_start + 2, 23):
            cycles.append(
                {
                    "start": charge_start,
                    "end": sell_start + 2,  # boundary hour when discharge finishes
                    "profit": sell_sum[sell_start] - buy_sum[charge_start],
                }
            )

    # Best one-cycle profit ending at or before each boundary (0..24).
    best_end = [None] * 25
    for cycle in cycles:
        end = cycle["end"]
        profit = cycle["profit"]
        if best_end[end] is None or profit > best_end[end]:
            best_end[end] = profit
    best_prefix = [None] * 25
    running = None
    for boundary in range(25):
        if best_end[boundary] is not None and (running is None or best_end[boundary] > running):
            running = best_end[boundary]
        best_prefix[boundary] = running

    # Best one-cycle profit starting at or after each boundary (0..24).
    best_start = [None] * 25
    for cycle in cycles:
        start = cycle["start"]
        profit = cycle["profit"]
        if best_start[start] is None or profit > best_start[start]:
            best_start[start] = profit
    best_suffix = [None] * 25
    running = None
    for boundary in range(24, -1, -1):
        if best_start[boundary] is not None and (running is None or best_start[boundary] > running):
            running = best_start[boundary]
        best_suffix[boundary] = running

    best_two = None
    for boundary in range(25):
        left = best_prefix[boundary]
        right = best_suffix[boundary]
        if left is None or right is None:
            continue
        total = left + right
        if best_two is None or total > best_two:
            best_two = total

    if best_two is None:
        return None
    return best_two / 4.0


SPREAD_AVERAGE_FIELDS = {
    "tb1Spread": "averageTb1Spread",
    "tb2Spread": "averageTb2Spread",
    "tb4Spread": "averageTb4Spread",
    "bess2hOneCycleSpread": "averageBess2hOneCycleSpread",
    "bess2hTwoCycleSpread": "averageBess2hTwoCycleSpread",
}
SPREAD_INDEX_ORDER = tuple(SPREAD_AVERAGE_FIELDS)


def top_bottom_spread(prices, duration):
    """Cumulative top-minus-bottom spread for a 1 MW asset, in EUR/MW/day."""
    if len(prices) not in (23, 24, 25) or len(prices) < duration * 2:
        return None
    ordered = sorted(prices)
    return sum(ordered[-duration:]) - sum(ordered[:duration])


def bess_2h_dispatch_spreads(prices):
    """Optimal one- and two-cycle margins for a 1 MW / 2 MWh BESS.

    The battery starts and ends empty, has 100% efficiency, can charge or discharge
    at most 1 MW per market period, and may discharge at most 2 MWh per equivalent
    cycle. Idling and partial cycles are allowed, so the result cannot be negative.
    """
    if len(prices) not in (23, 24, 25):
        return None, None
    capacity = 2
    discharge_limit = capacity * 2
    states = {(0, 0): 0.0}  # (state of charge, discharged throughput) -> margin
    for price in prices:
        next_states = {}
        for (state_of_charge, discharged), margin in states.items():
            actions = [(state_of_charge, discharged, margin)]
            if state_of_charge < capacity:
                actions.append((state_of_charge + 1, discharged, margin - price))
            if state_of_charge > 0 and discharged < discharge_limit:
                actions.append((state_of_charge - 1, discharged + 1, margin + price))
            for next_soc, next_discharged, next_margin in actions:
                key = (next_soc, next_discharged)
                if key not in next_states or next_margin > next_states[key]:
                    next_states[key] = next_margin
        states = next_states
    finished = [
        (discharged, margin)
        for (state_of_charge, discharged), margin in states.items()
        if state_of_charge == 0
    ]
    one_cycle = max([0.0] + [margin for discharged, margin in finished if discharged <= capacity])
    two_cycles = max([0.0] + [margin for _, margin in finished])
    return one_cycle, two_cycles


def bess_2h_dispatch_spread(prices, max_cycles):
    if max_cycles not in (1, 2):
        raise ValueError("max_cycles must be 1 or 2")
    return bess_2h_dispatch_spreads(prices)[max_cycles - 1]


def daily_spread_indexes(prices):
    bess_one_cycle, bess_two_cycles = bess_2h_dispatch_spreads(prices)
    return {
        "tb1Spread": top_bottom_spread(prices, 1),
        "tb2Spread": top_bottom_spread(prices, 2),
        "tb4Spread": top_bottom_spread(prices, 4),
        "bess2hOneCycleSpread": bess_one_cycle,
        "bess2hTwoCycleSpread": bess_two_cycles,
    }


def mean_or_none(values):
    return sum(values) / len(values) if values else None


def captured_price(prices_by_hour, weights):
    weighted_total = 0.0
    weight_total = 0.0
    for price, weight in zip(prices_by_hour, weights):
        if price is not None and weight > 0:
            weighted_total += price * weight
            weight_total += weight
    return weighted_total / weight_total if weight_total else None


def main():
    if not INPUT_CSV.exists():
        raise FileNotFoundError(f"Input CSV not found: {INPUT_CSV}")

    countries = {}
    months_by_country = defaultdict(set)
    negative_by_day = defaultdict(lambda: defaultdict(int))
    negative_by_hour = defaultdict(lambda: defaultdict(int))
    consecutive_by_day = defaultdict(lambda: defaultdict(int))
    current_negative_streak = defaultdict(int)
    observed_days_by_month = defaultdict(set)
    spot_year = defaultdict(lambda: {"sum": 0.0, "count": 0})
    spot_month = defaultdict(lambda: {"sum": 0.0, "count": 0})
    spot_day = defaultdict(lambda: {"sum": 0.0, "count": 0, "min": None, "max": None})
    spot_hour = defaultdict(lambda: {"sum": 0.0, "count": 0})
    spot_day_prices = defaultdict(lambda: [None] * 24)
    spot_day_periods = defaultdict(list)
    hourly_rows_by_country = defaultdict(list)
    total_observations = 0
    total_negative = 0
    skipped_rows = 0
    latest_local_date = None

    with INPUT_CSV.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)

        for row in reader:
            country = row["Country"].strip()
            iso3 = row["ISO3 Code"].strip()
            try:
                utc_dt = parse_local_datetime(row["Datetime (UTC)"].strip())
                local_dt = parse_local_datetime(row["Datetime (Local)"].strip())
                price = float(row["Price (EUR/MWhe)"])
            except (KeyError, TypeError, ValueError):
                skipped_rows += 1
                continue

            month_key = local_dt.strftime("%Y-%m")
            year_key = local_dt.strftime("%Y")
            day_key = str(local_dt.day)
            date_key = local_dt.strftime("%Y-%m-%d")

            countries[country] = iso3
            row_key = (country, local_dt.isoformat(), total_observations)
            hourly_rows_by_country[country].append(
                {
                    "key": row_key,
                    "local_dt": local_dt,
                    "price": price,
                }
            )
            months_by_country[country].add(month_key)
            observed_days_by_month[(country, month_key)].add(day_key)
            if latest_local_date is None or local_dt.date() > latest_local_date:
                latest_local_date = local_dt.date()
            total_observations += 1
            spot_year[(country, year_key)]["sum"] += price
            spot_year[(country, year_key)]["count"] += 1
            spot_month[(country, month_key)]["sum"] += price
            spot_month[(country, month_key)]["count"] += 1
            spot_day[(country, month_key, day_key)]["sum"] += price
            spot_day[(country, month_key, day_key)]["count"] += 1
            spot_hour[(country, month_key, local_dt.hour)]["sum"] += price
            spot_hour[(country, month_key, local_dt.hour)]["count"] += 1
            spot_day_prices[(country, month_key, day_key)][local_dt.hour] = price
            spot_day_periods[(country, month_key, day_key)].append((utc_dt, price))
            if spot_day[(country, month_key, day_key)]["min"] is None or price < spot_day[(country, month_key, day_key)]["min"]:
                spot_day[(country, month_key, day_key)]["min"] = price
            if spot_day[(country, month_key, day_key)]["max"] is None or price > spot_day[(country, month_key, day_key)]["max"]:
                spot_day[(country, month_key, day_key)]["max"] = price

            if price < 0:
                negative_by_day[(country, month_key)][day_key] += 1
                negative_by_hour[(country, month_key)][str(local_dt.hour)] += 1
                current_negative_streak[(country, date_key)] += 1
                consecutive_by_day[(country, month_key)][day_key] = max(
                    consecutive_by_day[(country, month_key)][day_key],
                    current_negative_streak[(country, date_key)],
                )
                total_negative += 1
            else:
                current_negative_streak[(country, date_key)] = 0

    series = {}
    for country, months in months_by_country.items():
        series[country] = {}
        for month_key in sorted(months):
            year, month = map(int, month_key.split("-"))
            if month == 12:
                next_month = datetime(year + 1, 1, 1)
            else:
                next_month = datetime(year, month + 1, 1)
            current_month = datetime(year, month, 1)
            days_in_month = (next_month - current_month).days

            days = []
            cumulative = 0
            counts = negative_by_day[(country, month_key)]
            hourly_counts = negative_by_hour[(country, month_key)]
            consecutive_counts = consecutive_by_day[(country, month_key)]
            for day in range(1, days_in_month + 1):
                negatives = counts.get(str(day), 0)
                cumulative += negatives
                days.append(
                    {
                        "day": day,
                        "negativePrices": negatives,
                        "maxConsecutiveNegativePrices": consecutive_counts.get(str(day), 0),
                        "otherNegativePrices": max(
                            0,
                            negatives - consecutive_counts.get(str(day), 0),
                        ),
                        "cumulativeNegativePrices": cumulative,
                    }
                )

            observed_days = len(observed_days_by_month[(country, month_key)])
            series[country][month_key] = {
                "days": days,
                "daysInMonth": days_in_month,
                "observedDays": observed_days,
                "isCompleteMonth": observed_days == days_in_month,
                "hourlyNegativePrices": [
                    hourly_counts.get(str(hour), 0)
                    for hour in range(24)
                ],
                "totalNegativePrices": cumulative,
                "daysWithNegativePrices": sum(1 for item in days if item["negativePrices"] > 0),
                "maxConsecutiveNegativePrices": max(
                    (item["maxConsecutiveNegativePrices"] for item in days),
                    default=0,
                ),
            }

    payload = {
        "source": str(INPUT_CSV.relative_to(ROOT)).replace("\\", "/"),
        "generatedFromRows": total_observations,
        "skippedRows": skipped_rows,
        "totalNegativePrices": total_negative,
        "latestLocalDate": latest_local_date.isoformat() if latest_local_date else None,
        "countries": [
            {
                "name": country,
                "iso3": countries[country],
                "months": sorted(months_by_country[country]),
            }
            for country in sorted(countries)
        ],
        "series": series,
    }

    profile_payload = generation_profiles_payload(countries)
    spot_series = {}
    for country, months in months_by_country.items():
        years = sorted({month[:4] for month in months})
        spot_series[country] = {"years": {}}
        for year in years:
            year_bucket = spot_year[(country, year)]
            year_average = year_bucket["sum"] / year_bucket["count"] if year_bucket["count"] else None
            year_spreads = []
            year_index_values = {field: [] for field in SPREAD_AVERAGE_FIELDS}
            spot_series[country]["years"][year] = {
                "averagePrice": year_average,
                "observations": year_bucket["count"],
                "averageDailySpread": None,
                "months": {},
            }

            for month_key in sorted(month for month in months if month.startswith(f"{year}-")):
                month_bucket = spot_month[(country, month_key)]
                month_average = month_bucket["sum"] / month_bucket["count"] if month_bucket["count"] else None
                month_spreads = []
                month_spreads_two_cycle = []
                month_index_values = {field: [] for field in SPREAD_AVERAGE_FIELDS}
                month_number = int(month_key[5:7])
                next_month = datetime(int(year) + (1 if month_number == 12 else 0), 1 if month_number == 12 else month_number + 1, 1)
                current_month = datetime(int(year), month_number, 1)
                days_in_month = (next_month - current_month).days

                days = []
                hourly_average_prices = []
                for hour in range(24):
                    hour_bucket = spot_hour[(country, month_key, hour)]
                    hourly_average_prices.append(
                        hour_bucket["sum"] / hour_bucket["count"] if hour_bucket["count"] else None
                    )

                for day in range(1, days_in_month + 1):
                    day_bucket = spot_day[(country, month_key, str(day))]
                    day_prices = spot_day_prices[(country, month_key, str(day))]
                    period_prices = [
                        price
                        for _, price in sorted(
                            spot_day_periods[(country, month_key, str(day))],
                            key=lambda item: item[0],
                        )
                    ]
                    average = day_bucket["sum"] / day_bucket["count"] if day_bucket["count"] else None
                    captured_prices = {
                        tech_key: captured_price(
                            day_prices,
                            technology_month_profile(
                                technology,
                                countries[country],
                                month_key[5:7],
                            ),
                        )
                        for tech_key, technology in profile_payload["technologies"].items()
                    }
                    spread = (
                        day_bucket["max"] - day_bucket["min"]
                        if day_bucket["count"] and day_bucket["min"] is not None and day_bucket["max"] is not None
                        else None
                    )
                    spread_two_cycle = best_two_cycle_spread(day_prices) if day_bucket["count"] else None
                    index_values = daily_spread_indexes(period_prices) if day_bucket["count"] else {
                        field: None for field in SPREAD_AVERAGE_FIELDS
                    }
                    for field, value in index_values.items():
                        if value is not None:
                            month_index_values[field].append(value)
                            year_index_values[field].append(value)
                    if spread is not None:
                        month_spreads.append(spread)
                        year_spreads.append(spread)
                    if spread_two_cycle is not None:
                        month_spreads_two_cycle.append(spread_two_cycle)
                    days.append(
                        {
                            "day": day,
                            "averagePrice": average,
                            "minPrice": day_bucket["min"],
                            "maxPrice": day_bucket["max"],
                            "dailySpread": spread,
                            "dailySpreadTwoCycle2h": spread_two_cycle,
                            "spreadIndexes": [index_values[field] for field in SPREAD_INDEX_ORDER],
                            "observations": day_bucket["count"],
                            "capturedPrices": captured_prices,
                        }
                    )

                month_result = {
                    "averagePrice": month_average,
                    "averageDailySpread": sum(month_spreads) / len(month_spreads) if month_spreads else None,
                    "averageDailySpreadTwoCycle2h": sum(month_spreads_two_cycle) / len(month_spreads_two_cycle) if month_spreads_two_cycle else None,
                    "spreadDays": len(month_index_values["tb1Spread"]),
                    "observations": month_bucket["count"],
                    "hourlyAveragePrices": hourly_average_prices,
                    "days": days,
                }
                month_result["averageSpreadIndexes"] = [
                    mean_or_none(month_index_values[field]) for field in SPREAD_INDEX_ORDER
                ]
                spot_series[country]["years"][year]["months"][month_key] = month_result

            spot_series[country]["years"][year]["averageDailySpread"] = (
                sum(year_spreads) / len(year_spreads) if year_spreads else None
            )
            year_two_cycle_values = [
                spot_series[country]["years"][year]["months"][month_key]["averageDailySpreadTwoCycle2h"]
                for month_key in spot_series[country]["years"][year]["months"]
                if spot_series[country]["years"][year]["months"][month_key]["averageDailySpreadTwoCycle2h"] is not None
            ]
            spot_series[country]["years"][year]["averageDailySpreadTwoCycle2h"] = (
                sum(year_two_cycle_values) / len(year_two_cycle_values) if year_two_cycle_values else None
            )
            spot_series[country]["years"][year]["spreadDays"] = len(year_index_values["tb1Spread"])
            spot_series[country]["years"][year]["averageSpreadIndexes"] = [
                mean_or_none(year_index_values[field]) for field in SPREAD_INDEX_ORDER
            ]

    spot_payload = {
        "source": str(INPUT_CSV.relative_to(ROOT)).replace("\\", "/"),
        "generatedFromRows": total_observations,
        "skippedRows": skipped_rows,
        "latestLocalDate": latest_local_date.isoformat() if latest_local_date else None,
        "spreadIndexOrder": list(SPREAD_INDEX_ORDER),
        "countries": [
            {
                "name": country,
                "iso3": countries[country],
                "years": sorted({month[:4] for month in months_by_country[country]}),
            }
            for country in sorted(countries)
        ],
        "series": spot_series,
    }
    impact_payload = build_impact_payload(
        countries,
        months_by_country,
        hourly_rows_by_country,
        profile_payload,
        latest_local_date,
    )

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_JSON.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)

    with OUTPUT_JS.open("w", encoding="utf-8") as handle:
        handle.write("window.NEGATIVE_PRICE_DATA = ")
        json.dump(payload, handle, ensure_ascii=False)
        handle.write(";\n")

    with SPOT_OUTPUT_JSON.open("w", encoding="utf-8") as handle:
        json.dump(spot_payload, handle, ensure_ascii=False, indent=2)

    with SPOT_OUTPUT_JS.open("w", encoding="utf-8") as handle:
        handle.write("window.SPOT_PRICE_DATA = ")
        json.dump(spot_payload, handle, ensure_ascii=False)
        handle.write(";\n")

    with PROFILE_OUTPUT_JSON.open("w", encoding="utf-8") as handle:
        json.dump(profile_payload, handle, ensure_ascii=False, indent=2)

    with PROFILE_OUTPUT_JS.open("w", encoding="utf-8") as handle:
        handle.write("window.GENERATION_PROFILE_DATA = ")
        json.dump(profile_payload, handle, ensure_ascii=False)
        handle.write(";\n")

    with IMPACT_OUTPUT_JSON.open("w", encoding="utf-8") as handle:
        json.dump(impact_payload, handle, ensure_ascii=False, indent=2)

    with IMPACT_OUTPUT_JS.open("w", encoding="utf-8") as handle:
        handle.write("window.RENEWABLE_NEGATIVE_IMPACT_DATA = ")
        json.dump(impact_payload, handle, ensure_ascii=False)
        handle.write(";\n")

    with SITE_META_OUTPUT_JS.open("w", encoding="utf-8") as handle:
        handle.write("window.SITE_META = ")
        json.dump({"latestLocalDate": latest_local_date.isoformat() if latest_local_date else None}, handle)
        handle.write(";\n")
        handle.write(
            "document.querySelectorAll('[data-latest-date]').forEach(function (element) {\n"
            "  var value = window.SITE_META.latestLocalDate;\n"
            "  if (!value) { element.textContent = 'Latest available date: -'; return; }\n"
            "  var parts = value.split('-').map(Number);\n"
            "  var formatted = new Intl.DateTimeFormat('en', { day: '2-digit', month: 'long', year: 'numeric' })\n"
            "    .format(new Date(parts[0], parts[1] - 1, parts[2]));\n"
            "  element.textContent = 'Latest available date: ' + formatted;\n"
            "});\n"
        )

    print(f"Wrote {OUTPUT_JSON}")
    print(f"Wrote {OUTPUT_JS}")
    print(f"Wrote {SPOT_OUTPUT_JSON}")
    print(f"Wrote {SPOT_OUTPUT_JS}")
    print(f"Wrote {PROFILE_OUTPUT_JSON}")
    print(f"Wrote {PROFILE_OUTPUT_JS}")
    print(f"Wrote {IMPACT_OUTPUT_JSON}")
    print(f"Wrote {IMPACT_OUTPUT_JS}")
    print(f"Wrote {SITE_META_OUTPUT_JS}")
    print(f"Rows processed: {total_observations:,}")
    print(f"Rows skipped: {skipped_rows:,}")
    print(f"Negative prices: {total_negative:,}")


if __name__ == "__main__":
    main()
