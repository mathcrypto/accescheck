"""Import medical practices from a dated Accès Libre CSV export.

Usage: python3 scripts/import-data.py input.csv
"""

import argparse
import csv
import json
import os
import tempfile
from pathlib import Path
from urllib.parse import urlparse, urlunparse

MEDICAL_ACTIVITIES = (
    "médecin",
    "médecine",
    "dentiste",
    "kinésithérap",
    "centre de santé",
    "maison de santé",
)
EVIDENCE_FIELDS = {
    "stepFree": "entree_plain_pied",
    "route": "accueil_cheminement_plain_pied",
    "width": "entree_largeur_mini",
    "hearing": "accueil_equipements_malentendants_presence",
    "toilets": "sanitaires_adaptes",
    "consultation": "accueil_salle_consultation_accessible",
    "signage": "accueil_signaletique_interieure",
}


def boolean_value(value):
    """Preserve absent or unrecognized declarations as unknown."""
    return {"True": True, "False": False}.get(value)


def is_selected_practice(row):
    if not row.get("postal_code", "").startswith("75"):
        return False
    activity = row.get("activite", "").lower()
    return any(keyword in activity for keyword in MEDICAL_ACTIVITIES)


def build_evidence(row):
    evidence = {}
    for key, column in EVIDENCE_FIELDS.items():
        declared = row.get(column, "")
        if key == "width":
            value = float(declared) if declared.isdigit() and int(declared) > 0 else None
        else:
            value = boolean_value(declared)
        evidence[key] = {
            "value": value,
            "status": "declared" if value is not None else "unknown",
            "date": None,
            "source": "Accès Libre · déclaration publique",
        }

    steps = row.get("entree_marches", "")
    if evidence["stepFree"]["value"] is True and steps.isdigit() and int(steps) > 0:
        evidence["stepFree"]["status"] = "contradictory"
    return evidence


def booking_url(row):
    for column in ("contact_url", "site_internet"):
        try:
            parsed = urlparse(row.get(column, ""))
            if (
                parsed.scheme == "https"
                and parsed.hostname in ("www.doctolib.fr", "doctolib.fr")
                and not parsed.username
                and not parsed.password
                and len(parsed.path.strip("/").split("/")) >= 2
            ):
                return urlunparse(parsed._replace(fragment=""))
        except ValueError:
            continue
    return None


def build_practice(row, exported_at=None):
    address = " ".join(
        part
        for part in (
            row.get("numero"),
            row.get("voie"),
            row["postal_code"],
            "Paris",
        )
        if part
    )
    return {
        "id": row["id"],
        "name": row["name"],
        "address": address,
        "postalCode": row["postal_code"],
        "specialty": row["activite"],
        "source": "Accès Libre",
        "sourceUrl": row["web_url"],
        "mode": "real",
        "doctolibUrl": booking_url(row),
        "exportDate": exported_at[:10] if exported_at else None,
        "evidence": build_evidence(row),
    }


REQUIRED_COLUMNS = {"id", "name", "postal_code", "activite", "web_url", *EVIDENCE_FIELDS.values()}


def source_fields(row):
    """Keep public source values without executable widget markup."""
    fields = {}
    for key, value in row.items():
        if key == "widget_code":
            continue
        if value in (None, ""):
            fields[key] = None
        elif value in ("True", "False"):
            fields[key] = boolean_value(value)
        elif value.startswith("["):
            try:
                fields[key] = json.loads(value)
            except json.JSONDecodeError:
                fields[key] = value
        else:
            fields[key] = value
    return fields


def import_practices(source):
    return [build_practice(row) for row in csv.DictReader(source) if is_selected_practice(row)]


def write_records(source, destination, exported_at):
    csv.field_size_limit(2_000_000)
    reader = csv.DictReader(source)
    if not reader.fieldnames or not REQUIRED_COLUMNS.issubset(reader.fieldnames):
        raise ValueError("The export is missing required source columns.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=destination.parent, prefix="import-")
    identifiers = set()
    count = 0
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as target:
            for row in reader:
                if not is_selected_practice(row):
                    continue
                record = build_practice(row, exported_at)
                if not record["id"] or record["id"] in identifiers:
                    raise ValueError("A selected source ID is missing or duplicated.")
                identifiers.add(record["id"])
                target.write(json.dumps({"record": record, "sourceFields": source_fields(row)}, ensure_ascii=False) + "\n")
                count += 1
        if not count:
            raise ValueError("The export contains no selected medical practices.")
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return {"count": count, "columns": reader.fieldnames}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--exported-at", required=True)
    arguments = parser.parse_args()
    with arguments.input.open(encoding="utf-8-sig", newline="") as source:
        result = write_records(source, arguments.output, arguments.exported_at)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
