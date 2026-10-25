"""Import medical practices from a dated Accès Libre CSV export.

Usage: python3 scripts/import-data.py input.csv
"""

import csv
import json
import sys
from pathlib import Path
from urllib.parse import urlparse, urlunparse

EXPORT_DATE = "2026-10-24"
IMPORT_DATE = "2026-10-25"
SOURCE_URL = (
    "https://static.data.gouv.fr/resources/"
    "accessibilite-des-etablissements-recevant-du-public-erp-pour-les-personnes-"
    "en-situation-de-handicap/20261024-230521/acceslibre-with-web-url.csv"
)
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


def build_practice(row):
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
        "exportDate": EXPORT_DATE,
        "evidence": build_evidence(row),
    }


def import_practices(source):
    return [build_practice(row) for row in csv.DictReader(source) if is_selected_practice(row)]


def write_dataset(practices, destination):
    destination.mkdir(exist_ok=True, parents=True)
    provenance = {
        "publisher": "Accès Libre — Ministère de la Transition écologique",
        "license": "Licence Ouverte / Etalab 2.0",
        "dataset": "https://www.data.gouv.fr/datasets/acceslibre/",
        "resource": SOURCE_URL,
        "exportDate": EXPORT_DATE,
        "importedAt": IMPORT_DATE,
        "selection": (
            "Paris (75), activités médicales sélectionnées, "
            "hors pharmacies et services administratifs"
        ),
        "recordCount": len(practices),
        "limitations": (
            "Export ne contenant pas les dates de confirmation individuelles ; "
            "aucune date de vérification ni identité du contributeur supposée."
        ),
    }
    for name, data in (("practices.json", practices), ("provenance.json", provenance)):
        (destination / name).write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    with Path(sys.argv[1]).open(encoding="utf-8", newline="") as source:
        practices = import_practices(source)
    write_dataset(practices, Path("data"))
    print(f"Imported {len(practices)} practices from Accès Libre.")


if __name__ == "__main__":
    main()
