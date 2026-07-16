"""Regression tests for the companion's cache privacy disclosure."""

import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import main  # noqa: E402


class PrivacyDisclosureTests(unittest.TestCase):
    def test_module_and_openapi_descriptions_disclose_cached_compressed_results(self):
        module_description = " ".join(main.__doc__.split())
        self.assertIn("Raw prompts are never logged or written to disk.", module_description)
        self.assertIn("Compressed prompt results are stored in the local SQLite cache.", module_description)
        api_description = main.app.openapi()["info"]["description"]
        self.assertIn("Raw prompts are not stored", api_description)
        self.assertIn("compressed results are persisted in the local SQLite cache", api_description)


if __name__ == "__main__":
    unittest.main()
