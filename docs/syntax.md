# Syntax tree reference

The parser recognizes ASS v4+, SSA v4, and ASS v4++ syntax. It produces a concrete syntax
tree for editors and analysis tools. Rendering, font lookup, style resolution,
and validation of visual constraints belong to the consumer.

## Records and fields

Existing `section`, `section_header`, `key_value_pair`, `values`, and `value`
nodes are retained. Event and style `value` nodes now contain typed children.
Each child has a field name that identifies its declared column, independently
of column order. For example:

```ass
[Events]
Format: End, Start, Layer, Text
Dialogue:0:00:02.00,0:00:01.00,0,Hello, world
```

The four `value` children contain `end: (timestamp)`, `start: (timestamp)`,
`layer: (integer)`, and a text value containing `(text)`. The final text retains
its commas. `Comment`, `Picture`, `Sound`, `Movie`, and `Command` event records
use the same declared layout. Standard layouts apply when `Format:` is absent.
`ScriptType` and the style section distinguish SSA and ASS defaults.
The `values` node also labels its direct `value` children `column_1` through
`column_6`, repeating every six columns. These positional fields include empty
values and the final Text value; they do not replace semantic fields inside
each value. Node names and value boundaries are unchanged.
Comment event fields retain the same typed layout, but their Text field is
preserved as free-form `text`. This permits disabled dialogue, karaoke templates,
and code without requiring renderable override arguments.

Style fields include `style_name`, `font_name`, `font_size`, `primary_colour`,
`secondary_colour`, `tertiary_colour` (SSA), `outline_colour`, `back_colour`,
`bold`, `italic`, `underline`, `strikeout`, `scale_x`, `scale_y`, `spacing`,
`angle`, `border_style`, `outline`, `shadow`, `alignment`, `margin_l`, `margin_r`,
`margin_v`, `alpha_level` (SSA), and `encoding`. ASS v4++ adds `margin_t`,
`margin_b`, and `relative_to`, and uses separate top/bottom margins in events.
Empty columns retain an empty
`value`; unrecognized columns use the `unknown` field. Legacy `Marked=0` and
`Marked=1` values have a `marked` node. Banner and scrolling effects have
`banner_effect` and `scroll_effect` nodes.

## Dialogue syntax

A dialogue text value contains `text`, `escape_sequence`, `override_block`,
and `drawing_command` children. `\N`, `\n`, and `\h` are escape sequences,
as are the libass literal-brace extensions `\{` and `\}`.
Whitespace and Unicode text are preserved. An opening brace with no closing
brace on the same line remains literal text, as required by ASS text handling.
Line-break and hard-space escapes after that brace still have their own nodes.

Override blocks contain `numeric_tag`, `color_tag`, `alpha_tag`, `font_tag`,
`reset_tag`, `position_tag`, `move_tag`, `fade_tag`, `transform_tag`, `clip_tag`,
`drawing_mode_tag`, `unknown_tag`, and `override_comment` nodes. Tag names are
available through the `name` field and a `tag_name` child. Numeric arguments,
colors, font names, timing arguments, and nested tags remain separate children.
Unknown parenthesized arguments remain structured in `unknown_tag_arguments`.
Their contents are preserved as opaque text and nested parentheses; tag-like
text inside them does not change drawing mode or other active scanner state.
Font and reset strings inside transforms stop before the enclosing closing
parenthesis. Outside transforms, parentheses remain part of those strings.
Unknown names with standard-tag prefixes remain unknown tags; a bare backslash
inside an override block is preserved as `override_comment`. Ignored text inside
transforms also uses `override_comment` nodes.

Drawing mode starts with `\p` followed by a positive scale and ends with `\p0`.
Drawing commands also occur inside vector clips. Nodes distinguish
`drawing_move`, `drawing_move_open`, `drawing_line`, `drawing_bezier`,
`drawing_spline`, `drawing_extend`, and `drawing_close`; coordinate pairs are
`drawing_point` nodes with `x` and `y` fields. Drawing mode resets at each event.
Spaces and tabs between a drawing and the next override block or line ending
are accepted.

## Attachments and error recovery

Encoded attachment lines are `attachment_data` nodes after a matching
`fontname:` or `filename:` declaration in `[Fonts]` or `[Graphics]`.
Payload characters that resemble comments or brackets remain encoded data.

Records are bounded by LF, CRLF, CR, or end of file. Malformed timestamps,
invalid parameters in closed override blocks, and invalid drawing parameter counts produce error nodes.
Parsing can recover at subsequent records and sections. Missing nodes and
`ERROR` nodes should be checked when a consumer needs validated input.

## Query examples

```scheme
(value start: (timestamp) @event.start)
(value end: (timestamp) @event.end)
(value font_size: (number) @style.font_size)
(numeric_tag name: (tag_name) @tag.name argument: (number) @tag.argument)
(drawing_point x: (number) @drawing.x y: (number) @drawing.y)
(attachment_data) @attachment
```

The highlight query covers sections, keys, scalar fields, text, tags, drawings,
escapes, comments, and error nodes. Scanner state is serialized so edits to a
format declaration, attachment section, or drawing-mode tag invalidate the
affected syntax during incremental parsing.

## Rainbow column highlighting

`queries/highlights.scm` assigns `@ass.column.1` through `@ass.column.6` to
`Format:` and `Style:` values and the metadata columns of event records.
The palette repeats by position, including empty fields. Reordered formats
retain the same positional colors as their corresponding record values.
Ordinary Script Info fields and attachment payloads keep string highlighting.

Event Text is excluded from rainbow captures, including commas inside Text.
Its text, override tags, escapes, and drawing commands retain syntax captures.
Entire `Comment:` events use `@comment`, including metadata and template text.
The query sets priority 110 for rainbow captures and 120 for Comment events;
ordinary syntax captures retain the editor's default priority (100 in Neovim).
Editors must honor these priorities, or configure equivalent precedence, to
show column colors over scalar captures and comments over all record contents.

Custom captures require a palette in the editor theme. For example, in Neovim,
after enabling Tree-sitter highlighting for the `ass` language:

```lua
local colors = { "#e06c75", "#e5c07b", "#98c379", "#56b6c2", "#61afef", "#c678dd" }
for index, color in ipairs(colors) do
  vim.api.nvim_set_hl(0, "@ass.column." .. index .. ".ass", { fg = color })
end
```

Reapply these definitions after changing the colorscheme and adjust the colors
for contrast with the background. Consumers without custom capture mappings
can continue using the standard string, number, and color captures. Install
the matching generated parser together with the updated query: older parsers
do not expose the positional fields required by this query.
