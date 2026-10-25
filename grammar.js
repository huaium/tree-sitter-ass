/**
 * @file A tree-sitter parser for ass subtitles
 * @author Huaium <huaium233@gmail.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

/**
 * Converts a string with spaces to a lowercase string with underscores.
 *
 * @param {string} word - The input string to convert.
 * @returns {string} - The converted string with spaces replaced by underscores.
 */
function toLowerCaseUnderscored(word) {
  return word.toLowerCase().split(" ").join("_");
}

/**
 * Creates a case-insensitive regular expression from a given word.
 *
 * @param {string} word - The input word to make case-insensitive.
 * @returns {RegExp} - A regular expression that matches the word case-insensitively.
 */
function caseInsensitive(word) {
  return new RegExp(
    word
      .split("")
      .map((char) =>
        char === " " ? "[ \\t]+" : `[${char.toLowerCase()}${char.toUpperCase()}]`,
      )
      .join(""),
  );
}

/**
 * Generates rules for section headers, including legacy styles, custom sections,
 * and sections based on the provided words.
 *
 * @param {GrammarSymbols<any>} $ - The grammar context.
 * @param {string[]} words - The list of words to create section rules for.
 * @returns {Rule[]} - An array of rules for section headers, including:
 *                    1. Legacy `v4 Styles` and `v4+ Styles` sections
 *                    2. Sections based on the provided words
 *                    3. Custom sections with arbitrary names
 */
function sectionRules($, words) {
  /**
   * @type {Rule[]}
   */
  const rules = [];

  // 1. For legacy `v4 Styles`
  rules.push(
    field(
      "section_name_styles",
      alias(
        $._styles_section_name,
        $.section_name,
      ),
    ),
  );

  // 2. For each words
  const scannedSections = {
    Events: $._events_section_name,
    Fonts: $._fonts_section_name,
    Graphics: $._graphics_section_name,
  };
  words.forEach((word) =>
    rules.push(
      field(
        `section_name_${toLowerCaseUnderscored(word)}`,
        alias(scannedSections[word] ?? token.immediate(caseInsensitive(word)), $.section_name),
      ),
    ),
  );

  // 3. For customed sections
  rules.push(
    prec(
      -1,
      field("section_name_custom", alias(token.immediate(/[^\[\]\r\n]+/), $.section_name)),
    ),
  );

  return rules;
}

/**
 * Generates rules for key-value pairs with fields and aliases for a given set of words.
 *
 * This function handles three types of key-value pair rules:
 * 1. A special case for the ambiguous `ScriptType` field in `Script Info`.
 * 2. Rules for each word in the provided list, with special handling for certain fields.
 * 3. A catch-all rule for custom fields that don't match any predefined patterns.
 *
 * @param {GrammarSymbols<any>} $ - The grammar context.
 * @param {string[]} words - The list of words to create rules for.
 * @returns {Rule[]} - An array of rules containing key-value pairs with fields and aliases.
 */
function keyValueRules($, words) {
  /**
   * @type {Rule[]}
   */
  const rules = [];

  // 1. For an ambiguous field `ScriptType` in `Script Info`
  rules.push(
    seq(
      field(
        "key_script_type",
        alias(
          choice(caseInsensitive("ScriptType"), caseInsensitive("Script Type")),
          $.key,
        ),
      ),
      ":",
      field("values_script_type", $.values),
    ),
  );

  // 2. For each words
  words.forEach((word) => {
    rules.push(
      seq(
        field(
          `key_${toLowerCaseUnderscored(word)}`,
          alias(caseInsensitive(word), $.key),
        ),
        ":",
        field(`values_${toLowerCaseUnderscored(word)}`, $.values),
      ),
    );
  });
  // words.forEach((word) =>
  //   console.log(`(value_${toLowerCaseUnderscored(word)}) @string`),
  // );

  // 3. For customed fields
  rules.push(
    prec(
      -1,
      seq(
        field("key_custom", alias(token(/[A-Za-z0-9 ]+/), $.key)),
        ":",
        field("values_custom", $.values),
      ),
    ),
  );

  return rules;
}

