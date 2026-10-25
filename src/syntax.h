#ifndef TREE_SITTER_ASS_SYNTAX_H_
#define TREE_SITTER_ASS_SYNTAX_H_

enum AssRecord { NO_RECORD, EVENT_RECORD, STYLE_RECORD };
#define ASS_SYNTAX_SERIALIZED_SIZE (ASS_FIELD_COUNT * 8 + 26)
_Static_assert(ASS_SYNTAX_SERIALIZED_SIZE + 3 <= TREE_SITTER_SERIALIZATION_BUFFER_SIZE,
               "ASS scanner state must fit in Tree-sitter's serialization buffer");

typedef struct {
  uint32_t event_positions[ASS_FIELD_COUNT];
  uint32_t style_positions[ASS_FIELD_COUNT];
  uint32_t event_text;
  uint32_t style_count;
  uint32_t index;
  uint32_t transform_depth;
  uint8_t record;
  bool in_styles;
  bool legacy;
  bool event_format_defined;
  bool style_format_defined;
  bool field_started;
  bool in_text;
  bool in_override;
  bool drawing;
  bool in_clip;
} AssSyntax;

static void ass_default_formats(AssSyntax *syntax) {
  static const enum AssField event[] = {
    FIELD_layer, FIELD_start, FIELD_end, FIELD_event_style, FIELD_actor,
    FIELD_margin_l, FIELD_margin_r, FIELD_margin_v, FIELD_effect,
  };
  static const enum AssField ass_style[] = {
    FIELD_style_name, FIELD_font_name, FIELD_font_size, FIELD_primary_colour,
    FIELD_secondary_colour, FIELD_outline_colour, FIELD_back_colour, FIELD_bold,
    FIELD_italic, FIELD_underline, FIELD_strikeout, FIELD_scale_x, FIELD_scale_y,
    FIELD_spacing, FIELD_angle, FIELD_border_style, FIELD_outline, FIELD_shadow,
    FIELD_alignment, FIELD_margin_l, FIELD_margin_r, FIELD_margin_v, FIELD_encoding,
  };
  static const enum AssField ssa_style[] = {
    FIELD_style_name, FIELD_font_name, FIELD_font_size, FIELD_primary_colour,
    FIELD_secondary_colour, FIELD_tertiary_colour, FIELD_back_colour, FIELD_bold,
    FIELD_italic, FIELD_border_style, FIELD_outline, FIELD_shadow, FIELD_alignment,
    FIELD_margin_l, FIELD_margin_r, FIELD_margin_v, FIELD_alpha_level, FIELD_encoding,
  };
  if (!syntax->event_format_defined) {
    for (unsigned i = 0; i < ASS_FIELD_COUNT; i++) syntax->event_positions[i] = UINT32_MAX;
    for (unsigned i = 0; i < sizeof(event) / sizeof(event[0]); i++) {
      syntax->event_positions[i == 0 && syntax->legacy ? FIELD_marked : event[i]] = i;
    }
    syntax->event_text = 9;
  }
  if (!syntax->style_format_defined) {
    const enum AssField *fields = syntax->legacy ? ssa_style : ass_style;
    syntax->style_count = syntax->legacy ? 18 : 23;
    for (unsigned i = 0; i < ASS_FIELD_COUNT; i++) syntax->style_positions[i] = UINT32_MAX;
    for (unsigned i = 0; i < syntax->style_count; i++) syntax->style_positions[fields[i]] = i;
  }
}

static enum AssField ass_field_kind(const char *name, bool style) {
  static const struct { const char *name; enum AssField kind; } fields[] = {
    {"layer", FIELD_layer}, {"marked", FIELD_marked}, {"start", FIELD_start},
    {"end", FIELD_end}, {"actor", FIELD_actor}, {"marginl", FIELD_margin_l},
    {"marginr", FIELD_margin_r}, {"marginv", FIELD_margin_v}, {"effect", FIELD_effect},
    {"fontname", FIELD_font_name}, {"fontsize", FIELD_font_size},
    {"primarycolour", FIELD_primary_colour}, {"secondarycolour", FIELD_secondary_colour},
    {"tertiarycolour", FIELD_tertiary_colour}, {"outlinecolour", FIELD_outline_colour},
    {"backcolour", FIELD_back_colour}, {"bold", FIELD_bold}, {"italic", FIELD_italic},
    {"underline", FIELD_underline}, {"strikeout", FIELD_strikeout},
    {"scalex", FIELD_scale_x}, {"scaley", FIELD_scale_y}, {"spacing", FIELD_spacing},
    {"angle", FIELD_angle}, {"borderstyle", FIELD_border_style}, {"outline", FIELD_outline},
    {"shadow", FIELD_shadow}, {"alignment", FIELD_alignment},
    {"alphalevel", FIELD_alpha_level}, {"encoding", FIELD_encoding},
  };
  if (strcmp(name, "name") == 0) return style ? FIELD_style_name : FIELD_actor;
  if (strcmp(name, "style") == 0 && !style) return FIELD_event_style;
  for (unsigned i = 0; i < sizeof(fields) / sizeof(fields[0]); i++) {
    if (strcmp(name, fields[i].name) == 0) return fields[i].kind;
  }
  return FIELD_unknown;
}

