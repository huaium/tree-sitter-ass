import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class TagTests(unittest.TestCase):
    def test_create_cancel_delete_and_invalid_tag(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            remote = root / "remote.git"
            work = root / "work"

            def git(*args, cwd=work):
                return subprocess.run(
                    ["git", *args], cwd=cwd, check=True,
                    capture_output=True, text=True,
                ).stdout

            git("init", "--bare", str(remote), cwd=root)
            git("init", str(work), cwd=root)
            shutil.copy2(ROOT / "justfile", work / "justfile")
            (work / "scripts").mkdir()
            shutil.copy2(ROOT / "scripts/tag.py", work / "scripts/tag.py")
            git("config", "user.name", "huaium")
            git("config", "user.email", "adamzhangme@gmail.com")
            git("commit", "--allow-empty", "-m", "test: initialize repository")
            git("remote", "add", "origin", str(remote))

            def recipe(mode, reply, tag="v0.1.1"):
                return subprocess.run(
                    ["just", mode, tag], cwd=work,
                    env={**os.environ, "UV_PYTHON": sys.executable},
                    input=reply + "\n", capture_output=True, text=True,
                )

            self.assertEqual(recipe("tag", "n").returncode, 0)
            self.assertEqual(git("tag", "--list"), "")
            self.assertNotEqual(recipe("tag", "y", "invalid").returncode, 0)
            self.assertEqual(recipe("tag", "y").returncode, 0)
            self.assertEqual(git("tag", "--list"), "v0.1.1\n")
            self.assertIn("refs/tags/v0.1.1", git("ls-remote", "--tags", "origin"))
            self.assertEqual(recipe("dtag", "n").returncode, 0)
            self.assertEqual(git("tag", "--list"), "v0.1.1\n")
            self.assertEqual(recipe("dtag", "Y").returncode, 0)
            self.assertEqual(git("tag", "--list"), "")
            self.assertEqual(git("ls-remote", "--tags", "origin"), "")
