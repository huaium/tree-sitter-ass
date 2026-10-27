from os import path
from pathlib import Path
from platform import system
from sysconfig import get_config_var

from setuptools import Extension, find_packages, setup
from setuptools.command.build import build
from setuptools.command.egg_info import egg_info
from setuptools.command.install_lib import install_lib
from wheel.bdist_wheel import bdist_wheel

sources = [
    "bindings/python/tree_sitter_ass/binding.c",
    "src/parser.c",
]
if path.exists("src/scanner.c"):
    sources.append("src/scanner.c")

macros: list[tuple[str, str | None]] = [
    ("PY_SSIZE_T_CLEAN", None),
    ("TREE_SITTER_HIDE_SYMBOLS", None),
]
if limited_api := not get_config_var("Py_GIL_DISABLED"):
    macros.append(("Py_LIMITED_API", "0x030A0000"))

if system() != "Windows":
    cflags = ["-std=c11", "-fvisibility=hidden"]
else:
    cflags = ["/std:c11", "/utf-8"]


class Build(build):
    def run(self):
        if path.isdir("queries"):
            dest = path.join(self.build_lib, "tree_sitter_ass", "queries")
            self.copy_tree("queries", dest)
        super().run()


class BdistWheel(bdist_wheel):
    def get_tag(self):
        python, abi, platform = super().get_tag()
        if limited_api and python.startswith("cp"):
            python, abi = "cp310", "abi3"
        return python, abi, platform


class InstallLib(install_lib):
    def get_exclusions(self):
        exclusions = super().get_exclusions()
        build_dir = Path(self.build_dir)
        for filename in build_dir.rglob("*"):
            relative = filename.relative_to(build_dir)
            if "__pycache__" in relative.parts or filename.suffix in (".pyc", ".pyo"):
                exclusions.add(path.join(self.install_dir, str(relative)))
        return exclusions


class EggInfo(egg_info):
    def find_sources(self):
        super().find_sources()
        self.filelist.recursive_include("queries", "*.scm")
        self.filelist.include("src/tree_sitter/*.h")
        self.filelist.include("src/*.h")


setup(
    packages=find_packages("bindings/python"),
    package_dir={"": "bindings/python"},
    package_data={
        "tree_sitter_ass": ["*.pyi", "py.typed"],
        "tree_sitter_ass.queries": ["*.scm"],
    },
    ext_package="tree_sitter_ass",
    ext_modules=[
        Extension(
            name="_binding",
            sources=sources,
            depends=["src/fields.h", "src/syntax.h"],
            extra_compile_args=cflags,
            define_macros=macros,
            include_dirs=["src"],
            py_limited_api=limited_api,
        )
    ],
    cmdclass={
        "build": Build,
        "bdist_wheel": BdistWheel,
        "egg_info": EggInfo,
        "install_lib": InstallLib,
    },
    zip_safe=False
)
