"""Check that imports contain only selected source records and preserve uncertainty."""

import csv
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "import-data.py"
SPEC = importlib.util.spec_from_file_location("import_data", MODULE_PATH)
import_data = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(import_data)


class ImportDataTests(unittest.TestCase):
    def test_import_only_includes_selected_source_records(self):
        columns = ["id", "name", "postal_code", "activite", "web_url"]
        source = io.StringIO()
        writer = csv.DictWriter(source, fieldnames=columns)
        writer.writeheader()
        for identifier, postal_code, activity in (
            ("source-paris", "75011", "Médecin généraliste"),
            ("source-lyon", "69001", "Médecin généraliste"),
            ("source-shop", "75011", "Commerce"),
        ):
            writer.writerow({
                "id": identifier,
                "name": "CSV test record",
                "postal_code": postal_code,
                "activite": activity,
                "web_url": "https://acceslibre.beta.gouv.fr/test/",
            })
        source.seek(0)
        practices = import_data.import_practices(source)
        self.assertEqual([practice["id"] for practice in practices], ["source-paris"])
        self.assertEqual(practices[0]["mode"], "real")
        self.assertIsNone(practices[0]["evidence"]["width"]["value"])

    def test_conflicting_entrance_is_not_presented_as_confirmed(self):
        evidence = import_data.build_evidence({
            "entree_plain_pied": "True",
            "entree_marches": "2",
            "entree_largeur_mini": "85",
        })
        self.assertEqual(evidence["stepFree"]["status"], "contradictory")
        self.assertEqual(evidence["width"]["value"], 85)
        self.assertIsNone(evidence["hearing"]["value"])

    def test_output_count_does_not_append_fictional_practices(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory)
            import_data.write_dataset([], destination)
            practices = json.loads((destination / "practices.json").read_text())
            provenance = json.loads((destination / "provenance.json").read_text())
            self.assertEqual(practices, [])
            self.assertEqual(provenance["recordCount"], 0)


if __name__ == "__main__":
    unittest.main()
