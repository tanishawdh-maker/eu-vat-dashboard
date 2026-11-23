"""Validate the EU VAT rates dataset before it is published.

Run:  python scripts/validate_data.py
Exits with code 1 and lists every problem if any check fails.
"""
import csv
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data" / "vat_rates_eu_2026.csv"
EU_MIN_STANDARD = 15.0  # EU VAT Directive minimum standard rate
EXPECTED_COLUMNS = ["country", "code", "standard", "reduced", "super_reduced", "parking"]
EU_CODES = {
    "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR", "HR", "HU",
    "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
}


def to_float(value):
    return None if value in ("", None) else float(value)


def validate(path=DATA):
    errors = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != EXPECTED_COLUMNS:
            return [f"columns are {reader.fieldnames}, expected {EXPECTED_COLUMNS}"]
        rows = list(reader)

    codes = [r["code"] for r in rows]
    if set(codes) != EU_CODES:
        missing, extra = EU_CODES - set(codes), set(codes) - EU_CODES
        errors.append(f"country codes mismatch (missing: {sorted(missing)}, unexpected: {sorted(extra)})")
    if len(codes) != len(set(codes)):
        errors.append("duplicate country codes")

    for r in rows:
        name = f"{r['country']} ({r['code']})"
        try:
            standard = float(r["standard"])
            reduced = [float(x) for x in r["reduced"].split("/")] if r["reduced"] else []
            super_reduced = to_float(r["super_reduced"])
            parking = to_float(r["parking"])
        except ValueError as exc:
            errors.append(f"{name}: non-numeric rate ({exc})")
            continue
        if standard < EU_MIN_STANDARD:
            errors.append(f"{name}: standard rate {standard}% is below the EU minimum of {EU_MIN_STANDARD}%")
        if any(x >= standard for x in reduced):
            errors.append(f"{name}: a reduced rate is not below the standard rate")
        if super_reduced is not None and super_reduced >= 5:
            errors.append(f"{name}: super-reduced rate {super_reduced}% should be below 5%")
        if parking is not None and parking < 12:
            errors.append(f"{name}: parking rate {parking}% should be at least 12%")
    return errors


if __name__ == "__main__":
    problems = validate()
    if problems:
        print("Data validation failed:")
        for p in problems:
            print(f"  - {p}")
        sys.exit(1)
    print(f"OK: {DATA.name} passed all checks.")
