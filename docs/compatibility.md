# ASS/SSA syntax compatibility

The compatibility tests cover the common ASS v4+ and SSA v4 syntax documented by
[Aegisub's tag reference](https://aegisub.org/docs/latest/ass_tags/) and
[libass's format guide](https://github.com/libass/libass/wiki/ASS-File-Format-Guide).
The guide also documents the ASS v4++ layouts supported here. These references
describe syntax and implementation conventions; ASS does not have a single
comprehensive specification that resolves every renderer's behavior.

| Area | Tested coverage |
| --- | --- |
| Documents | UTF-8 text, BOM, LF/CRLF/CR, final line without a newline, blank lines, comments containing brackets |
| Sections | Script Info, V4 Styles, V4+ Styles, V4++ Styles, Events, Fonts, Graphics, custom authoring metadata |
| Metadata | Standard headers, LayoutResX/Y, libass Kerning/Language headers, `!:` metadata, Aegisub extradata |
| Styles | All ASS/SSA scalar fields, hex/decimal colors, booleans, fractional sizes and scaling, ASS2 top/bottom margins and RelativeTo |
| Events | Default and declared formats, reordered/unknown/empty columns, timestamps, marked/layer fields, actors, margins, Text containing commas |
| Legacy records | Comment, Picture, Sound, Movie, Command; free-form Comment text including Aegisub karaoke templates and code |
| Text | Unicode, whitespace, line breaks, hard spaces, unmatched literal braces with subsequent escapes, libass escaped braces |
| Simple tags | Every numeric tag in the Aegisub reference; omitted arguments, signed and fractional arguments; legacy `\fsc`; color/alpha channels; font names and style resets |
| Complex tags | Position/origin, both movement forms, both fade forms, all four transform signatures, every documented animatable tag inside each transform signature |
| Clipping | Rectangle/inverse rectangle, vector/inverse vector, optional drawing scale, rectangular clips inside transforms |
| Drawing | m, n, l, b, s, p, c; repeated point groups, negative coordinates, whitespace before blocks and line endings, drawing-mode changes across blocks and event boundaries |
| Ignored content | Bare backslashes in override blocks, unknown tag prefixes and numbered names, comments inside transforms |
| Effects | Banner, Scroll up/down, optional parameters, unknown effect strings |
| Attachments | Multiple font/graphics declarations, encoded lines resembling sections or comments |
| Editing | Incremental edits to formats, sections, drawing mode, Unicode, comment/dialogue record type, and literal/override brace boundaries; recovery after malformed records |

`bindings/node/compatibility_test.js` contains the reference-oriented matrix;
the other Node tests and checked-in samples cover fields, attachments, errors,
and incremental edits. Rust, Python, Go, and Swift tests exercise the shared
generated parser through their binding APIs.

The parser produces syntax trees. It does not render subtitles, decode embedded
attachments, resolve fonts/styles, or validate visual constraints such as valid
alignment ranges, mutually exclusive positioning tags, or animatable properties.
Legacy file encodings must be converted to Unicode by the caller before parsing.

The [libass extension reference](https://github.com/libass/libass/wiki/Libass%27-ASS-Extensions)
documents the escaped-brace and custom-format behavior included here. Private
renderer extensions and arbitrary malformed input accepted leniently by a
renderer are not guaranteed to produce an error-free tree. Unknown tag names
and parenthesized arguments have generic syntax nodes; that does not imply
renderer support for those tags. ASSv5 draft syntax is outside this grammar.