static void ass_read_typed_format(AssSyntax *syntax, TSLexer *lexer) {
  uint32_t positions[ASS_FIELD_COUNT];
  for (unsigned i = 0; i < ASS_FIELD_COUNT; i++) positions[i] = UINT32_MAX;
  uint32_t index = 0;
  uint32_t text_index = UINT32_MAX;
  lexer->advance(lexer, false);
  for (;;) {
    while (ass_horizontal_space(lexer->lookahead)) lexer->advance(lexer, false);
    char name[32] = {0};
    unsigned length = 0, trimmed = 0;
    while (!lexer->eof(lexer) && lexer->lookahead != ',' &&
           lexer->lookahead != '\r' && lexer->lookahead != '\n') {
      if (length + 1 < sizeof(name)) {
        name[length] = lexer->lookahead < 128 ? (char)ass_lowercase(lexer->lookahead) : '?';
      }
      length++;
      if (!ass_horizontal_space(lexer->lookahead)) trimmed = length;
      lexer->advance(lexer, false);
    }
    if (trimmed < sizeof(name)) {
      name[trimmed] = '\0';
      if (strcmp(name, "text") == 0) text_index = index;
      enum AssField kind = ass_field_kind(name, syntax->in_styles);
      if (kind != FIELD_unknown) positions[kind] = index;
    }
    if (lexer->lookahead != ',') break;
    index++;
    lexer->advance(lexer, false);
  }
  if (syntax->in_styles) {
    memcpy(syntax->style_positions, positions, sizeof(positions));
    syntax->style_count = index + 1;
    syntax->style_format_defined = true;
  } else if (text_index == index) {
    memcpy(syntax->event_positions, positions, sizeof(positions));
    syntax->event_text = text_index;
    syntax->event_format_defined = true;
  }
}

static bool ass_syntax_tokens_valid(const bool *valid) {
  for (unsigned i = FIELD_TOKEN_layer; i <= FIELD_TOKEN_unknown; i++) if (valid[i]) return true;
  return valid[EVENT_SEPARATOR] || valid[TEXT_START] || valid[TEXT_END] || valid[RECORD_END] ||
    valid[TEXT_CHUNK] || valid[ESCAPE_SEQUENCE] || valid[OVERRIDE_START] || valid[OVERRIDE_END] ||
    valid[DRAWING_MODE_TAG] || valid[CLIP_NAME] || valid[CLIP_END] ||
    valid[TRANSFORM_START] || valid[TRANSFORM_END] || valid[DRAW_MOVE] ||
    valid[DRAW_MOVE_OPEN] || valid[DRAW_LINE] || valid[DRAW_BEZIER] || valid[DRAW_SPLINE] ||
    valid[DRAW_EXTEND] || valid[DRAW_CLOSE];
}

