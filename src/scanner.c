#include "tree_sitter/parser.h"

#include <assert.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "fields.h"

enum TokenType {
  SECTION_START,
  EVENTS_SECTION_NAME,
  EVENT_FORMAT_KEY,
  EVENT_DIALOGUE_KEY,
  EVENT_COMMENT_KEY,
  EVENT_SEPARATOR,
  FONTS_SECTION_NAME,
  GRAPHICS_SECTION_NAME,
  FONT_ATTACHMENT_KEY,
  GRAPHICS_ATTACHMENT_KEY,
  ATTACHMENT_DATA,
  STYLES_SECTION_NAME,
  STYLE_KEY,
  SCRIPT_TYPE_KEY,
  EVENT_PICTURE_KEY,
  EVENT_SOUND_KEY,
  EVENT_MOVIE_KEY,
  EVENT_COMMAND_KEY,
  TEXT_START,
  TEXT_END,
  RECORD_END,
  TEXT_CHUNK,
  ESCAPE_SEQUENCE,
  OVERRIDE_START,
  OVERRIDE_END,
  DRAWING_MODE_TAG,
  CLIP_NAME,
  CLIP_END,
  TRANSFORM_START,
  TRANSFORM_END,
  DRAW_MOVE,
  DRAW_MOVE_OPEN,
  DRAW_LINE,
  DRAW_BEZIER,
  DRAW_SPLINE,
  DRAW_EXTEND,
  DRAW_CLOSE,
  END_OF_FILE,
  UNKNOWN_TAG_NAME,
  IGNORED_BACKSLASH,
#define ASS_FIELD_TOKEN(name) FIELD_TOKEN_##name,
  ASS_FIELDS(ASS_FIELD_TOKEN)
#undef ASS_FIELD_TOKEN
  ERROR_SENTINEL,
};

static bool ass_horizontal_space(int32_t character);
static int32_t ass_lowercase(int32_t character);
static bool ass_match_word(TSLexer *lexer, const char *word);
#include "syntax.h"

typedef struct {
  bool in_events;
  uint8_t attachment_kind;
  bool attachment_started;
  AssSyntax syntax;
} AssScanner;

enum AttachmentKind { NO_ATTACHMENT, FONT_ATTACHMENT, GRAPHICS_ATTACHMENT };

static bool ass_horizontal_space(int32_t character) {
  return character == ' ' || character == '\t';
}

static int32_t ass_lowercase(int32_t character) {
  return character >= 'A' && character <= 'Z' ? character + ('a' - 'A') : character;
}

static bool ass_match_word(TSLexer *lexer, const char *word) {
  for (; *word; word++) {
    if (ass_lowercase(lexer->lookahead) != *word) return false;
    lexer->advance(lexer, false);
  }
  return true;
}

// Inspect the format after the key, leaving mark_end at the end of the key.
static void ass_start_section(AssScanner *scanner) {
  scanner->in_events = false;
  scanner->attachment_kind = NO_ATTACHMENT;
  scanner->attachment_started = false;
  scanner->syntax.in_styles = false;
  scanner->syntax.record = NO_RECORD;
  scanner->syntax.field_started = false;
  scanner->syntax.in_text = false;
  scanner->syntax.in_override = false;
  scanner->syntax.drawing = false;
  scanner->syntax.in_clip = false;
  scanner->syntax.transform_depth = 0;
}

static bool ass_scan_attachment(AssScanner *scanner, TSLexer *lexer, const bool *valid_symbols) {
  const bool starts_with_bracket = lexer->lookahead == '[';
  bool encoded = true;
  bool header_name = false;
  bool header_closed = false;
  bool invalid_header = false;
  char section_name[8] = {0};
  uint32_t section_name_length = 0;
  uint32_t length = 0;
  const char *key = scanner->attachment_kind == FONT_ATTACHMENT ? "fontname" : "filename";
  enum TokenType key_symbol = scanner->attachment_kind == FONT_ATTACHMENT
    ? FONT_ATTACHMENT_KEY : GRAPHICS_ATTACHMENT_KEY;
  bool matches_key = valid_symbols[key_symbol];

  while (!lexer->eof(lexer) && lexer->lookahead != '\r' && lexer->lookahead != '\n') {
    int32_t character = lexer->lookahead;
    if (matches_key) {
      if (length < 8) {
        matches_key = ass_lowercase(character) == key[length];
      } else if (character == ':') {
        scanner->attachment_started = true;
        lexer->result_symbol = key_symbol;
        return true;
      } else if (!ass_horizontal_space(character)) {
        matches_key = false;
      }
    }
    encoded = encoded && character >= '!' && character <= '`';
    if (starts_with_bracket && length > 0) {
      if (character == '[') invalid_header = true;
      else if (character == ']') {
        if (!header_name || header_closed) invalid_header = true;
        header_closed = true;
      } else if (header_closed) {
        if (!ass_horizontal_space(character)) invalid_header = true;
      } else {
        header_name = true;
        if (section_name_length < sizeof(section_name) && character < 128) {
          section_name[section_name_length] = (char)ass_lowercase(character);
        }
        section_name_length++;
      }
    }
    lexer->advance(lexer, false);
    length++;
    // Keep the opening bracket or declaration key available after lookahead.
    if ((starts_with_bracket && length == 1) || (matches_key && length == 8)) {
      lexer->mark_end(lexer);
    }
  }

  const bool known_section =
    (section_name_length == 6 && memcmp(section_name, "events", 6) == 0) ||
    (section_name_length == 5 && memcmp(section_name, "fonts", 5) == 0) ||
    (section_name_length == 8 && memcmp(section_name, "graphics", 8) == 0);
  // Encoded bytes may themselves form a bracketed string such as [AAAA].
  if (starts_with_bracket && header_closed && !invalid_header && valid_symbols[SECTION_START] &&
      (!encoded || known_section || !scanner->attachment_started)) {
    ass_start_section(scanner);
    lexer->result_symbol = SECTION_START;
    return true;
  }
  if (length > 0 && encoded && scanner->attachment_started && valid_symbols[ATTACHMENT_DATA]) {
    lexer->mark_end(lexer);
    lexer->result_symbol = ATTACHMENT_DATA;
    return true;
  }
  return false;
}

