# tree-sitter-ass

A tree-sitter parser for ass/ssa subtitles.

## Syntax support

- ASS v4+, SSA v4, and ASS v4++ sections, metadata, comments, fonts, and graphics attachments.
- Event timestamps and named fields; individual style fields with numeric, color,
  font, and style-name nodes. Both use their section's `Format:` declarations.
- Dialogue text, Unicode, line-break escapes, override blocks, standard override
  tags, karaoke, transforms, rectangular and vector clipping.
- Drawing mode and the `m`, `n`, `l`, `b`, `s`, `p`, and `c` drawing commands.
- Unknown fields and tag syntax, line-based error recovery, and incremental edits.

See [the syntax tree reference](docs/syntax.md) for node names and query examples.
The highlight query supports a six-color repeating column palette for formats,
styles, and event metadata while preserving dialogue syntax and Comment events.
See [rainbow highlighting setup](docs/syntax.md#rainbow-column-highlighting).
The [compatibility coverage](docs/compatibility.md) records the reference sources,
tested syntax, and parser boundaries.

## Development

Install dependencies with `pnpm install`. Development and release commands use
Just; run `just` to list recipes. Run the Node binding tests with
`just test-node` and regenerate the parser with `just generate`.
`just test` runs all binding and maintenance-script suites; `just test-grammar`
runs Tree-sitter corpus tests. Individual binding recipes require their existing
toolchains and dependencies. Rebuild native Node and Python bindings after
changing parser or scanner sources before testing those bindings.

The Makefile handles C library builds and installation: `make`, `make install`,
`make uninstall`, and `make clean`. C consumers do not need Just.

The parser uses Tree-sitter ABI 15 and requires a Tree-sitter runtime version
of 0.25 or newer. The Go binding requires Go 1.23 or newer, and Rust
development requires Rust 1.90 or newer.

The bindings target Node Tree-sitter 0.25.1, Rust Tree-sitter 0.27.1,
Python Tree-sitter 0.26.0, Go Tree-sitter 0.25.0, and SwiftTreeSitter 0.25.0.
SwiftTreeSitter restricts its underlying Tree-sitter runtime to 0.25.x.

For Python development, install the project and runtime with `uv sync --extra core`.
Run the Python binding tests with
`uv run --no-sync python -m unittest discover -s bindings/python/tests -v`.

Update the package version across all manifests, local package lock entries, C
build metadata, and the generated parser with:

```sh
just version 0.2.0
```

This uses Just, uv, Python 3.11 or newer, pnpm, and the existing local Tree-sitter CLI.
Use a release version in `MAJOR.MINOR.PATCH` form, with each component at most
255 to fit Tree-sitter's metadata. Dependency runtime versions stay unchanged.
Go and Swift package releases use Git tags; this command does not create a tag
or commit.

## GitHub releases

After updating and committing the version, push the commit and run:

```sh
just tag v0.1.2
```

The command asks for confirmation before creating and pushing the tag. A `v*`
tag push starts the release workflow, which checks the package versions and
attaches the npm tarball, Cargo crate, Python source distribution, tested Python
wheels for Linux x86_64, macOS Apple Silicon, and Windows x86_64, a source
archive for Go/Swift/C consumers, standalone `highlights.scm`, and SHA-256
checksums to a GitHub Release. Packages are published only to GitHub Releases.
The wheels use the CPython 3.10 stable ABI for regular CPython 3.10 and newer.

To delete a local and remote tag, with confirmation:

```sh
just dtag v0.1.2
```

Deleting a tag does not delete its GitHub Release or attached assets.

## References

- [ASS Specs](http://www.tcax.org/docs/ass-specs.htm)
- [ASS Wiki](https://github.com/weizhenye/ASS/wiki)
- [tree-sitter-ini](https://github.com/justinmk/tree-sitter-ini)

## License

[MIT License](LICENSE)
