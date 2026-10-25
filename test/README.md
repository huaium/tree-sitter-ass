The samples use English dialogue and fictional production metadata. `pnpm test`
parses each sample and checks representative syntax nodes.

- `full.ass`: a conventional ASS document with complete styles, dialogue,
  comments, text escapes, override tags, transforms, effects, vector clips,
  every drawing command, custom metadata, and attachment syntax.
- `script_info_only.ass`: a minimal metadata-only document.
- `legacy.ssa`: SSA styles, decimal colors, marked events, and legacy record types.
- `ass2.ass`: ASS v4++ fixed layouts, separate top/bottom margins, and `RelativeTo`.
- `custom_formats.ass`: reordered fields, unknown columns, empty values, and
  changes to the active event format.

The attachment payloads cover encoded-line parsing only; they are not usable
fonts or images. The extension tag in `full.ass` tests preservation of unknown
syntax. Other events illustrate ordinary subtitle text and common effects.

Keep malformed-input cases in the binding tests, where their expected parse
errors and recovery behavior can be asserted explicitly. BOM and line-ending
variants are also covered there so that these samples remain easy to edit.
