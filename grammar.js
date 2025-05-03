/**
 * @file A tree-sitter parser for ass subtitles
 * @author Huaium <huaium233@gmail.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

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
 * Generates alias rules for a given set of words and prefix.
 *
 * @param {Object} $ - The grammar context.
 * @param {string[]} words - The list of words to create aliases for.
 * @param {string} prefix - The prefix to prepend to each word for the alias.
 * @returns {Array} - An array of aliases for the given words.
 */
function aliasRules($, words, prefix) {
  return words.map((word) =>
    alias(caseInsensitive(word), $[`${prefix}_${word.toLowerCase()}`]),
  );
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
    section_header: ($) => seq("[", $.section_name, "]"),
    section_name: ($) =>
      choice(
        alias(
          choice(caseInsensitive("v4 Styles"), caseInsensitive("v4+ Styles")),
          $.section_name_styles,
        ), // v4 Styles for old version
        ...aliasRules(
          $,
          ["Script Info", "Events", "Fonts", "Graphics"],
          "section_name",
        ),
        prec(-1, alias(token(/[^\]]+/), $.section_name_custom)),
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
    key_value_pair: ($) => seq($.key, ":", $.value),
    key: ($) =>
      choice(
        alias(
          choice(caseInsensitive("ScriptType"), caseInsensitive("Script Type")),
          $.key_script_type,
        ), // An ambiguous field in Script Info
        ...aliasRules(
          $,
          [
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
          ],
          "key",
        ),
        prec(-1, alias(token(/[A-Za-z0-9 ]+/), $.key_custom)),
      ),
    value: ($) => token(/[^\r\n]+/),
  },
});
