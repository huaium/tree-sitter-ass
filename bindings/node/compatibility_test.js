const assert = require("node:assert/strict");
const { test } = require("node:test");
const Parser = require("tree-sitter");
const language = require(".");

function parse(source) {
  const parser = new Parser();
  parser.setLanguage(language);
  const root = parser.parse(source).rootNode;
  assert.equal(root.hasError, false, `${source}\n${root.toString()}`);
  assert.equal(root.endIndex, source.length);
  return root;
}

function event(text) {
  return `[Events]\nFormat: Start, End, Text\nDialogue:0:00:01.00,0:00:03.00,${text}\n`;
}

test("literal unmatched braces and libass escaped braces preserve text", () => {
  for (const text of ["Set {A", "Closing } brace", "A {literal {opening", "{\\b1}bold {literal"]) {
    const root = parse(event(text));
    assert.equal(root.descendantsOfType("values").at(-1).lastNamedChild.text, text);
  }
  const root = parse(event("Escaped \\{literal\\}, then {\\b1}bold"));
  assert.deepEqual(root.descendantsOfType("escape_sequence").map((node) => node.text), ["\\{", "\\}"]);
  assert.equal(root.descendantsOfType("override_block").length, 1);
});

test("all standard simple tags accept omitted style-default arguments", () => {
  const numeric = ["b", "i", "u", "s", "bord", "xbord", "ybord", "shad", "xshad", "yshad",
    "be", "blur", "fs", "fscx", "fscy", "fsc", "fsp", "fr", "frx", "fry", "frz",
    "fax", "fay", "fe", "a", "an", "q", "k", "K", "kf", "ko", "kt", "pbo"];
  for (const name of numeric) {
    for (const argument of ["", "1", "-1", "+1", "0.5"]) {
      const root = parse(event(`{\\${name}${argument}}Text`));
      assert.equal(root.descendantsOfType("numeric_tag").length, 1, name);
      assert.equal(root.descendantsOfType("unknown_tag").length, 0, name);
    }
  }
  for (const name of ["c", "1c", "2c", "3c", "4c", "alpha", "1a", "2a", "3a", "4a", "fn", "r", "p"]) {
    parse(event(`{\\${name}}Text`));
  }
});

test("complex tag signatures retain structured arguments", () => {
  const cases = {
    position_tag: ["\\pos(-10.5,20)", "\\org(640,360)"],
    move_tag: ["\\move(0,0,100,100)", "\\move(0,0,100,100,100,900)"],
    fade_tag: ["\\fad(100,200)", "\\fade(255,0,255,0,100,900,1000)"],
    transform_tag: ["\\t(\\fs30)", "\\t(2,\\fs30)", "\\t(0,500,\\fs30)",
      "\\t(0,500,0.5,\\fs30\\clip(0,0,100,100))"],
    clip_tag: ["\\clip(0,0,100,100)", "\\iclip(0,0,100,100)",
      "\\clip(m 0 0 l 100 0 100 100)", "\\iclip(2,m 0 0 b 1 2 3 4 5 6 7 8 9 10 11 12)"],
  };
  for (const [type, tags] of Object.entries(cases)) {
    for (const tag of tags) assert.ok(parse(event(`{${tag}}Text`)).descendantsOfType(type).length, tag);
  }
});

test("SSA and ASS defaults work without explicit style or event formats", () => {
  for (const [version, section, style, first] of [
    ["v4.00", "V4 Styles", "Default,Arial,24,16777215,255,0,0,-1,0,1,2,1,2,10,10,10,0,1", "Marked=0"],
    ["v4.00+", "V4+ Styles", "Default,Arial,24,&HFFFFFF,&HFF,&H0,&H0,0,0,0,0,100,100,0,0,1,2,1,2,10,10,10,1", "0"],
  ]) {
    const root = parse(`[Script Info]\nScriptType: ${version}\n[${section}]\nStyle:${style}\n` +
      `[Events]\nDialogue:${first},0:00:01.00,0:00:02.00,Default,,0,0,0,,Text, with commas\n`);
    assert.equal(root.descendantsOfType("timestamp").length, 2);
    assert.equal(root.descendantsOfType("font_name").length, 1);
  }
});

