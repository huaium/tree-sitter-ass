const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const Parser = require("tree-sitter");
const language = require(".");

function parser() {
  const result = new Parser();
  result.setLanguage(language);
  return result;
}

function parse(source) {
  const tree = parser().parse(source);
  assert.equal(tree.rootNode.hasError, false, `${source}\n${tree.rootNode.toString()}`);
  return tree.rootNode;
}

function dialogue(text) {
  return `[Events]\nFormat: Layer, Text\nDialogue:0,${text}\n`;
}

test("event fields retain their declared names and types after reordering", () => {
  const root = parse("[Events]\nFormat: Name, End, Start, Layer, Style, MarginL, MarginR, MarginV, Effect, Text\n" +
    "Dialogue:Actor,0:00:02.34,0:00:01.23,2,Default,0010,0020,0030,Banner;10;1;20,Hello\n");
  const values = root.descendantsOfType("values").at(-1);
  assert.equal(values.namedChildCount, 10);
  assert.equal(values.namedChild(0).childForFieldName("actor").type, "actor_name");
  assert.equal(values.namedChild(1).childForFieldName("end").type, "timestamp");
  assert.equal(values.namedChild(2).childForFieldName("start").text, "0:00:01.23");
  assert.equal(values.namedChild(3).childForFieldName("layer").type, "integer");
  assert.equal(values.namedChild(4).childForFieldName("event_style").type, "style_name");
  assert.equal(root.descendantsOfType("banner_effect").length, 1);
});

test("ASS and SSA styles expose numeric, color, and font fields", () => {
  const ass = parse("[V4+ Styles]\nStyle:Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,1,0,100,100,0.5,-10,1,2,3,2,10,20,30,1\n");
  const values = ass.descendantsOfType("values")[0];
  assert.equal(values.namedChildCount, 23);
  assert.equal(values.namedChild(1).childForFieldName("font_name").type, "font_name");
  assert.equal(values.namedChild(2).childForFieldName("font_size").type, "number");
  assert.equal(values.namedChild(3).childForFieldName("primary_colour").type, "color");
  assert.equal(values.namedChild(7).childForFieldName("bold").text, "-1");
  const ssa = parse("[Script Info]\nScriptType: v4.00\n[V4 Styles]\n" +
    "Style:Default,Arial,20,16777215,255,0,0,-1,0,1,2,3,2,10,20,30,0,1\n" +
    "[Events]\nDialogue:Marked=0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Legacy\n");
  const style = ssa.descendantsOfType("key_value_pair").find((node) => node.childForFieldName("key_style"));
  assert.equal(style.lastNamedChild.namedChildCount, 18);
  assert.equal(style.lastNamedChild.namedChild(5).childForFieldName("tertiary_colour").type, "color");
  assert.equal(ssa.descendantsOfType("marked")[0].text, "Marked=0");
});

test("custom style formats retain individual fields and unknown columns", () => {
  const root = parse("[V4+ Styles]\nFormat: Fontsize, Name, PrimaryColour, Fontname, Bold, Extra\nStyle:20.5,Default,&HFFFFFF,Arial,-1,custom\n");
  const values = root.descendantsOfType("values").at(-1);
  assert.equal(values.namedChild(0).childForFieldName("font_size").text, "20.5");
  assert.equal(values.namedChild(1).childForFieldName("style_name").text, "Default");
  assert.equal(values.namedChild(5).childForFieldName("unknown").text, "custom");
});

test("standard numeric tags, colors, font names, and resets are structured", () => {
  const names = ["b", "i", "u", "s", "bord", "xbord", "ybord", "shad", "xshad", "yshad", "be", "blur",
    "fs", "fscx", "fscy", "fsp", "fr", "frx", "fry", "frz", "fax", "fay", "fe", "a", "an", "q", "k", "K", "kf", "ko", "kt", "pbo"];
  const root = parse(dialogue("{" + names.map((name) => `\\${name}1`).join("") +
    "\\1c&H123ABC&\\2c&HFF&\\3c&H0&\\4c\\c&HFFFFFF&\\alpha&H80&\\1a&H20&\\2a&H30&\\3a&H40&\\4a&H50&\\fnTimes New Roman\\rDefault}字幕"));
  assert.equal(root.descendantsOfType("numeric_tag").length, names.length);
  assert.equal(root.descendantsOfType("color_tag").length, 5);
  assert.equal(root.descendantsOfType("alpha_tag").length, 5);
  assert.equal(root.descendantsOfType("font_tag")[0].childForFieldName("font").text, "Times New Roman");
  assert.equal(root.descendantsOfType("reset_tag")[0].childForFieldName("style").text, "Default");
});

