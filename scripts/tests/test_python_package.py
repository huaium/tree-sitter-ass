import py_compile
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[2]


class PythonPackageTests(unittest.TestCase):
    def test_rebuilt_wheel_excludes_cached_bytecode(self):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            for filename in ("setup.py", "pyproject.toml", "README.md", "LICENSE"):
                shutil.copy2(ROOT / filename, project / filename)
            for folder in ("src", "bindings/python", "queries"):
                shutil.copytree(
                    ROOT / folder, project / folder,
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "*.pyo", "*.egg-info", "*.o"),
                )

            def build_wheel():
                result = subprocess.run(
                    ["uv", "build", "--offline", "--wheel"], cwd=project,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                )
                self.assertEqual(result.returncode, 0, result.stdout)

            build_wheel()
            package = next((project / "build").glob("lib.*/tree_sitter_ass"))
            source = package / "__init__.py"
            py_compile.compile(str(source), doraise=True)
            py_compile.compile(str(source), optimize=2, doraise=True)
            py_compile.compile(str(source), cfile=str(package / "__init__.pyc"), doraise=True)
            py_compile.compile(str(source), cfile=str(package / "__init__.pyo"), doraise=True)
            self.assertTrue(list(package.rglob("*.pyc")))

            build_wheel()
            with ZipFile(next((project / "dist").glob("*.whl"))) as wheel:
                names = wheel.namelist()
                self.assertFalse(
                    [name for name in names if "__pycache__" in Path(name).parts or name.endswith((".pyc", ".pyo"))],
                    names,
                )
                self.assertIn("tree_sitter_ass/__init__.py", names)
                self.assertIn("tree_sitter_ass/py.typed", names)
                self.assertTrue(any(name.startswith("tree_sitter_ass/_binding.") for name in names))
                self.assertEqual(
                    wheel.read("tree_sitter_ass/queries/highlights.scm"),
                    (ROOT / "queries/highlights.scm").read_bytes(),
                )
