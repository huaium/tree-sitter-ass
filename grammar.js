/**
 * @file A tree-sitter parser for ass subtitles
 * @author Huaium <huaium233@gmail.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

module.exports = grammar({
  name: "ass",

  // Useless whitespace characters
  extras: ($) => [/\s/],

  rules: {
    source_file: ($) => repeat1($.section),

    section: ($) =>
      seq(
        $.section_header,
        optional(repeat1(choice($.comment, $.key_value_pair))),
      ),

    // Section header
    section_header: ($) => seq("[", $.section_name, "]"),
    section_name: ($) => token(/[^\]]+/),

    // Comments are started with a semicolon
    comment: ($) => token(seq(";", /[^\[\r\n]*/)),

    // Key value pair
    key_value_pair: ($) => seq($.key, ":", $.value),
    key: ($) => token(/[^:\[\r\n]+/),
    value: ($) => token(/[^\r\n]+/),
  },
});