test("complex tags parse positions, movement, fades, and all transform forms", () => {
  const tags = ["\\pos(100,200)", "\\org(-10,20)", "\\move(0,0,100,100)", "\\move(0,0,100,100,0,500)",
    "\\fad(100,200)", "\\fade(255,0,255,0,100,900,1000)", "\\t(\\fs30)", "\\t(2,\\fs30)",
    "\\t(0,500,\\fs30\\1c&HFFFFFF&)", "\\t(0,500,2,\\fs30)", "\\t(0,500,\\clip(0,0,10,10))"];
  for (const tag of tags) {
    const root = parse(dialogue(`{${tag}}Hello`));
    assert.equal(root.descendantsOfType("override_block").length, 1);
    assert.ok(root.descendantsOfType("tag_name").length > 0);
  }
});

test("vector clips and drawing mode expose all drawing commands", () => {
  const drawing = "m 0 0 n 1 1 l 10 0 10 10 b 1 2 3 4 5 6 s 1 1 2 2 3 3 p 4 4 c";
  for (const text of [`{\\p1}${drawing}{\\p0}Text`, `{\\clip(${drawing})}Text`, `{\\iclip(2,${drawing})}Text`]) {
    const root = parse(dialogue(text));
    for (const type of ["drawing_move", "drawing_move_open", "drawing_line", "drawing_bezier", "drawing_spline", "drawing_extend", "drawing_close"]) {
      assert.equal(root.descendantsOfType(type).length, 1, type);
    }
    assert.equal(root.descendantsOfType("text").at(-1).text, "Text");
  }
  assert.equal(parse(dialogue("m 0 0 l 10 10")).descendantsOfType("drawing_command").length, 0);
});

test("dialogue text preserves whitespace, Unicode, escapes, and override comments", () => {
  const text = "  字幕 🎬\\Nnew\\nsoft\\hspace{inline comment}{\\zzunknown(1,(2,3))} end  ";
  const root = parse(dialogue(text));
  assert.deepEqual(root.descendantsOfType("escape_sequence").map((node) => node.text), ["\\N", "\\n", "\\h"]);
  assert.equal(root.descendantsOfType("override_comment")[0].text, "inline comment");
  assert.equal(root.descendantsOfType("unknown_tag").length, 1);
  assert.equal(root.descendantsOfType("values").at(-1).lastNamedChild.text, text);
});

test("malformed timestamps, tag parameters, and drawings produce errors", () => {
  for (const text of ["{\\pos(1,2,3)}x", "{\\move(1,2,3)}x", "{\\p1}m 0{\\p0}", "{\\b1unclosed"]) {
    const root = parser().parse(dialogue(text)).rootNode;
    assert.equal(root.hasError, true, text);
  }
  const badTime = "[Events]\nFormat: Start, End, Text\nDialogue:0:99:00.00,0:00:02.00,x\n";
  assert.equal(parser().parse(badTime).rootNode.hasError, true);
});

test("malformed records recover at the next event line", () => {
  for (const bad of ["0,bad,0:00:02.00,text", "0,0:00:01.00,0:00:02.00,{\\b1unclosed", "0,0:00:01.00,0:00:02.00,{\\pos(1,2,3)}x"]) {
    const source = "[Events]\nFormat: Layer, Start, End, Text\nDialogue:" + bad +
      "\nDialogue:1,0:00:03.00,0:00:04.00,good\n";
    const root = parser().parse(source).rootNode;
    assert.equal(root.hasError, true);
    const good = root.descendantsOfType("key_value_pair").find((node) =>
      node.childForFieldName("values_dialogue")?.lastNamedChild.text === "good");
    assert.ok(good, root.toString());
    assert.equal(good.childForFieldName("values_dialogue").namedChild(1).childForFieldName("start").type, "timestamp");
  }
});

