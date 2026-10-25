import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import tomllib
import unittest


ROOT = Path(__file__).resolve().parents[2]
FILES = ["package.json", "tree-sitter.json", "Cargo.toml", "pyproject.toml",
         "Cargo.lock", "uv.lock", "Makefile", "CMakeLists.txt"]


class VersionRecipeTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        for filename in FILES + ["grammar.js"]:
            shutil.copy2(ROOT / filename, self.root / filename)
        shutil.copytree(ROOT / "src", self.root / "src",
                        ignore=shutil.ignore_patterns("*.o"))
        (self.root / "scripts").mkdir()
        shutil.copy2(ROOT / "scripts/set_version.py", self.root / "scripts/set_version.py")
        (self.root / "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)
        self.environment = {**os.environ, "UV_CACHE_DIR": str(self.root / ".uv-cache"),
                            "UV_PYTHON": sys.executable}

    def run_recipe(self, version=None):
        arguments = ["make", "version"]
        if version is not None:
            arguments.append(f"NEW_VERSION={version}")
        environment = {key: value for key, value in self.environment.items() if key != "NEW_VERSION"}
        return subprocess.run(arguments, cwd=self.root, env=environment,
                              capture_output=True, text=True)

    def snapshot(self):
        return {name: (self.root / name).read_bytes() for name in FILES + ["src/parser.c"]}

    def test_updates_all_versions_and_preserves_dependencies(self):
        original = json.loads((self.root / "package.json").read_text())
        dependencies = {}
        for filename in ["Cargo.lock", "uv.lock"]:
            dependencies[filename] = [package for package in tomllib.loads((self.root / filename).read_text())["package"]
                                      if package["name"] != "tree-sitter-ass"]
        result = self.run_recipe("2.3.4")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        package = json.loads((self.root / "package.json").read_text())
        self.assertEqual(package["version"], "2.3.4")
        self.assertEqual(package["dependencies"], original["dependencies"])
        self.assertEqual(package["devDependencies"], original["devDependencies"])
        self.assertEqual(json.loads((self.root / "tree-sitter.json").read_text())["metadata"]["version"], "2.3.4")
        for filename, table in [("Cargo.toml", "package"), ("pyproject.toml", "project")]:
            self.assertEqual(tomllib.loads((self.root / filename).read_text())[table]["version"], "2.3.4")
        for filename in dependencies:
            packages = tomllib.loads((self.root / filename).read_text())["package"]
            self.assertEqual([package for package in packages if package["name"] != "tree-sitter-ass"], dependencies[filename])
            self.assertEqual(next(package["version"] for package in packages if package["name"] == "tree-sitter-ass"), "2.3.4")
        self.assertIn("VERSION := 2.3.4", (self.root / "Makefile").read_text())
        self.assertIn('VERSION "2.3.4"', (self.root / "CMakeLists.txt").read_text())
        parser = (self.root / "src/parser.c").read_text()
        for component, value in [("major", 2), ("minor", 3), ("patch", 4)]:
            self.assertIn(f".{component}_version = {value},", parser)
        before = self.snapshot()
        repeated = self.run_recipe("2.3.4")
        self.assertEqual(repeated.returncode, 0, repeated.stdout + repeated.stderr)
        self.assertEqual(self.snapshot(), before)

    def test_invalid_versions_do_not_modify_files(self):
        before = self.snapshot()
        for version in [None, "", "1.2", "01.2.3", "1.2.3-rc.1", "256.0.0", "1.2.3; false"]:
            with self.subTest(version=version):
                result = self.run_recipe(version)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.snapshot(), before)

    def test_invalid_manifest_does_not_partially_update_files(self):
        (self.root / "Cargo.toml").write_text("[package]\nname = \"tree-sitter-ass\"\nversion = ")
        before = self.snapshot()
        result = self.run_recipe("2.3.4")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.snapshot(), before)
