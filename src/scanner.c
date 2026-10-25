#include "tree_sitter/parser.h"

#include <assert.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

enum TokenType {
  SECTION_START,
  EVENTS_SECTION_NAME,
  EVENT_FORMAT_KEY,
  EVENT_DIALOGUE_KEY,
  EVENT_COMMENT_KEY,
  EVENT_FIELD,
  EVENT_SEPARATOR,
  EVENT_TEXT,
  FONTS_SECTION_NAME,
  GRAPHICS_SECTION_NAME,
  FONT_ATTACHMENT_KEY,
  GRAPHICS_ATTACHMENT_KEY,
  ATTACHMENT_DATA,
  ERROR_SENTINEL,
};

typedef struct {
  uint32_t fields_before_text;
  uint32_t remaining_fields;
  bool in_events;
  bool in_event_values;
  uint8_t attachment_kind;
  bool attachment_started;
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
static void ass_read_format(AssScanner *scanner, TSLexer *lexer) {
  uint32_t index = 0;
  lexer->advance(lexer, false); // colon
  for (;;) {
    while (ass_horizontal_space(lexer->lookahead)) lexer->advance(lexer, false);
    char name[4] = {0};
    uint32_t length = 0;
    uint32_t trimmed_length = 0;
    while (!lexer->eof(lexer) && lexer->lookahead != ',' &&
           lexer->lookahead != '\r' && lexer->lookahead != '\n') {
      if (length < sizeof(name) && lexer->lookahead < 128) {
        name[length] = (char)ass_lowercase(lexer->lookahead);
      }
      length++;
      if (!ass_horizontal_space(lexer->lookahead)) trimmed_length = length;
      lexer->advance(lexer, false);
    }
    if (lexer->lookahead != ',') {
      if (trimmed_length == 4 && memcmp(name, "text", 4) == 0) {
        scanner->fields_before_text = index;
      }
      return;
    }
    index++;
    lexer->advance(lexer, false);
  }
}

static void ass_start_section(AssScanner *scanner) {
  scanner->in_events = false;
  scanner->in_event_values = false;
  scanner->attachment_kind = NO_ATTACHMENT;
  scanner->attachment_started = false;
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

  if (scanner->in_event_values) {
    if (valid_symbols[EVENT_FIELD] && scanner->remaining_fields > 0) {
      while (!lexer->eof(lexer) && lexer->lookahead != ',' &&
             lexer->lookahead != '\r' && lexer->lookahead != '\n') {
        lexer->advance(lexer, false);
      }
      if (lexer->lookahead != ',') return false;
      lexer->mark_end(lexer);
      scanner->remaining_fields--;
      lexer->result_symbol = EVENT_FIELD;
      return true;
    }
    if (valid_symbols[EVENT_SEPARATOR] && lexer->lookahead == ',') {
      lexer->advance(lexer, false);
      lexer->mark_end(lexer);
      lexer->result_symbol = EVENT_SEPARATOR;
      return true;
    }
    if (valid_symbols[EVENT_TEXT] && scanner->remaining_fields == 0) {
      while (!lexer->eof(lexer) && lexer->lookahead != '\r' && lexer->lookahead != '\n') {
        lexer->advance(lexer, false);
      }
      lexer->mark_end(lexer);
      scanner->in_event_values = false;
      lexer->result_symbol = EVENT_TEXT;
      return true;
    }
  }

  if (valid_symbols[EVENTS_SECTION_NAME] || valid_symbols[FONTS_SECTION_NAME] ||
      valid_symbols[GRAPHICS_SECTION_NAME]) {
    while (ass_horizontal_space(lexer->lookahead)) lexer->advance(lexer, false);
    enum TokenType symbol;
    const char *name;
    switch (ass_lowercase(lexer->lookahead)) {
      case 'e': symbol = EVENTS_SECTION_NAME; name = "events"; break;
      case 'f': symbol = FONTS_SECTION_NAME; name = "fonts"; break;
      case 'g': symbol = GRAPHICS_SECTION_NAME; name = "graphics"; break;
      default: return false;
    }
    if (!valid_symbols[symbol] || !ass_match_word(lexer, name)) return false;
    while (ass_horizontal_space(lexer->lookahead)) lexer->advance(lexer, false);
    if (lexer->lookahead != ']') return false;
    lexer->mark_end(lexer);
    scanner->in_events = symbol == EVENTS_SECTION_NAME;
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
  if (!scanner->in_events) return false;

  enum TokenType symbol;
  const char *word;
  switch (ass_lowercase(lexer->lookahead)) {
    case 'f': symbol = EVENT_FORMAT_KEY; word = "format"; break;
    case 'd': symbol = EVENT_DIALOGUE_KEY; word = "dialogue"; break;
    case 'c': symbol = EVENT_COMMENT_KEY; word = "comment"; break;
    default: return false;
  }
  if (!valid_symbols[symbol] || !ass_match_word(lexer, word)) return false;
  lexer->mark_end(lexer);
  while (ass_horizontal_space(lexer->lookahead)) lexer->advance(lexer, false);
  if (lexer->lookahead != ':') return false;
  if (symbol == EVENT_FORMAT_KEY) {
    ass_read_format(scanner, lexer);
  } else {
    scanner->remaining_fields = scanner->fields_before_text;
    scanner->in_event_values = true;
  }
  lexer->result_symbol = symbol;
  return true;
}

void *tree_sitter_ass_external_scanner_create(void) {
  AssScanner *scanner = calloc(1, sizeof(AssScanner));
  assert(scanner);
  scanner->fields_before_text = 9;
  return scanner;
}

void tree_sitter_ass_external_scanner_destroy(void *payload) {
  free(payload);
}

unsigned tree_sitter_ass_external_scanner_serialize(void *payload, char *buffer) {
  const AssScanner *scanner = payload;
  for (unsigned i = 0; i < 4; i++) {
    buffer[i] = (char)(scanner->fields_before_text >> (i * 8));
    buffer[i + 4] = (char)(scanner->remaining_fields >> (i * 8));
  }
  buffer[8] = scanner->in_events;
  buffer[9] = scanner->in_event_values;
  buffer[10] = scanner->attachment_kind;
  buffer[11] = scanner->attachment_started;
  return 12;
}

void tree_sitter_ass_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  AssScanner *scanner = payload;
  *scanner = (AssScanner){.fields_before_text = 9};
  if (length == 0) return;
  assert(length == 12);
  scanner->fields_before_text = 0;
  for (unsigned i = 0; i < 4; i++) {
    scanner->fields_before_text |= (uint32_t)(uint8_t)buffer[i] << (i * 8);
    scanner->remaining_fields |= (uint32_t)(uint8_t)buffer[i + 4] << (i * 8);
  }
  scanner->in_events = buffer[8];
  scanner->in_event_values = buffer[9];
  scanner->attachment_kind = (uint8_t)buffer[10];
  scanner->attachment_started = buffer[11];
}

bool tree_sitter_ass_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  AssScanner next = *(AssScanner *)payload;
  if (!ass_scan(&next, lexer, valid_symbols)) return false;
  *(AssScanner *)payload = next;
  return true;
}