static bool ass_scan_syntax(AssSyntax *syntax, TSLexer *lexer, const bool *valid) {
  if (valid[TEXT_START] && syntax->record == EVENT_RECORD &&
      syntax->index == syntax->event_text && !syntax->in_text) {
    lexer->mark_end(lexer);
    syntax->in_text = true;
    syntax->drawing = false;
    syntax->transform_depth = 0;
    lexer->result_symbol = TEXT_START;
    return true;
  }
  if (syntax->in_text && valid[TEXT_END] &&
      (lexer->eof(lexer) || lexer->lookahead == '\r' || lexer->lookahead == '\n')) {
    lexer->mark_end(lexer);
    syntax->in_text = false;
    syntax->in_override = false;
    syntax->drawing = false;
    lexer->result_symbol = TEXT_END;
    return true;
  }
  if (valid[RECORD_END] && !syntax->in_text && syntax->field_started &&
      syntax->record == STYLE_RECORD && syntax->index + 1 == syntax->style_count) {
    while (ass_horizontal_space(lexer->lookahead)) lexer->advance(lexer, true);
    if (!lexer->eof(lexer) && lexer->lookahead != '\r' && lexer->lookahead != '\n') return false;
    lexer->mark_end(lexer);
    syntax->record = NO_RECORD;
    syntax->field_started = false;
    lexer->result_symbol = RECORD_END;
    return true;
  }
  if (valid[RECORD_END] && !syntax->in_text && syntax->record == EVENT_RECORD &&
      syntax->index == syntax->event_text) {
    lexer->mark_end(lexer);
    syntax->record = NO_RECORD;
    lexer->result_symbol = RECORD_END;
    return true;
  }
  if (!syntax->in_text && syntax->record != NO_RECORD) {
    if (syntax->field_started) {
      while (ass_horizontal_space(lexer->lookahead)) lexer->advance(lexer, true);
    }
    if (valid[EVENT_SEPARATOR] && syntax->field_started && lexer->lookahead == ',') {
      lexer->advance(lexer, false);
      lexer->mark_end(lexer);
      syntax->index++;
      syntax->field_started = false;
      lexer->result_symbol = EVENT_SEPARATOR;
      return true;
    }
    if (!syntax->field_started) {
      const uint32_t *positions = syntax->record == EVENT_RECORD ? syntax->event_positions : syntax->style_positions;
      enum AssField kind = FIELD_unknown;
      for (unsigned i = 0; i < FIELD_unknown; i++) {
        if (positions[i] == syntax->index) { kind = (enum AssField)i; break; }
      }
      if (valid[FIELD_TOKEN_layer + kind]) {
        lexer->mark_end(lexer);
        syntax->field_started = true;
        lexer->result_symbol = FIELD_TOKEN_layer + kind;
        return true;
      }
    }
    return false;
  }
  if (!syntax->in_text) return false;
  if (valid[OVERRIDE_START] && lexer->lookahead == '{') {
    lexer->advance(lexer, false);
    lexer->mark_end(lexer);
    syntax->in_override = true;
    lexer->result_symbol = OVERRIDE_START;
    return true;
  }
  if (valid[OVERRIDE_END] && lexer->lookahead == '}') {
    lexer->advance(lexer, false);
    lexer->mark_end(lexer);
    syntax->in_override = false;
    syntax->in_clip = false;
    lexer->result_symbol = OVERRIDE_END;
    return true;
  }
  if (syntax->in_override) {
    while (ass_horizontal_space(lexer->lookahead)) lexer->advance(lexer, true);
    if (valid[DRAWING_MODE_TAG] && lexer->lookahead == 'p') {
      lexer->advance(lexer, false);
      lexer->mark_end(lexer);
      while (ass_horizontal_space(lexer->lookahead)) lexer->advance(lexer, false);
      bool negative = lexer->lookahead == '-';
      if (lexer->lookahead == '-' || lexer->lookahead == '+') lexer->advance(lexer, false);
      bool nonzero = false;
      bool digits = false;
      while (lexer->lookahead >= '0' && lexer->lookahead <= '9') {
        digits = true;
        nonzero = nonzero || lexer->lookahead != '0';
        lexer->advance(lexer, false);
      }
      if (!digits && lexer->lookahead != '\\' && lexer->lookahead != '}' &&
          lexer->lookahead != ')' && lexer->lookahead != '\r' &&
          lexer->lookahead != '\n' && !lexer->eof(lexer)) return false;
      if (syntax->transform_depth == 0) syntax->drawing = !negative && nonzero;
      lexer->result_symbol = DRAWING_MODE_TAG;
      return true;
    }
    if (valid[CLIP_NAME] && (lexer->lookahead == 'c' || lexer->lookahead == 'i')) {
      if (lexer->lookahead == 'i') lexer->advance(lexer, false);
      if (!ass_match_word(lexer, "clip")) return false;
      lexer->mark_end(lexer);
      syntax->in_clip = true;
      lexer->result_symbol = CLIP_NAME;
      return true;
    }
    if (valid[CLIP_END] && lexer->lookahead == ')') {
      lexer->advance(lexer, false);
      lexer->mark_end(lexer);
      syntax->in_clip = false;
      lexer->result_symbol = CLIP_END;
      return true;
    }
    if (valid[TRANSFORM_START] && lexer->lookahead == 't') {
      lexer->advance(lexer, false);
      lexer->mark_end(lexer);
      syntax->transform_depth++;
      lexer->result_symbol = TRANSFORM_START;
      return true;
    }
    if (valid[TRANSFORM_END] && lexer->lookahead == ')' && syntax->transform_depth > 0) {
      lexer->advance(lexer, false);
      lexer->mark_end(lexer);
      syntax->transform_depth--;
      lexer->result_symbol = TRANSFORM_END;
      return true;
    }
    if (!syntax->in_clip) return false;
  }
  if (syntax->drawing || syntax->in_clip) {
    while (ass_horizontal_space(lexer->lookahead)) lexer->advance(lexer, true);
    enum TokenType symbol;
    switch (lexer->lookahead) {
      case 'm': symbol = DRAW_MOVE; break;
      case 'n': symbol = DRAW_MOVE_OPEN; break;
      case 'l': symbol = DRAW_LINE; break;
      case 'b': symbol = DRAW_BEZIER; break;
      case 's': symbol = DRAW_SPLINE; break;
      case 'p': symbol = DRAW_EXTEND; break;
      case 'c': symbol = DRAW_CLOSE; break;
      default: return false;
    }
    if (!valid[symbol]) return false;
    lexer->advance(lexer, false);
    lexer->mark_end(lexer);
    lexer->result_symbol = symbol;
    return true;
  }
  if (!valid[TEXT_CHUNK] && !valid[ESCAPE_SEQUENCE]) return false;
  bool content = false;
  while (!lexer->eof(lexer) && lexer->lookahead != '\r' && lexer->lookahead != '\n' && lexer->lookahead != '{') {
    if (lexer->lookahead == '\\') {
      lexer->advance(lexer, false);
      if (lexer->lookahead == 'N' || lexer->lookahead == 'n' || lexer->lookahead == 'h') {
        if (content) { lexer->result_symbol = TEXT_CHUNK; return true; }
        lexer->advance(lexer, false);
        lexer->mark_end(lexer);
        lexer->result_symbol = ESCAPE_SEQUENCE;
        return true;
      }
    } else lexer->advance(lexer, false);
    content = true;
    lexer->mark_end(lexer);
  }
  if (!content) return false;
  lexer->result_symbol = TEXT_CHUNK;
  return true;
}

