# tree-sitter-ass

A tree-sitter parser for ass/ssa subtitles.

## Syntax support

- ASS v4+ and SSA v4 sections, metadata, comments, fonts, and graphics attachments.
- Event timestamps and named fields; individual style fields with numeric, color,
  font, and style-name nodes. Both use their section's `Format:` declarations.
- Dialogue text, Unicode, line-break escapes, override blocks, standard override
  tags, karaoke, transforms, rectangular and vector clipping.
- Drawing mode and the `m`, `n`, `l`, `b`, `s`, `p`, and `c` drawing commands.
- Unknown fields and tag syntax, line-based error recovery, and incremental edits.

See [the syntax tree reference](docs/syntax.md) for node names and query examples.

## Development

Install dependencies with `pnpm install`. Run the Node binding tests with
`pnpm test` and regenerate the parser with `pnpm exec tree-sitter generate`.

The parser uses Tree-sitter ABI 15 and requires a Tree-sitter runtime version
of 0.25 or newer. The Go binding requires Go 1.23 or newer, and Rust
development requires Rust 1.90 or newer.

The bindings target Node Tree-sitter 0.25.1, Rust Tree-sitter 0.27.1,
Python Tree-sitter 0.26.0, Go Tree-sitter 0.25.0, and SwiftTreeSitter 0.25.0.
SwiftTreeSitter restricts its underlying Tree-sitter runtime to 0.25.x.

For Python development, install the project and runtime with `uv sync --extra core`.
Run the Python binding tests with
`uv run --no-sync python -m unittest discover -s bindings/python/tests -v`.

## References

- [ASS Specs](http://www.tcax.org/docs/ass-specs.htm)
- [ASS Wiki](https://github.com/weizhenye/ASS/wiki)
- [tree-sitter-ini](https://github.com/justinmk/tree-sitter-ini)

## License

[MIT License](LICENSE)
