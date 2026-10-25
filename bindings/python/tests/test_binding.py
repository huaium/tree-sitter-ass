from pathlib import Path
from unittest import TestCase

import tree_sitter
import tree_sitter_ass


class TestLanguage(TestCase):
    def setUp(self):
        self.language = tree_sitter.Language(tree_sitter_ass.language())
        self.parser = tree_sitter.Parser(self.language)

    def test_can_load_grammar(self):
        self.assertEqual(self.language.abi_version, 15)

    def test_parses_subtitle_variants(self):
        sources = [
            b"",
            b"[Script Info]\nTitle: Example\n",
            "\ufeff[script info]\r\n; comment\r\nTitle: 字幕 🎬\r\n".encode(),
            b"[V4 Styles]\nFormat: Name,Fontname\nStyle: Default,Arial\n",
            b"[V4+ Styles]\nFormat: Name,Fontname\nStyle: Default,Arial\n",
            b"[Custom Section]\nCustom Field: custom value\n",
            b"[Events]\nFormat: Layer,Start,End,Style,Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,Hello\n",
        ]
        for source in sources:
            with self.subTest(source=source):
                root = self.parser.parse(source).root_node
                self.assertFalse(root.has_error, str(root))
                self.assertEqual(root.end_byte, len(source))

    def test_reports_malformed_section(self):
        self.assertTrue(self.parser.parse(b"[Script Info").root_node.has_error)

    def test_dialogue_text_preserves_commas(self):
        source = b"[Events]\nFormat: Layer, Text\nDialogue:0,{\\pos(100,200)}Hello, world\n"
        root = self.parser.parse(source).root_node
        self.assertFalse(root.has_error)
        pair = root.named_children[0].named_children[-1]
        values = pair.child_by_field_name("values_dialogue")
        self.assertEqual(values.named_child_count, 2)
        self.assertEqual(values.named_children[-1].text, b"{\\pos(100,200)}Hello, world")

    def test_highlight_query(self):
        query_path = Path(__file__).resolve().parents[3] / "queries/highlights.scm"
        query = tree_sitter.Query(self.language, query_path.read_text())
        root = self.parser.parse(b"[Script Info]\nTitle: Example\n").root_node
        captures = tree_sitter.QueryCursor(query).captures(root)
        for name, text in [("type", b"Script Info"), ("property", b"Title"), ("string", b" Example")]:
            self.assertIn(text, [node.text for node in captures[name]])

    def test_embedded_attachments(self):
        for section, key in [("Fonts", "fontname"), ("Graphics", "filename")]:
            with self.subTest(section=section):
                source = f"[{section}]\n{key}: attachment\n!!!!\n[AAAA]".encode()
                root = self.parser.parse(source).root_node
                self.assertFalse(root.has_error, str(root))
                body = root.named_children[0].named_children[2:]
                self.assertEqual([node.type for node in body], ["attachment_data", "attachment_data"])
                self.assertEqual([node.text for node in body], [b"!!!!", b"[AAAA]"])

    def test_incremental_edit_matches_fresh_parse(self):
        source = b"[Script Info]\nTitle: Example\n"
        start = source.index(b"Example")
        updated = source.replace(b"Example", "字幕".encode())
        tree = self.parser.parse(source)
        tree.edit(start, start + 7, start + 6, (1, 7), (1, 14), (1, 13))
        incremental = self.parser.parse(updated, tree)
        fresh = self.parser.parse(updated)
        self.assertFalse(incremental.root_node.has_error)
        self.assertEqual(str(incremental.root_node), str(fresh.root_node))
        self.assertEqual(incremental.root_node.end_byte, len(updated))
