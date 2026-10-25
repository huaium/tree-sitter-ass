const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

const Parser = require("tree-sitter");

test("can load grammar", () => {
  const parser = new Parser();
  assert.doesNotThrow(() => parser.setLanguage(require(".")));
});

test("parses ASS sections, comments, and comma-separated dialogue", () => {
  const parser = new Parser();
  parser.setLanguage(require("."));
  const source = "\uFEFF[Script Info]\r\n; Subtitle metadata\r\nTitle: Example\r\n" +
    "[Events]\r\nDialogue: 0,0:00:01.00,0:00:02.00,Default,Hello world\r\n";
  const tree = parser.parse(source);
  assert.strictEqual(tree.rootNode.hasError, false);
  assert.strictEqual(tree.rootNode.namedChildCount, 2);
  assert.strictEqual(tree.rootNode.namedChild(1).type, "section");
  const values = tree.rootNode.descendantsOfType("values");
  assert.strictEqual(values[1].namedChildCount, 5);
  assert.strictEqual(values[1].lastNamedChild.text, "Hello world");
});

test("highlight query captures section names, keys, and values", () => {
  const language = require(".");
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Parser.Query(language, readFileSync(
    join(__dirname, "../../queries/highlights.scm"), "utf8",
  ));
  const captures = query.captures(parser.parse("[Script Info]\nTitle: Example\n").rootNode);
  for (const [name, text] of [["type", "Script Info"], ["property", "Title"], ["string", " Example"]]) {
    assert.ok(captures.some((capture) => capture.name === name && capture.node.text === text));
  }
});

test("parses SSA styles, custom fields, Unicode, and empty documents", () => {
  const parser = new Parser();
  parser.setLanguage(require("."));
  for (const source of [
    "",
    "[V4 Styles]\nFormat: Name,Fontname\nStyle: Default,Arial\n",
    "[V4+ Styles]\nFormat: Name,Fontname\nStyle: Default,Arial\n",
    "[Custom Section]\nCustom Field: custom value\n",
    "\uFEFF[script info]\r\nTitle: 字幕 🎬\r\n",
  ]) {
    const root = parser.parse(source).rootNode;
    assert.strictEqual(root.hasError, false, source);
    assert.strictEqual(root.endIndex, source.length);
  }
  assert.strictEqual(parser.parse("[Script Info").rootNode.hasError, true);
});

test("incremental Unicode edit matches a fresh parse", () => {
  const parser = new Parser();
  parser.setLanguage(require("."));
  const source = "[Script Info]\nTitle: Example\n";
  const tree = parser.parse(source);
  const startIndex = source.indexOf("Example");
  tree.edit({
    startIndex,
    oldEndIndex: startIndex + 7,
    newEndIndex: startIndex + 2,
    startPosition: { row: 1, column: 7 },
    oldEndPosition: { row: 1, column: 14 },
    newEndPosition: { row: 1, column: 9 },
  });
  const sourceUpdated = source.replace("Example", "字幕");
  const incremental = parser.parse(sourceUpdated, tree);
  const fresh = parser.parse(sourceUpdated);
  assert.strictEqual(incremental.rootNode.hasError, false);
  assert.strictEqual(incremental.rootNode.toString(), fresh.rootNode.toString());
  assert.strictEqual(incremental.rootNode.endIndex, sourceUpdated.length);
});
