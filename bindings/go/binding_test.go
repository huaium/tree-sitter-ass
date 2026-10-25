package tree_sitter_ass_test

import (
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
		"[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,Hello\n",
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
