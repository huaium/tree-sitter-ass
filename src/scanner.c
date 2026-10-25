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
  ERROR_SENTINEL,
};

typedef struct {
  uint32_t fields_before_text;
  uint32_t remaining_fields;
  bool in_events;
  bool in_event_values;
} AssScanner;

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

static bool ass_scan(AssScanner *scanner, TSLexer *lexer, const bool *valid_symbols) {
  if (valid_symbols[ERROR_SENTINEL]) {
    while (ass_horizontal_space(lexer->lookahead) || lexer->lookahead == '\r' ||
           lexer->lookahead == '\n' || lexer->lookahead == 0xfeff) {
      lexer->advance(lexer, true);
    }
    if (lexer->lookahead != '[') return false;
    lexer->advance(lexer, false);
    lexer->mark_end(lexer);
    scanner->in_events = false;
    scanner->in_event_values = false;
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

  if (valid_symbols[EVENTS_SECTION_NAME]) {
    while (ass_horizontal_space(lexer->lookahead)) lexer->advance(lexer, false);
    if (!ass_match_word(lexer, "events")) return false;
    while (ass_horizontal_space(lexer->lookahead)) lexer->advance(lexer, false);
    if (lexer->lookahead != ']') return false;
    lexer->mark_end(lexer);
    scanner->in_events = true;
    lexer->result_symbol = EVENTS_SECTION_NAME;
    return true;
  }

  while (ass_horizontal_space(lexer->lookahead) || lexer->lookahead == '\r' ||
         lexer->lookahead == '\n' || lexer->lookahead == 0xfeff) {
    lexer->advance(lexer, true);
  }
  if (valid_symbols[SECTION_START] && lexer->lookahead == '[') {
    lexer->advance(lexer, false);
    lexer->mark_end(lexer);
    scanner->in_events = false;
    scanner->in_event_values = false;
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
  return 10;
}

void tree_sitter_ass_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  AssScanner *scanner = payload;
  *scanner = (AssScanner){.fields_before_text = 9};
  if (length == 0) return;
  assert(length == 10);
  scanner->fields_before_text = 0;
  for (unsigned i = 0; i < 4; i++) {
    scanner->fields_before_text |= (uint32_t)(uint8_t)buffer[i] << (i * 8);
    scanner->remaining_fields |= (uint32_t)(uint8_t)buffer[i + 4] << (i * 8);
  }
  scanner->in_events = buffer[8];
  scanner->in_event_values = buffer[9];
}

bool tree_sitter_ass_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  AssScanner next = *(AssScanner *)payload;
  if (!ass_scan(&next, lexer, valid_symbols)) return false;
  *(AssScanner *)payload = next;
  return true;
}