test("ASS2 defaults distinguish top and bottom margins and relative positioning", () => {
  const root = parse("[Script Info]\nScriptType: v4.00++\n[V4++ Styles]\n" +
    "Style:Default,Arial,24,&HFFFFFF,&HFF,&H0,&H0,0,0,0,0,100,100,0,0,1,2,1,2,10,20,30,40,1,1\n" +
    "[Events]\nDialogue:0,0:00:01.00,0:00:02.00,Default,,10,20,30,40,,Text, with commas\n");
  const styles = root.descendantsOfType("key_value_pair").find((node) => node.childForFieldName("key_style"));
  const values = styles.childForFieldName("values_style");
  assert.equal(values.namedChildCount, 25);
  assert.equal(values.namedChild(21).childForFieldName("margin_t").text, "30");
  assert.equal(values.namedChild(22).childForFieldName("margin_b").text, "40");
  assert.equal(values.namedChild(24).childForFieldName("relative_to").text, "1");
  const dialogue = root.descendantsOfType("key_value_pair").find((node) => node.childForFieldName("key_dialogue"));
  assert.equal(dialogue.childForFieldName("values_dialogue").namedChildCount, 11);
});

test("authoring metadata and extradata survive normal line-ending variants", () => {
  const source = "[Script Info]\n!: Release Date: 2026-10-25\nLayoutResX: 1920\nLayoutResY: 1080\n" +
    "Kerning: yes\nLanguage: en\n[Aegisub Extradata]\nData: 0,example.key,evalue\n" + event("{=0}Text");
  for (const newline of ["\n", "\r\n", "\r"]) {
    for (const ending of [true, false]) {
      parse("\uFEFF" + (ending ? source : source.trimEnd()).replaceAll("\n", newline));
    }
  }
});

test("every documented animatable tag parses inside each transform signature", () => {
  const tags = ["fs30", "fsp1.5", "fscx110", "fscy90", "frx10", "fry-10", "frz360", "fr90",
    "fax0.1", "fay-0.1", "bord2", "xbord2", "ybord2", "shad2", "xshad-2", "yshad2",
    "be1", "blur0.5", "c&HFFFFFF&", "1c&HFFFFFF&", "2c&HFFFFFF&", "3c&HFFFFFF&", "4c&HFFFFFF&",
    "alpha&H80&", "1a&H80&", "2a&H80&", "3a&H80&", "4a&H80&", "clip(0,0,10,10)", "iclip(0,0,10,10)"];
  for (const tag of tags) {
    for (const timing of ["", "2,", "0,500,", "0,500,0.5,"]) {
      assert.equal(parse(event(`{\\t(${timing}\\${tag})}Text`)).descendantsOfType("transform_tag").length, 1);
    }
  }
});

test("adding or removing a closing brace incrementally matches a fresh parse", () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const before = event("A {literal");
  const offset = before.length - 1;
  const lines = before.slice(0, offset).split("\n");
  const position = { row: lines.length - 1, column: lines.at(-1).length };
  const after = before.slice(0, offset) + "}" + before.slice(offset);
  const tree = parser.parse(before);
  tree.edit({ startIndex: offset, oldEndIndex: offset, newEndIndex: offset + 1,
    startPosition: position, oldEndPosition: position,
    newEndPosition: { ...position, column: position.column + 1 } });
  const edited = parser.parse(after, tree);
  assert.equal(edited.rootNode.hasError, false);
  assert.equal(edited.rootNode.toString(), parser.parse(after).rootNode.toString());
  assert.equal(edited.rootNode.descendantsOfType("override_block").length, 1);
  edited.edit({ startIndex: offset, oldEndIndex: offset + 1, newEndIndex: offset,
    startPosition: position, oldEndPosition: { ...position, column: position.column + 1 },
    newEndPosition: position });
  const restored = parser.parse(before, edited);
  assert.equal(restored.rootNode.hasError, false);
  assert.equal(restored.rootNode.toString(), parser.parse(before).rootNode.toString());
  assert.equal(restored.rootNode.descendantsOfType("override_block").length, 0);
});
