# Repository guidance

## Project

This repository implements a Tree-sitter grammar for ASS v4+, SSA v4, and
ASS v4++ subtitles. It produces syntax trees for editors and analysis tools.
Rendering, font/style resolution, attachment decoding, and validation of visual
constraints belong to consumers.

## Source layout

- `grammar.js`: grammar rules and public syntax node definitions.
- `src/scanner.c`: external token declarations, section handling, and scanner entry points.
- `src/syntax.h`: format mapping, dialogue scanning, tag handling, and serialized state.
- `src/fields.h`: shared field definitions.
- `src/parser.c`, `src/grammar.json`, `src/node-types.json`: generated artifacts.
- `queries/highlights.scm`: highlighting queries.
- `bindings/`: Node, Rust, Python, Go, and Swift bindings and tests.
- `bindings/node/highlights_test.js`: highlight capture, positional column, and
  incremental highlighting regression tests.
- `test/`: checked-in ASS/SSA samples and their coverage notes.
- `docs/syntax.md` and `docs/compatibility.md`: syntax tree contract and compatibility coverage.

## Editing rules

- Use `apply_patch` for file edits. Do not rewrite files with ad-hoc scripts.
- Treat current file contents as authoritative and preserve unrelated user changes.
- Keep author metadata as `huaium <adamzhangme@gmail.com>`.
- Use pnpm for Node development and uv for Python development.
- Do not install dependencies in the host environment on the user's behalf.
  Explain any required dependency, provide the exact installation command, and
  wait for the user to run it. Dependency installation inside a dev container is allowed.
- Use `trash` for direct file deletion. If it is unavailable, ask before deleting.
- Do not use Git rollback commands to restore files.
- Follow the existing `<type>: <description>` commit convention. Commit only
  when requested; follow any explicitly invoked commit skill.

## Parser changes

- Edit grammar/scanner sources and regenerate generated artifacts with
  `pnpm exec tree-sitter generate`. Do not edit generated artifacts manually.
- Keep the grammar's external-token order synchronized with `enum TokenType`
  in `src/scanner.c`. Keep typed field ordering synchronized with `ASS_FIELDS`.
- Serialize every scanner state value that affects parsing. Keep serialization
  size calculations and deserialization synchronized and within Tree-sitter's buffer limit.
- Preserve Text commas, whitespace, Unicode, empty fields, and line boundaries.
  Format declarations determine event and style field mappings.
- Preserve Comment event Text as free-form text. Unknown tag arguments must not
  change active drawing or transform state.
- Preserve documented node names and field names where possible. Update queries,
  bindings, documentation, and tests when changing the syntax tree contract.
- Verify behavior against the references linked in `docs/compatibility.md`.
  Distinguish documented syntax from renderer-specific tolerance and rendering semantics.
- Add regression cases for parser fixes, including incremental edits when state
  or token boundaries change. Compare incremental parses with fresh parses.
- Keep samples in English; use descriptive fictional metadata. Retain targeted
  Unicode coverage. Mark attachment syntax payloads that are not usable binary assets.

## Highlighting changes

- Preserve the `values` node's repeating `column_1` through `column_6` fields.
  Count empty values and the final Text value when assigning positions. Keep
  semantic field names inside each `value` independent of column position.
- Use `@string.ass.column.1` through `@string.ass.column.6` for Format, Style, and event
  metadata columns in their applicable sections. Keep Script Info and attachment
  payloads on their ordinary syntax captures.
  Preserve the `string` capture prefix so unmapped palettes inherit string
  highlighting. Verify fallback with the real Tree-sitter highlighter.
- Exclude final event Text from rainbow captures. Preserve its strings, tags,
  escapes, colors, drawings, and punctuation. Highlight entire Comment events
  as comments, including metadata and free-form template text.
- Keep rainbow capture priority 110 and Comment event priority 120 above ordinary
  syntax captures. Document editor precedence requirements and custom palette
  setup in `docs/syntax.md`; do not assume all editors honor priority metadata.
- Test reordered formats, empty fields, more than two palette cycles, SSA/ASS/ASS2
  layouts, Text commas, nested transforms, vector clips, Comment events, and
  incremental column edits. Verify captures and priority metadata; report
  separately whether rendering was checked in an actual editor.
- Ship queries with the matching generated parser. Queries using positional
  fields require a parser that exposes those fields.

## Validation

Run checks appropriate to the change and fix failures before finishing:

```sh
pnpm test
cargo test --locked --offline
go test -a -mod=readonly -count=1 ./bindings/go
swift test --disable-automatic-resolution
uv run --no-sync python -m unittest discover -s bindings/python/tests -v
git diff --check
```

After changing C sources or scanner headers, rebuild the Node addon and Python
extension before testing their bindings; previously built binaries can be stale.
Use existing toolchains and dependencies. Go's `-a` flag ensures changes to
included C sources are rebuilt. For shared grammar/scanner changes, run all
binding suites and verify the Make and CMake builds. Check packaging when adding
source files or headers required by bindings.

Metadata and documentation-only edits need relevant consistency checks, without
adding tests that simply repeat their contents.

## Agent command execution

- Prefix agent shell commands with `rtk`; use `rtk proxy` for unfiltered output.
  Commands shown for the user to run should omit that prefix.
- If `.codegraph/` exists, consult CodeGraph before locating or understanding code.
  Otherwise, do not index the repository automatically.
- Use `rg` for text searches and `rg --files` for file inventories.
- Report what changed, what was verified, and any remaining limitations.
  Do not claim universal ASS/SSA compatibility solely because the tests pass.