static bool ass_scan(AssScanner *scanner, TSLexer *lexer, const bool *valid_symbols) {
  if (valid_symbols[ERROR_SENTINEL]) {
    while (ass_horizontal_space(lexer->lookahead) || lexer->lookahead == '\r' ||
           lexer->lookahead == '\n' || lexer->lookahead == 0xfeff) {
      lexer->advance(lexer, true);
    }
    if (lexer->lookahead != '[') return false;
    lexer->advance(lexer, false);
    lexer->mark_end(lexer);
    ass_start_section(scanner);
    lexer->result_symbol = SECTION_START;
    return true;
  }

  if (valid_symbols[END_OF_FILE] && lexer->eof(lexer)) {
    lexer->mark_end(lexer);
    lexer->result_symbol = END_OF_FILE;
    return true;
  }
  if (scanner->syntax.record != NO_RECORD && ass_syntax_tokens_valid(valid_symbols)) {
    return ass_scan_syntax(&scanner->syntax, lexer, valid_symbols);
  }

  if (valid_symbols[EVENTS_SECTION_NAME] || valid_symbols[FONTS_SECTION_NAME] ||
      valid_symbols[GRAPHICS_SECTION_NAME] || valid_symbols[STYLES_SECTION_NAME]) {
    while (ass_horizontal_space(lexer->lookahead)) lexer->advance(lexer, false);
    enum TokenType symbol;
    const char *name;
    switch (ass_lowercase(lexer->lookahead)) {
      case 'e': symbol = EVENTS_SECTION_NAME; name = "events"; break;
      case 'f': symbol = FONTS_SECTION_NAME; name = "fonts"; break;
      case 'g': symbol = GRAPHICS_SECTION_NAME; name = "graphics"; break;
      case 'v': symbol = STYLES_SECTION_NAME; name = "v4"; break;
      default: return false;
    }
    if (!valid_symbols[symbol] || !ass_match_word(lexer, name)) return false;
    if (symbol == STYLES_SECTION_NAME) {
      scanner->syntax.legacy = lexer->lookahead != '+';
      scanner->syntax.extended = false;
      if (lexer->lookahead == '+') lexer->advance(lexer, false);
      if (lexer->lookahead == '+') {
        scanner->syntax.extended = true;
        lexer->advance(lexer, false);
      }
      if (!ass_horizontal_space(lexer->lookahead)) return false;
      while (ass_horizontal_space(lexer->lookahead)) lexer->advance(lexer, false);
      if (!ass_match_word(lexer, "styles")) return false;
      ass_default_formats(&scanner->syntax);
    }
    while (ass_horizontal_space(lexer->lookahead)) lexer->advance(lexer, false);
    if (lexer->lookahead != ']') return false;
    lexer->mark_end(lexer);
    scanner->in_events = symbol == EVENTS_SECTION_NAME;
    scanner->syntax.in_styles = symbol == STYLES_SECTION_NAME;
    scanner->attachment_kind = symbol == FONTS_SECTION_NAME ? FONT_ATTACHMENT
      : symbol == GRAPHICS_SECTION_NAME ? GRAPHICS_ATTACHMENT : NO_ATTACHMENT;
    lexer->result_symbol = symbol;
    return true;
  }

  while (ass_horizontal_space(lexer->lookahead) || lexer->lookahead == '\r' ||
         lexer->lookahead == '\n' || lexer->lookahead == 0xfeff) {
    lexer->advance(lexer, true);
  }
  if (scanner->attachment_kind != NO_ATTACHMENT &&
      (valid_symbols[ATTACHMENT_DATA] || valid_symbols[FONT_ATTACHMENT_KEY] ||
       valid_symbols[GRAPHICS_ATTACHMENT_KEY])) {
    return ass_scan_attachment(scanner, lexer, valid_symbols);
  }
  if (valid_symbols[SECTION_START] && lexer->lookahead == '[') {
    lexer->advance(lexer, false);
    lexer->mark_end(lexer);
    ass_start_section(scanner);
    lexer->result_symbol = SECTION_START;
    return true;
  }
  if (valid_symbols[SCRIPT_TYPE_KEY] && ass_lowercase(lexer->lookahead) == 's' &&
      !scanner->syntax.in_styles && !scanner->in_events) {
    if (!ass_match_word(lexer, "script")) return false;
    while (ass_horizontal_space(lexer->lookahead)) lexer->advance(lexer, false);
    if (!ass_match_word(lexer, "type")) return false;
    lexer->mark_end(lexer);
    while (ass_horizontal_space(lexer->lookahead)) lexer->advance(lexer, false);
    if (lexer->lookahead != ':') return false;
    lexer->advance(lexer, false);
    while (ass_horizontal_space(lexer->lookahead)) lexer->advance(lexer, false);
    if (ass_match_word(lexer, "v4.00")) {
      scanner->syntax.legacy = lexer->lookahead != '+';
      scanner->syntax.extended = false;
      if (lexer->lookahead == '+') {
        lexer->advance(lexer, false);
        scanner->syntax.extended = lexer->lookahead == '+';
      }
      ass_default_formats(&scanner->syntax);
    }
    lexer->result_symbol = SCRIPT_TYPE_KEY;
    return true;
  }
  if (!scanner->in_events && !scanner->syntax.in_styles) return false;

  enum TokenType symbol;
  const char *word;
  switch (ass_lowercase(lexer->lookahead)) {
    case 'f': symbol = EVENT_FORMAT_KEY; word = "format"; break;
    case 'd': symbol = EVENT_DIALOGUE_KEY; word = "dialogue"; break;
    case 'c':
      if (!ass_match_word(lexer, "comm")) return false;
      if (ass_lowercase(lexer->lookahead) == 'e') { symbol = EVENT_COMMENT_KEY; word = "ent"; }
      else { symbol = EVENT_COMMAND_KEY; word = "and"; }
      break;
    case 's':
      symbol = scanner->in_events ? EVENT_SOUND_KEY : STYLE_KEY;
      word = scanner->in_events ? "sound" : "style";
      break;
    case 'p': symbol = EVENT_PICTURE_KEY; word = "picture"; break;
    case 'm': symbol = EVENT_MOVIE_KEY; word = "movie"; break;
    default: return false;
  }
  if (!valid_symbols[symbol] || !ass_match_word(lexer, word)) return false;
  if (symbol == STYLE_KEY && !scanner->syntax.in_styles) return false;
  if (symbol != STYLE_KEY && symbol != EVENT_FORMAT_KEY && !scanner->in_events) return false;
  lexer->mark_end(lexer);
  while (ass_horizontal_space(lexer->lookahead)) lexer->advance(lexer, false);
  if (lexer->lookahead != ':') return false;
  if (symbol == EVENT_FORMAT_KEY) {
    ass_read_typed_format(&scanner->syntax, lexer);
  } else {
    scanner->syntax.record = symbol == STYLE_KEY ? STYLE_RECORD
      : symbol == EVENT_COMMENT_KEY ? COMMENT_RECORD : EVENT_RECORD;
    scanner->syntax.index = 0;
    scanner->syntax.field_started = false;
    scanner->syntax.in_text = false;
    scanner->syntax.in_override = false;
    scanner->syntax.in_clip = false;
    scanner->syntax.transform_depth = 0;
  }
  lexer->result_symbol = symbol;
  return true;
}