static unsigned ass_syntax_serialize(const AssSyntax *syntax, char *buffer) {
  unsigned offset = 0;
  for (unsigned group = 0; group < 2; group++) {
    const uint32_t *positions = group == 0 ? syntax->event_positions : syntax->style_positions;
    for (unsigned i = 0; i < ASS_FIELD_COUNT; i++) {
      for (unsigned byte = 0; byte < 4; byte++) buffer[offset++] = (char)(positions[i] >> (byte * 8));
    }
  }
  const uint32_t counts[] = {syntax->event_text, syntax->style_count, syntax->index, syntax->transform_depth};
  for (unsigned i = 0; i < 4; i++) {
    for (unsigned byte = 0; byte < 4; byte++) buffer[offset++] = (char)(counts[i] >> (byte * 8));
  }
  buffer[offset++] = syntax->record;
  buffer[offset++] = syntax->in_styles;
  buffer[offset++] = syntax->legacy;
  buffer[offset++] = syntax->event_format_defined;
  buffer[offset++] = syntax->style_format_defined;
  buffer[offset++] = syntax->field_started;
  buffer[offset++] = syntax->in_text;
  buffer[offset++] = syntax->in_override;
  buffer[offset++] = syntax->drawing;
  buffer[offset++] = syntax->in_clip;
  return offset;
}

static unsigned ass_syntax_deserialize(AssSyntax *syntax, const char *buffer) {
  unsigned offset = 0;
  for (unsigned group = 0; group < 2; group++) {
    uint32_t *positions = group == 0 ? syntax->event_positions : syntax->style_positions;
    for (unsigned i = 0; i < ASS_FIELD_COUNT; i++) {
      positions[i] = 0;
      for (unsigned byte = 0; byte < 4; byte++) positions[i] |= (uint32_t)(uint8_t)buffer[offset++] << (byte * 8);
    }
  }
  uint32_t *counts[] = {&syntax->event_text, &syntax->style_count, &syntax->index, &syntax->transform_depth};
  for (unsigned i = 0; i < 4; i++) {
    *counts[i] = 0;
    for (unsigned byte = 0; byte < 4; byte++) *counts[i] |= (uint32_t)(uint8_t)buffer[offset++] << (byte * 8);
  }
  syntax->record = (uint8_t)buffer[offset++];
  syntax->in_styles = buffer[offset++];
  syntax->legacy = buffer[offset++];
  syntax->event_format_defined = buffer[offset++];
  syntax->style_format_defined = buffer[offset++];
  syntax->field_started = buffer[offset++];
  syntax->in_text = buffer[offset++];
  syntax->in_override = buffer[offset++];
  syntax->drawing = buffer[offset++];
  syntax->in_clip = buffer[offset++];
  return offset;
}

#endif