const typedFields = {
  layer: "integer", marked: "marked", start: "timestamp", end: "timestamp",
  event_style: "style_name", actor: "actor_name", margin_l: "integer", margin_r: "integer",
  margin_v: "integer", effect: "effect", style_name: "style_name", font_name: "font_name",
  font_size: "number", primary_colour: "color", secondary_colour: "color",
  tertiary_colour: "color", outline_colour: "color", back_colour: "color", bold: "integer",
  italic: "integer", underline: "integer", strikeout: "integer", scale_x: "number",
  scale_y: "number", spacing: "number", angle: "number", border_style: "integer",
  outline: "number", shadow: "number", alignment: "integer", alpha_level: "integer",
  encoding: "integer", margin_t: "integer", margin_b: "integer", relative_to: "integer",
  unknown: "field_string",
};

function tagName($, names) {
  return alias(token.immediate(prec(2, names.length === 1 ? names[0] : choice(...names))), $.tag_name);
}

function numberArguments($, count) {
  return seq($.number, ...Array.from({ length: count - 1 }, () => seq(",", $.number)));
}

module.exports = grammar({
  name: "ass",

  // Useless whitespace and BOM
  extras: ($) => [/[ \t\f\v]/, "\uFEFF"],

  externals: ($) => [
    $._section_start,
    $._events_section_name,
    $._event_format_key,
    $._event_dialogue_key,
    $._event_comment_key,
    $._event_separator,
    $._fonts_section_name,
    $._graphics_section_name,
    $._font_attachment_key,
    $._graphics_attachment_key,
    $.attachment_data,
    $._styles_section_name,
    $._style_key,
    $._script_type_key,
    $._event_picture_key,
    $._event_sound_key,
    $._event_movie_key,
    $._event_command_key,
    $._text_start,
    $._text_end,
    $._record_end,
    $.text,
    $.escape_sequence,
    $._override_start,
    $._override_end,
    $._drawing_mode_tag,
    $._clip_name,
    $._clip_end,
    $._transform_start,
    $._transform_end,
    $._draw_move,
    $._draw_move_open,
    $._draw_line,
    $._draw_bezier,
    $._draw_spline,
    $._draw_extend,
    $._draw_close,
    $._eof,
    ...Object.keys(typedFields).map((name) => $[`_field_${name}`]),
    $._error_sentinel,
  ],

  rules: {
    source_file: ($) => repeat(choice($._newline, seq($.comment, $._line_end), $.section)),

    _newline: ($) => token(/\r\n|\n|\r/),
    _line_end: ($) => choice($._newline, $._eof),

    section: ($) =>
      prec.right(seq(
        $.section_header,
        $._line_end,
        repeat(choice($._newline, seq(choice($.comment, $.key_value_pair, $.attachment_data), $._line_end))),
      )),

    // Section header
    section_header: ($) => seq(alias($._section_start, "["), $._section_name, token.immediate("]")),
    _section_name: ($) =>
      choice(
        ...sectionRules($, ["Script Info", "Events", "Fonts", "Graphics"]),
      ),

    // Comments are started with a semicolon
    comment: ($) =>
      token(
        seq(
          choice(
            ";",
            "!:", // Old version
          ),
          /[^\r\n]*/,
        ),
      ),

    // Key value pair
    key_value_pair: ($) =>
      choice(
        ...["picture", "sound", "movie", "command"].map((name) => seq(
          field(`key_${name}`, alias($[`_event_${name}_key`], $.key)), ":",
          field(`values_${name}`, alias($._record_values, $.values)),
        )),
        seq(
          field("key_script_type", alias($._script_type_key, $.key)),
          ":", field("values_script_type", $.values),
        ),
        seq(
          field("key_style", alias($._style_key, $.key)),
          ":", field("values_style", alias($._record_values, $.values)),
        ),
        seq(
          field("key_fontname", alias($._font_attachment_key, $.key)),
          ":",
          field("values_fontname", $.values),
        ),
        seq(
          field("key_filename", alias($._graphics_attachment_key, $.key)),
          ":",
          field("values_filename", $.values),
        ),
        seq(
          field("key_format", alias($._event_format_key, $.key)),
          ":",
          field("values_format", $.values),
        ),
        seq(
          field("key_dialogue", alias($._event_dialogue_key, $.key)),
          ":",
          field("values_dialogue", alias($._record_values, $.values)),
        ),
        seq(
          field("key_comment", alias($._event_comment_key, $.key)),
          ":",
          field("values_comment", alias($._record_values, $.values)),
        ),
        ...keyValueRules($, [
          // Script Info
          "Title",
          "Original Script",
          "Original Translation",
          "Original Editing",
          "Original Timing",
          "Synch Point",
          "Script Updated By",
          "Update Details",
          "Collisions",
          "PlayResY",
          "PlayResX",
          "PlayDepth",
          "Timer",
          "WrapStyle",
          // The following two are not mentioned in ASS Specs but in ASS Wiki
          "ScaledBorderAndShadow",
          "YCbCr Matrix",
          // v4 Styles & v4+ Styles
          "Format",
          "Style",
          // Events
          // Format has been defined above, so skip it
          "Dialogue",
          "Comment",
          "Picture",
          "Sound",
          "Movie",
          "Command",
          // Fonts
          "fontname",
          // Graphics
          "filename",
        ]),
      ),
    values: ($) => seq($.value, repeat(seq(",", $.value))),
    _record_values: ($) => seq(
      repeat(seq(alias($._typed_field, $.value), alias($._event_separator, ","))),
      choice(alias($._typed_field, $.value), alias($._text_value, $.value)),
      $._record_end,
    ),
    _typed_field: ($) => choice(...Object.entries(typedFields).map(([name, type]) =>
      seq($[`_field_${name}`], optional(field(name, $[type]))),
    )),
    timestamp: ($) => token.immediate(/[ \t]*\d+:[0-5]\d:[0-5]\d\.\d{2}[ \t]*/),
    integer: ($) => token(prec(1, /[-+]?\d+/)),
    number: ($) => token(prec(1, /[-+]?(?:\d+(?:\.\d*)?|\.\d+)/)),
    color: ($) => token(prec(1, /(?:&[hH][0-9a-fA-F]+&?|[-+]?\d+)/)),
    marked: ($) => seq(optional(seq(token(caseInsensitive("Marked")), "=")), $.integer),
    field_string: ($) => token.immediate(prec(-1, /[^,\r\n]+/)),
    style_name: ($) => $.field_string,
    actor_name: ($) => $.field_string,
    font_name: ($) => $.field_string,
    effect: ($) => choice($.banner_effect, $.scroll_effect, $.field_string),
    banner_effect: ($) => seq(token(prec(1, caseInsensitive("Banner"))), ";", $.number,
      optional(seq(";", $.integer, optional(seq(";", $.number))))),
    scroll_effect: ($) => seq(token(prec(1, choice(caseInsensitive("Scroll up"), caseInsensitive("Scroll down")))),
      ";", $.number, ";", $.number, ";", $.number, optional(seq(";", $.number))),

    _text_value: ($) => seq($._text_start,
      repeat(choice($.text, $.escape_sequence, $.override_block, $.drawing_command)), $._text_end),
    override_block: ($) => seq(alias($._override_start, "{"),
      repeat(choice($._override_tag, $.override_comment)), alias($._override_end, "}")),
    override_comment: ($) => token(prec(-1, /[^\\}\r\n]+/)),
    _override_tag: ($) => choice($.numeric_tag, $.color_tag, $.alpha_tag, $.font_tag, $.reset_tag,
      $.position_tag, $.move_tag, $.fade_tag, $.transform_tag, $.clip_tag, $.drawing_mode_tag, $.unknown_tag),
    numeric_tag: ($) => seq("\\", field("name", tagName($, [
      "b", "i", "u", "s", "bord", "xbord", "ybord", "shad", "xshad", "yshad",
      "be", "blur", "fs", "fscx", "fscy", "fsc", "fsp", "fr", "frx", "fry", "frz",
      "fax", "fay", "fe", "a", "an", "q", "k", "K", "kf", "ko", "kt", "pbo",
    ])), optional(field("argument", $.number))),
    color_tag: ($) => seq("\\", field("name", tagName($, ["c", "1c", "2c", "3c", "4c"])), optional($.override_color)),
    alpha_tag: ($) => seq("\\", field("name", tagName($, ["alpha", "1a", "2a", "3a", "4a"])), optional($.override_color)),
    override_color: ($) => token.immediate(prec(1, /&?[hH]?[0-9a-fA-F]+&?/)),
    font_tag: ($) => seq("\\", field("name", tagName($, ["fn"])), optional(field("font", $.tag_string))),
    reset_tag: ($) => seq("\\", field("name", tagName($, ["r"])), optional(field("style", $.tag_string))),
    tag_string: ($) => token.immediate(/[^\\}\r\n]+/),
    position_tag: ($) => seq("\\", field("name", tagName($, ["pos", "org"])), "(",
      field("x", $.number), ",", field("y", $.number), ")"),
    move_tag: ($) => seq("\\", field("name", tagName($, ["move"])), "(", numberArguments($, 4),
      optional(seq(",", numberArguments($, 2))), ")"),
    fade_tag: ($) => seq("\\", choice(
      seq(field("name", tagName($, ["fad"])), "(", numberArguments($, 2), ")"),
      seq(field("name", tagName($, ["fade"])), "(", numberArguments($, 7), ")"))),
    transform_tag: ($) => seq("\\", field("name", alias($._transform_start, $.tag_name)), "(",
      optional(choice(seq($.number, ","), seq(numberArguments($, 2), ","), seq(numberArguments($, 3), ","))),
      repeat1($._override_tag), alias($._transform_end, ")")),
    clip_tag: ($) => seq("\\", field("name", alias($._clip_name, $.tag_name)), "(",
      choice(numberArguments($, 4), seq(optional(seq($.number, ",")), repeat1($.drawing_command))),
      alias($._clip_end, ")")),
    drawing_mode_tag: ($) => seq("\\", field("name", alias($._drawing_mode_tag, $.tag_name)), optional($.integer)),
    unknown_tag: ($) => prec.right(seq("\\", field("name", alias(token.immediate(prec(-2, /[A-Za-z][A-Za-z0-9]*/)), $.tag_name)),
      optional($.unknown_tag_arguments))),
    unknown_tag_arguments: ($) => seq("(", repeat(choice(token(/[^()\\}\r\n]+/), $.unknown_tag_arguments, $._override_tag)), ")"),

    drawing_command: ($) => choice($.drawing_move, $.drawing_move_open, $.drawing_line,
      $.drawing_bezier, $.drawing_spline, $.drawing_extend, $.drawing_close),
    drawing_point: ($) => seq(field("x", $.number), field("y", $.number)),
    drawing_move: ($) => seq(alias($._draw_move, "drawing_command_name"), $.drawing_point),
    drawing_move_open: ($) => seq(alias($._draw_move_open, "drawing_command_name"), $.drawing_point),
    drawing_line: ($) => seq(alias($._draw_line, "drawing_command_name"), repeat1($.drawing_point)),
    drawing_bezier: ($) => seq(alias($._draw_bezier, "drawing_command_name"), repeat1(seq($.drawing_point, $.drawing_point, $.drawing_point))),
    drawing_spline: ($) => seq(alias($._draw_spline, "drawing_command_name"), $.drawing_point, $.drawing_point, repeat1($.drawing_point)),
    drawing_extend: ($) => seq(alias($._draw_extend, "drawing_command_name"), repeat1($.drawing_point)),
    drawing_close: ($) => alias($._draw_close, "drawing_command_name"),
    value: ($) => token(/[^,\r\n]*/),
  },
});
