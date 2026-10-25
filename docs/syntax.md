# Syntax tree reference

The parser recognizes ASS v4+ and SSA v4 syntax. It produces a concrete syntax
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

Style fields include `style_name`, `font_name`, `font_size`, `primary_colour`,
`secondary_colour`, `tertiary_colour` (SSA), `outline_colour`, `back_colour`,
`bold`, `italic`, `underline`, `strikeout`, `scale_x`, `scale_y`, `spacing`,
`angle`, `border_style`, `outline`, `shadow`, `alignment`, `margin_l`, `margin_r`,
`margin_v`, `alpha_level` (SSA), and `encoding`. Empty columns retain an empty
`value`; unrecognized columns use the `unknown` field. Legacy `Marked=0` and
`Marked=1` values have a `marked` node. Banner and scrolling effects have
`banner_effect` and `scroll_effect` nodes.

## Dialogue syntax

A dialogue text value contains `text`, `escape_sequence`, `override_block`,
and `drawing_command` children. `\N`, `\n`, and `\h` are escape sequences.
Whitespace and Unicode text are preserved.

Override blocks contain `numeric_tag`, `color_tag`, `alpha_tag`, `font_tag`,
`reset_tag`, `position_tag`, `move_tag`, `fade_tag`, `transform_tag`, `clip_tag`,
`drawing_mode_tag`, `unknown_tag`, and `override_comment` nodes. Tag names are
available through the `name` field and a `tag_name` child. Numeric arguments,
colors, font names, timing arguments, and nested tags remain separate children.
Unknown parenthesized arguments remain structured in `unknown_tag_arguments`.

Drawing mode starts with `\p` followed by a positive scale and ends with `\p0`.
Drawing commands also occur inside vector clips. Nodes distinguish
`drawing_move`, `drawing_move_open`, `drawing_line`, `drawing_bezier`,
`drawing_spline`, `drawing_extend`, and `drawing_close`; coordinate pairs are
`drawing_point` nodes with `x` and `y` fields. Drawing mode resets at each event.

## Attachments and error recovery

Encoded attachment lines are `attachment_data` nodes after a matching
`fontname:` or `filename:` declaration in `[Fonts]` or `[Graphics]`.
Payload characters that resemble comments or brackets remain encoded data.

Records are bounded by LF, CRLF, CR, or end of file. Malformed timestamps,
incomplete tags, and invalid drawing parameter counts produce error nodes.
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
