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
            "[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,Hello\n",
        ] {
            let tree = try XCTUnwrap(parser.parse(source))
            let root = try XCTUnwrap(tree.rootNode)
            XCTAssertFalse(root.hasError, source)
        }
        let malformed = try XCTUnwrap(parser.parse("[Script Info"))
        XCTAssertTrue(try XCTUnwrap(malformed.rootNode).hasError)
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
