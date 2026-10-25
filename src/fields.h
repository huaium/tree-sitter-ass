#ifndef TREE_SITTER_ASS_FIELDS_H_
#define TREE_SITTER_ASS_FIELDS_H_

#define ASS_FIELDS(X) \
  X(layer) X(marked) X(start) X(end) X(event_style) X(actor) \
  X(margin_l) X(margin_r) X(margin_v) X(effect) X(style_name) X(font_name) \
  X(font_size) X(primary_colour) X(secondary_colour) X(tertiary_colour) \
  X(outline_colour) X(back_colour) X(bold) X(italic) X(underline) X(strikeout) \
  X(scale_x) X(scale_y) X(spacing) X(angle) X(border_style) X(outline) \
  X(shadow) X(alignment) X(alpha_level) X(encoding) \
  X(margin_t) X(margin_b) X(relative_to) X(unknown)

#define ASS_FIELD_ENUM(name) FIELD_##name,
enum AssField { ASS_FIELDS(ASS_FIELD_ENUM) ASS_FIELD_COUNT };
#undef ASS_FIELD_ENUM

#endif
