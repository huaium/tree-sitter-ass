const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { execFileSync } = require("node:child_process");
const { test } = require("node:test");
const Parser = require("tree-sitter");
const language = require(".");
const query = new Parser.Query(language, readFileSync(join(__dirname, "../../queries/highlights.scm"), "utf8"));

function parse(source) {
  const parser = new Parser();
  parser.setLanguage(language);
  const root = parser.parse(source).rootNode;
  assert.equal(root.hasError, false, root.toString());
  return root;
}

function columns(root) {
  let document = root;
  while (document.parent) document = document.parent;
  return query.captures(document).filter(({ name, node }) => name.startsWith("string.ass.column.") &&
    node.startIndex >= root.startIndex && node.endIndex <= root.endIndex);
}

test("rainbow columns repeat beyond two cycles and preserve empty fields", () => {
  for (const count of [1, 5, 6, 7, 12, 13, 29, 80]) {
    const names = Array.from({ length: count }, (_, index) => `Custom${index}`);
    const values = names.map((_, index) => index % 3 === 0 ? "" : `value${index}`);
    const root = parse(`[V4+ Styles]\nFormat:${names.join(",")}\nStyle:${values.join(",")}\n`);
    for (const record of root.descendantsOfType("key_value_pair")) {
      const fields = record.lastNamedChild.namedChildren;
      const captures = columns(record);
      assert.equal(captures.length, count);
      fields.forEach((field, index) => {
        assert.equal(captures[index].name, `string.ass.column.${index % 6 + 1}`);
        assert.equal(captures[index].node.id, field.id);
        assert.equal(record.lastNamedChild.fieldNameForNamedChild(index), `column_${index % 6 + 1}`);
      });
    }
    assert.equal(query.didExceedMatchLimit(), false);
  }
});

test("reordered event fields share Format colors and exclude Text", () => {
  for (const key of ["Dialogue", "Picture", "Sound", "Movie", "Command"]) {
    const root = parse(`[Events]\nFormat:End,Start,Layer,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n` +
      `${key}:0:00:02.00,0:00:01.00,0,Default,,0,0,0,,{\\t(0,500,\\fs30)\\clip(m 0 0 l 10 10)}Hello, world\\Nnext\n`);
    const [format, event] = root.descendantsOfType("key_value_pair");
    assert.deepEqual(columns(event).map(({ name }) => name), columns(format).slice(0, -1).map(({ name }) => name));
    const text = event.lastNamedChild.lastNamedChild;
    assert.ok(!columns(event).some(({ node }) => node.startIndex >= text.startIndex));
    const captures = query.captures(text);
    for (const name of ["string", "number", "function.builtin", "string.escape", "punctuation.bracket"]) {
      assert.ok(captures.some((capture) => capture.name === name), name);
    }
    assert.equal(text.descendantsOfType("text")[0].text, "Hello, world");
  }
});

test("default ASS SSA and ASS2 layouts receive repeating column fields", () => {
  for (const filename of ["full.ass", "legacy.ssa", "ass2.ass", "custom_formats.ass"]) {
    const root = parse(readFileSync(join(__dirname, "../../test", filename), "utf8"));
    for (const record of root.descendantsOfType("key_value_pair")) {
      const isStyle = record.childForFieldName("values_style");
      const values = isStyle || record.childForFieldName("values_dialogue");
      if (!values) continue;
      assert.equal(columns(record).length, values.namedChildCount - (isStyle ? 0 : 1));
    }
  }
});

test("Comment events override scalar highlights without rainbow captures", () => {
  const root = parse("[Events]\nFormat:Layer,Start,End,Text\nComment:0,0:00:01.00,0:00:02.00,{\\pos($x,$y)}template, text\n");
  const record = root.descendantsOfType("key_value_pair").at(-1);
  assert.deepEqual(columns(record), []);
  const match = query.matches(root).find(({ captures }) => captures.some(({ name, node }) => name === "comment" && node.id === record.id));
  assert.ok(match);
  assert.equal(match.setProperties.priority, "120");
});

test("Script Info and attachments retain their ordinary string highlights", () => {
  const root = parse("[Script Info]\nTitle:Example, title\nFormat:Example, title\nStyle:Example, title\n[Fonts]\nfontname:example.ttf\n!!!!\n");
  assert.deepEqual(columns(root), []);
  assert.ok(query.captures(root).some(({ name, node }) => name === "string" && node.text === "!!!!"));
});

test("inserting a column incrementally updates following rainbow fields", () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const source = "[V4+ Styles]\nFormat:Name,Custom1,Custom2\nStyle:Default,Arial\n";
  const tree = parser.parse(source);
  const startIndex = source.indexOf("Arial");
  tree.edit({
    startIndex, oldEndIndex: startIndex, newEndIndex: startIndex + 1,
    startPosition: { row: 2, column: 14 },
    oldEndPosition: { row: 2, column: 14 },
    newEndPosition: { row: 2, column: 15 },
  });
  const updated = source.slice(0, startIndex) + "," + source.slice(startIndex);
  const incremental = parser.parse(updated, tree).rootNode;
  const fresh = parser.parse(updated).rootNode;
  assert.equal(incremental.hasError, false);
  const captureRanges = (root) => columns(root).map(({ name, node }) => [name, node.startIndex, node.endIndex]);
  assert.deepEqual(captureRanges(incremental), captureRanges(fresh));
  assert.equal(columns(incremental).at(-1).name, "string.ass.column.3");
});

test("real HTML highlighter falls back to string colors without a rainbow theme", () => {
  const directory = mkdtempSync(join(tmpdir(), "ass-highlight-fallback-"));
  try {
    const config = join(directory, "config.json");
    const sample = join(directory, "sample.ass");
    writeFileSync(config, JSON.stringify({ "parser-directories": [], theme: { string: "#98c379" } }));
    writeFileSync(sample, "[V4+ Styles]\nFormat:Name,Fontname\nStyle:Default,Arial\n" +
      "[Events]\nFormat:Style,Text\nDialogue:Default,Hello, world\n");
    const html = execFileSync(process.execPath, [
      require.resolve("tree-sitter-cli/cli.js"), "highlight",
      "--grammar-path", join(__dirname, "../.."), "--config-path", config,
      "--html", "--style", "minimal", "--layout", "fragment", sample,
    ], { encoding: "utf8", env: { ...process.env, XDG_CACHE_HOME: directory } });
    for (const text of ["Name", "Fontname", "Default", "Arial"]) {
      assert.ok(html.includes(`<span class='string'>${text}</span>`), text);
    }
    assert.ok(html.includes("Hello, world"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
