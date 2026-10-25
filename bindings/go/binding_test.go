package tree_sitter_ass_test

import (
	"strings"
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_ass "github.com/huaium/tree-sitter-ass/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_ass.Language())
	if language == nil {
		t.Errorf("Error loading Ass grammar")
	}
}

func TestStructuredSubtitleSyntax(t *testing.T) {
	parser := tree_sitter.NewParser()
	defer parser.Close()
	if err := parser.SetLanguage(tree_sitter.NewLanguage(tree_sitter_ass.Language())); err != nil {
		t.Fatal(err)
	}
	source := []byte("[V4+ Styles]\nFormat: Name, Fontsize\nStyle:Default,20\n" +
		"[Events]\nFormat: Start, End, Text\n" +
		"Dialogue:0:00:01.00,0:00:02.00,{\\p1}m 0 0 l 10 10{\\p0}{\\t(0,500,\\fs30)}text\\Nnext\n")
	tree := parser.Parse(source, nil)
	if tree == nil {
		t.Fatal("Parser returned no tree")
	}
	defer tree.Close()
	root := tree.RootNode()
	if root.HasError() {
		t.Fatal(root.ToSexp())
	}
	syntax := root.ToSexp()
	if strings.Count(syntax, "(timestamp)") != 2 {
		t.Fatalf("Expected two typed timestamps: %s", syntax)
	}
	for _, node := range []string{"font_size: (number)", "(drawing_line", "(transform_tag", "(escape_sequence)"} {
		if !strings.Contains(syntax, node) {
			t.Fatalf("Missing %s: %s", node, syntax)
		}
	}
}

func TestDialogueTextPreservesCommas(t *testing.T) {
	parser := tree_sitter.NewParser()
	defer parser.Close()
	if err := parser.SetLanguage(tree_sitter.NewLanguage(tree_sitter_ass.Language())); err != nil {
		t.Fatal(err)
	}
	source := []byte("[Events]\nFormat: Layer, Text\nDialogue:0,{\\pos(100,200)}Hello, world\n")
	tree := parser.Parse(source, nil)
	if tree == nil {
		t.Fatal("Parser returned no tree")
	}
	defer tree.Close()
	root := tree.RootNode()
	if root.HasError() {
		t.Fatal(root.ToSexp())
	}
	values := root.NamedChild(0).NamedChild(2).ChildByFieldName("values_dialogue")
	if values.NamedChildCount() != 2 {
		t.Fatalf("Expected two fields, got %d", values.NamedChildCount())
	}
	if text := values.NamedChild(1).Utf8Text(source); text != "{\\pos(100,200)}Hello, world" {
		t.Fatalf("Unexpected Text field: %q", text)
	}
}

func TestSubtitleVariantsAndErrors(t *testing.T) {
	parser := tree_sitter.NewParser()
	defer parser.Close()
	if err := parser.SetLanguage(tree_sitter.NewLanguage(tree_sitter_ass.Language())); err != nil {
		t.Fatal(err)
	}
	for _, source := range []string{
		"",
		"[Script Info]\nTitle: Example\n",
		"\uFEFF[script info]\r\n; comment\r\nTitle: 字幕 🎬\r\n",
		"[V4 Styles]\nFormat: Name,Fontname\nStyle: Default,Arial\n",
		"[V4+ Styles]\nFormat: Name,Fontname\nStyle: Default,Arial\n",
		"[Custom Section]\nCustom Field: custom value\n",
		"[Events]\nFormat: Layer,Start,End,Style,Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,Hello\n",
	} {
		t.Run(source, func(t *testing.T) {
			tree := parser.Parse([]byte(source), nil)
			if tree == nil {
				t.Fatal("Parser returned no tree")
			}
			defer tree.Close()
			root := tree.RootNode()
			if root.HasError() {
				t.Fatalf("Unexpected parse error: %s", root.ToSexp())
			}
			if root.EndByte() != uint(len(source)) {
				t.Fatal("Parser did not consume the full input")
			}
		})
	}
	tree := parser.Parse([]byte("[Script Info"), nil)
	if tree == nil {
		t.Fatal("Parser returned no tree for malformed input")
	}
	defer tree.Close()
	if !tree.RootNode().HasError() {
		t.Fatal("Missing section bracket should produce a parse error")
	}
}
