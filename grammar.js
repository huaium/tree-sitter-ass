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
        char === " " ? "\\s+" : `[${char.toLowerCase()}${char.toUpperCase()}]`,
      )
      .join(""),
  );
}

/**
 * Generates rules with aliases for a given set of words.
 *
 * @param {GrammarSymbols<any>} $ - The grammar context.
 * @param {string[]} words - The list of words to create alias rules for.
 * @param {string} prefix - The prefix to prepend to each rule name.
 * @returns {Rule[]} - An array of alias rules where each word is mapped to a case-insensitive alias with the specified prefix.
 */
function aliasRules($, words, prefix) {
  // TODO: error processing
  return words.map((word) =>
    alias(caseInsensitive(word), $[`${prefix}_${word.toLowerCase()}`]),
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
  let rules = [];

  // 1. For legacy `v4 Styles`
  rules.push(
    field(
      "section_name_styles",
      alias(
        choice(caseInsensitive("v4 Styles"), caseInsensitive("v4+ Styles")),
        $.section_name,
      ),
    ),
  );

  // 2. For each words
  words.forEach((word) =>
    rules.push(
      field(
        `section_name_${toLowerCaseUnderscored(word)}`,
        alias(caseInsensitive(word), $.section_name),
      ),
    ),
  );

  // 3. For customed sections
  rules.push(
    prec(
      -1,
      field("section_name_custom", alias(token(/[^\]]+/), $.section_name)),
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
  let rules = [];
  let value_token = token(/[^\r\n]+/);

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
      field("value_script_type", alias(value_token, $.value_script_type)),
    ),
  );

  // 2. For each words
  words.forEach((word) => {
    /**
     * @type {Rule}
     */
    let valueRule = alias(
      value_token,
      $[`value_${toLowerCaseUnderscored(word)}`],
    );

    switch (word) {
      case "Collisions":
        valueRule = $.value_collisions;
        break;
      case "WrapStyle":
        valueRule = $.value_wrapstyle;
        break;
      case "ScaledBorderAndShadow":
        valueRule = $.value_scaledborderandshadow;
        break;
      case "YCbCr Matrix":
        valueRule = $.value_ycbcr_matrix;
        break;
    }

    rules.push(
      seq(
        field(
          `key_${toLowerCaseUnderscored(word)}`,
          alias(caseInsensitive(word), $.key),
        ),
        ":",
        field(`value_${toLowerCaseUnderscored(word)}`, valueRule),
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
        field("value_custom", alias(value_token, $.value_custom)),
      ),
    ),
  );

  return rules;
}

module.exports = grammar({
  name: "ass",

  // Useless whitespace and BOM
  extras: ($) => [/\s/, "\uFEFF"],

  rules: {
    source_file: ($) => repeat($.section),

    section: ($) =>
      seq(
        $.section_header,
        optional(repeat1(choice($.comment, $.key_value_pair))),
      ),

    // Section header
    section_header: ($) => seq("[", $._section_name, "]"),
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
          /[^\[\r\n]*/,
        ),
      ),

    // Key value pair
    key_value_pair: ($) =>
      choice(
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

    // Options for `Collisions` of `Script Info`
    value_collisions: ($) =>
      choice(...aliasRules($, ["normal", "reverse"], "collisions")),

    // Options for `WrapStyle` of `Script Info`
    value_wrapstyle: ($) =>
      choice(...aliasRules($, ["0", "1", "2", "3"], "wrapstyle")),

    // Options for `ScaledBorderAndShadow` of `Script Info`
    value_scaledborderandshadow: ($) =>
      choice(...aliasRules($, ["no", "yes"], "scaledborderandshadow")),

    // Options for `YCbCr Matrix` of `Script Info`
    value_ycbcr_matrix: ($) =>
      choice(
        seq($.ycbcr_matrix_range, ".", $.ycbcr_matrix_color_space),
        $.ycbcr_matrix_none,
      ),
    ycbcr_matrix_none: ($) => caseInsensitive("None"),
    ycbcr_matrix_range: ($) =>
      choice(...aliasRules($, ["tv", "pc"], "ycbcr_matrix_range")),
    ycbcr_matrix_color_space: ($) =>
      choice(
        ...aliasRules(
          $,
          ["601", "709", "240m", "fcc"],
          "ycbcr_matrix_color_space",
        ),
      ),
  },
});
