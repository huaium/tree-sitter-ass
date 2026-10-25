import json
import os
from pathlib import Path
import re
import sys
import tomllib


def replace_one(source, pattern, replacement, path):
    result, count = re.subn(pattern, lambda match: replacement(match), source, flags=re.MULTILINE)
    if count != 1:
        raise ValueError(f"{path}: expected one version entry, found {count}")
    return result


def update_versions(root, version):
    if not re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", version):
        raise ValueError("NEW_VERSION must be a release version such as 0.2.0")
    if any(int(part) > 255 for part in version.split(".")):
        raise ValueError("version components must fit Tree-sitter's 8-bit metadata (0–255)")

    updates = {}
    for filename, key in [("package.json", "version"), ("tree-sitter.json", "metadata")]:
        path = root / filename
        source = path.read_text()
        document = json.loads(source)
        old = document[key] if key == "version" else document[key]["version"]
        updates[path] = replace_one(source, rf'("version"\s*:\s*)"{re.escape(old)}"',
            lambda match: f'{match[1]}"{version}"', path)

    for filename, table in [("Cargo.toml", "package"), ("pyproject.toml", "project")]:
        path = root / filename
        source = path.read_text()
        old = tomllib.loads(source)[table]["version"]
        updates[path] = replace_one(source, rf'^(version\s*=\s*)"{re.escape(old)}"(\s*)$',
            lambda match: f'{match[1]}"{version}"{match[2]}', path)

    for filename in ["Cargo.lock", "uv.lock"]:
        path = root / filename
        source = path.read_text()
        packages = [package for package in tomllib.loads(source)["package"]
                    if package["name"] == "tree-sitter-ass"]
        if len(packages) != 1:
            raise ValueError(f"{path}: expected one tree-sitter-ass package")
        old = packages[0]["version"]
        updates[path] = replace_one(source,
            rf'^(name = "tree-sitter-ass"\nversion = )"{re.escape(old)}"$',
            lambda match: f'{match[1]}"{version}"', path)

    path = root / "Makefile"
    updates[path] = replace_one(path.read_text(), r"^(VERSION := )[^\n]+$",
        lambda match: f"{match[1]}{version}", path)
    path = root / "CMakeLists.txt"
    updates[path] = replace_one(path.read_text(), r'^(\s+VERSION )"[^"]+"$',
        lambda match: f'{match[1]}"{version}"', path)

    # Validate every file before writing any changes. Preserve existing formatting
    # and dependency versions while replacing the parsed package version entries.
    for path, content in updates.items():
        if path.suffix == ".json":
            json.loads(content)
        elif path.suffix in {".toml", ".lock"}:
            tomllib.loads(content)
    for path, content in updates.items():
        if path.read_text() != content:
            path.write_text(content)


def main():
    root = Path(__file__).resolve().parents[1]
    version = os.environ.get("NEW_VERSION", "")
    if not (root / "node_modules/.bin/tree-sitter").is_file():
        raise ValueError("the existing local tree-sitter CLI is required to regenerate the parser")
    update_versions(root, version)
    print(f"Updated package versions to {version}")


if __name__ == "__main__":
    try:
        main()
    except ValueError as error:
        sys.exit(str(error))
