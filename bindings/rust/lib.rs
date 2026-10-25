//! This crate provides Ass language support for the [tree-sitter][] parsing library.
//!
//! Typically, you will use the [LANGUAGE][] constant to add this language to a
//! tree-sitter [Parser][], and then use the parser to parse some code:
//!
//! ```
//! let code = r#"
//! "#;
//! let mut parser = tree_sitter::Parser::new();
//! let language = tree_sitter_ass::LANGUAGE;
//! parser
//!     .set_language(&language.into())
//!     .expect("Error loading Ass parser");
//! let tree = parser.parse(code, None).unwrap();
//! assert!(!tree.root_node().has_error());
//! ```
//!
//! [Parser]: https://docs.rs/tree-sitter/*/tree_sitter/struct.Parser.html
//! [tree-sitter]: https://tree-sitter.github.io/

use tree_sitter_language::LanguageFn;

extern "C" {
    fn tree_sitter_ass() -> *const ();
}

/// The tree-sitter [`LanguageFn`][LanguageFn] for this grammar.
///
/// [LanguageFn]: https://docs.rs/tree-sitter-language/*/tree_sitter_language/struct.LanguageFn.html
pub const LANGUAGE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_ass) };

/// The content of the [`node-types.json`][] file for this grammar.
///
/// [`node-types.json`]: https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types
pub const NODE_TYPES: &str = include_str!("../../src/node-types.json");

// NOTE: uncomment these to include any queries that this grammar contains:

// pub const HIGHLIGHTS_QUERY: &str = include_str!("../../queries/highlights.scm");
// pub const INJECTIONS_QUERY: &str = include_str!("../../queries/injections.scm");
// pub const LOCALS_QUERY: &str = include_str!("../../queries/locals.scm");
// pub const TAGS_QUERY: &str = include_str!("../../queries/tags.scm");

#[cfg(test)]
mod tests {
    #[test]
    fn test_can_load_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE.into())
            .expect("Error loading Ass parser");
    }

    #[test]
    fn test_subtitle_variants_and_errors() {
        let mut parser = tree_sitter::Parser::new();
        parser.set_language(&super::LANGUAGE.into()).unwrap();
        for source in [
            "",
            "[Script Info]\nTitle: Example\n",
            "\u{feff}[script info]\r\n; comment\r\nTitle: 字幕 🎬\r\n",
            "[V4 Styles]\nFormat: Name,Fontname\nStyle: Default,Arial\n",
            "[V4+ Styles]\nFormat: Name,Fontname\nStyle: Default,Arial\n",
            "[Custom Section]\nCustom Field: custom value\n",
            "[Events]\nFormat: Layer,Start,End,Style,Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,Hello\n",
        ] {
            let tree = parser.parse(source, None).unwrap();
            assert!(!tree.root_node().has_error(), "{source:?}");
            assert_eq!(tree.root_node().end_byte(), source.len());
        }
        let malformed = parser.parse("[Script Info", None).unwrap();
        assert!(malformed.root_node().has_error());
    }

    #[test]
    fn test_highlight_query() {
        let language = super::LANGUAGE.into();
        let query = tree_sitter::Query::new(
            &language,
            include_str!("../../queries/highlights.scm"),
        ).unwrap();
        assert!(query.capture_names().contains(&"type"));
        assert!(query.capture_names().contains(&"property"));
        assert!(query.capture_names().contains(&"string"));
    }

    #[test]
    fn test_dialogue_text_preserves_commas() {
        let mut parser = tree_sitter::Parser::new();
        parser.set_language(&super::LANGUAGE.into()).unwrap();
        let source = "[Events]\nFormat: Layer, Text\nDialogue:0,{\\pos(100,200)}Hello, world\n";
        let tree = parser.parse(source, None).unwrap();
        let root = tree.root_node();
        assert!(!root.has_error());
        let pair = root.named_child(0).unwrap().named_child(2).unwrap();
        let values = pair.child_by_field_name("values_dialogue").unwrap();
        assert_eq!(values.named_child_count(), 2);
        assert_eq!(values.named_child(1).unwrap().utf8_text(source.as_bytes()).unwrap(),
                   "{\\pos(100,200)}Hello, world");
    }

    #[test]
    fn test_embedded_attachments() {
        let mut parser = tree_sitter::Parser::new();
        parser.set_language(&super::LANGUAGE.into()).unwrap();
        for source in [
            "[Fonts]\nfontname: font.ttf\n!!!!\n[AAAA]",
            "[Graphics]\nfilename: image.bmp\n!!!!\n[AAAA]",
        ] {
            let tree = parser.parse(source, None).unwrap();
            let root = tree.root_node();
            assert!(!root.has_error(), "{}", root.to_sexp());
            let section = root.named_child(0).unwrap();
            assert_eq!(section.named_child(2).unwrap().kind(), "attachment_data");
            assert_eq!(section.named_child(3).unwrap().utf8_text(source.as_bytes()).unwrap(), "[AAAA]");
        }
    }
}
