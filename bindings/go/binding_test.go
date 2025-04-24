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
