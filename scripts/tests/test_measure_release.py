import tempfile
import unittest
from pathlib import Path

from scripts.measure_release import measure


class MeasureReleaseTests(unittest.TestCase):
    def test_measure_reports_installers_runtime_files_and_locales(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "Strip-0.5.3-windows-x64.exe").write_bytes(b"installer")
            (root / "Strip-0.5.3-windows-x64.exe.blockmap").write_bytes(b"blockmap")
            (root / "win-unpacked" / "resources").mkdir(parents=True)
            (root / "win-unpacked" / "resources" / "app.asar").write_bytes(b"asar")
            (root / "win-unpacked" / "resources" / "strip-cli").mkdir()
            (root / "win-unpacked" / "resources" / "strip-cli" / "stripdl.exe").write_bytes(b"cli")
            (root / "win-unpacked" / "locales").mkdir()
            (root / "win-unpacked" / "locales" / "en-US.pak").write_bytes(b"locale")

            report = measure(root)

        self.assertEqual(report["installers"][0]["bytes"], 9)
        self.assertEqual(report["differential_updates"][0]["bytes"], 8)
        self.assertEqual(report["app_asar"]["bytes"], 4)
        self.assertEqual(report["bundled_cli"]["bytes"], 3)
        self.assertEqual(report["electron_locales_bytes"], 6)


if __name__ == "__main__":
    unittest.main()