void *tree_sitter_ass_external_scanner_create(void) {
  AssScanner *scanner = calloc(1, sizeof(AssScanner));
  assert(scanner);
  ass_default_formats(&scanner->syntax);
  return scanner;
}

void tree_sitter_ass_external_scanner_destroy(void *payload) {
  free(payload);
}

unsigned tree_sitter_ass_external_scanner_serialize(void *payload, char *buffer) {
  const AssScanner *scanner = payload;
  buffer[0] = scanner->in_events;
  buffer[1] = scanner->attachment_kind;
  buffer[2] = scanner->attachment_started;
  return 3 + ass_syntax_serialize(&scanner->syntax, buffer + 3);
}

void tree_sitter_ass_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  AssScanner *scanner = payload;
  *scanner = (AssScanner){0};
  ass_default_formats(&scanner->syntax);
  if (length == 0) return;
  assert(length == 3 + ASS_SYNTAX_SERIALIZED_SIZE);
  scanner->in_events = buffer[0];
  scanner->attachment_kind = (uint8_t)buffer[1];
  scanner->attachment_started = buffer[2];
  ass_syntax_deserialize(&scanner->syntax, buffer + 3);
}

bool tree_sitter_ass_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  AssScanner next = *(AssScanner *)payload;
  if (!ass_scan(&next, lexer, valid_symbols)) return false;
  *(AssScanner *)payload = next;
  return true;
}
