import XCTest
import SwiftTreeSitter
import TreeSitterAss

final class TreeSitterAssTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_ass())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Ass grammar")
    }

    func testStructuredSubtitleSyntax() throws {
        let language = Language(language: tree_sitter_ass())
        let parser = Parser()
        try parser.setLanguage(language)
        let source = "[V4+ Styles]\nFormat: Name, Fontsize\nStyle:Default,20\n" +
            "[Events]\nFormat: Start, End, Text\n" +
            "Dialogue:0:00:01.00,0:00:02.00,{\\p1}m 0 0 l 10 10{\\p0}{\\t(0,500,\\fs30)}text\\Nnext\n"
        let tree = try XCTUnwrap(parser.parse(source))
        XCTAssertFalse(try XCTUnwrap(tree.rootNode).hasError)
        let query = try Query(language: language, data: Data(
            ("(timestamp) @time (value font_size: (number)) @size " +
             "(drawing_line) @drawing (transform_tag) @transform (escape_sequence) @escape").utf8
        ))
        let captures = query.execute(in: tree).flatMap { $0.captures }
        XCTAssertEqual(captures.filter { $0.name == "time" }.count, 2)
        for name in ["size", "drawing", "transform", "escape"] {
            XCTAssertEqual(captures.filter { $0.name == name }.count, 1, name)
        }
    }

    func testSubtitleVariantsAndErrors() throws {
        let parser = Parser()
        try parser.setLanguage(Language(language: tree_sitter_ass()))
        for source in [
            "",
            "[Script Info]\nTitle: Example\n",
            "\u{FEFF}[script info]\r\n; comment\r\nTitle: 字幕 🎬\r\n",
            "[V4 Styles]\nFormat: Name,Fontname\nStyle: Default,Arial\n",
            "[V4+ Styles]\nFormat: Name,Fontname\nStyle: Default,Arial\n",
            "[Custom Section]\nCustom Field: custom value\n",
            "[Events]\nFormat: Layer,Start,End,Style,Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,Hello\n",
        ] {
            let tree = try XCTUnwrap(parser.parse(source))
            let root = try XCTUnwrap(tree.rootNode)
            XCTAssertFalse(root.hasError, source)
        }
        let malformed = try XCTUnwrap(parser.parse("[Script Info"))
        XCTAssertTrue(try XCTUnwrap(malformed.rootNode).hasError)
    }

    func testDialogueTextPreservesCommas() throws {
        let parser = Parser()
        try parser.setLanguage(Language(language: tree_sitter_ass()))
        let tree = try XCTUnwrap(parser.parse("[Events]\nFormat: Layer, Text\nDialogue:0,{\\pos(100,200)}Hello, world\n"))
        let root = try XCTUnwrap(tree.rootNode)
        XCTAssertFalse(root.hasError)
        let query = try Query(language: Language(language: tree_sitter_ass()), data: Data(
            "(key_value_pair values_dialogue: (values (value) @field))".utf8
        ))
        let captures = query.execute(in: tree).flatMap { $0.captures }
        XCTAssertEqual(captures.count, 2)
    }

    func testHighlightQuery() throws {
        let language = Language(language: tree_sitter_ass())
        let parser = Parser()
        try parser.setLanguage(language)
        let project = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let query = try Query(language: language, url: project.appendingPathComponent("queries/highlights.scm"))
        let tree = try XCTUnwrap(parser.parse("[Script Info]\nTitle: Example\n"))
        let captures = query.execute(in: tree).flatMap { $0.captures }
        for name in ["type", "property", "string"] {
            XCTAssertTrue(captures.contains { $0.name == name }, name)
        }
    }
}