test("all legacy event record types retain typed fields", () => {
  for (const key of ["Dialogue", "Comment", "Picture", "Sound", "Movie", "Command"]) {
    const root = parse(`[Events]\nFormat: Start, End, Text\n${key}:0:00:01.00,0:00:02.00,content,with,commas\n`);
    assert.equal(root.descendantsOfType("timestamp").length, 2);
    assert.equal(root.descendantsOfType("values").at(-1).lastNamedChild.text, "content,with,commas");
  }
});

test("numeric field whitespace and nested transform state do not change text mode", () => {
  parse("[V4+ Styles]\nFormat: Fontsize, Name, Bold\nStyle: 20 , Default , -1  \n");
  const root = parse(dialogue("{\\t(0,100,\\t(2,\\fs30)\\p1)}m 0 0"));
  assert.equal(root.descendantsOfType("transform_tag").length, 2);
  assert.equal(root.descendantsOfType("drawing_command").length, 0);
  assert.equal(root.descendantsOfType("text").at(-1).text, "m 0 0");
});

test("drawing state survives override blocks and resets for each event", () => {
  const root = parse(dialogue("{\\p1}m 0 0{\\c&HFF&}l 10 10{\\p0}end") + "Dialogue:0,m 1 2\n");
  assert.equal(root.descendantsOfType("drawing_move").length, 1);
  assert.equal(root.descendantsOfType("drawing_line").length, 1);
  assert.equal(root.descendantsOfType("text").at(-1).text, "m 1 2");
});

test("incremental drawing-mode edits match a fresh parse", () => {
  const instance = parser();
  const before = dialogue("{\\p1}m 0 0 l 10 10");
  const tree = instance.parse(before);
  const offset = before.indexOf("p1") + 1;
  const prefix = before.slice(0, offset).split("\n");
  const point = { row: prefix.length - 1, column: prefix.at(-1).length };
  tree.edit({ startIndex: offset, oldEndIndex: offset + 1, newEndIndex: offset + 1,
    startPosition: point, oldEndPosition: { ...point, column: point.column + 1 }, newEndPosition: { ...point, column: point.column + 1 } });
  const after = before.replace("p1", "p0");
  const incremental = instance.parse(after, tree);
  const fresh = instance.parse(after);
  assert.equal(incremental.rootNode.hasError, false);
  assert.equal(incremental.rootNode.toString(), fresh.rootNode.toString());
  assert.equal(incremental.rootNode.descendantsOfType("drawing_command").length, 0);
});

test("drawing mode without an argument returns to text", () => {
  const root = parse(dialogue("{\\p1}m 0 0{\\p}ordinary text"));
  assert.equal(root.descendantsOfType("drawing_move").length, 1);
  assert.equal(root.descendantsOfType("text").at(-1).text, "ordinary text");
});

test("subtitle samples retain representative structured syntax", () => {
  const expected = {
    "full.ass": ["timestamp", "font_name", "numeric_tag", "color_tag", "alpha_tag",
      "font_tag", "reset_tag", "position_tag", "move_tag", "fade_tag", "transform_tag",
      "clip_tag", "drawing_move", "drawing_move_open", "drawing_line", "drawing_bezier",
      "drawing_spline", "drawing_extend", "drawing_close", "escape_sequence", "unknown_tag",
      "banner_effect", "scroll_effect", "attachment_data"],
    "script_info_only.ass": ["section", "key_value_pair"],
    "legacy.ssa": ["marked", "timestamp", "color"],
    "custom_formats.ass": ["timestamp", "position_tag", "font_name"],
  };
  for (const [file, types] of Object.entries(expected)) {
    const source = readFileSync(join(__dirname, "../../test", file), "utf8");
    assert.doesNotMatch(source, /\p{Script=Han}/u, file);
    const root = parse(source);
    for (const type of types) {
      assert.ok(root.descendantsOfType(type).length > 0, `${file}: missing ${type}`);
    }
  }
});
