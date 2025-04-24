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
}
