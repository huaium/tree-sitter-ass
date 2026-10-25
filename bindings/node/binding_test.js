const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

const Parser = require("tree-sitter");

test("can load grammar", () => {
  const parser = new Parser();
  assert.doesNotThrow(() => parser.setLanguage(require(".")));
});

test("font and graphics attachment bodies preserve encoded lines", () => {
  const parser = new Parser();
  const language = require(".");
  parser.setLanguage(language);
  const query = new Parser.Query(language, readFileSync(
    join(__dirname, "../../queries/highlights.scm"), "utf8",
  ));
  const encoded = Array.from({ length: 64 }, (_, index) => String.fromCharCode(index + 33)).join("");
  const lines = [encoded, "[!!!!", "[AAAA]", "[!!!]!!!!", "]!!!!", ";!!!!", "!:!!!!", "AB:CD,EF", "!".repeat(80)];
  for (const [section, key, extension] of [["Fonts", "fontname", "ttf"], ["Graphics", "filename", "bmp"]]) {
    for (const newline of ["\n", "\r\n", "\r"]) {
      const source = [
        `[${section}]`, `${key}: first.${extension}`, ...lines,
        `${key.toUpperCase()}: SECOND.${extension.toUpperCase()}`, "!!!!",
        "[Events]", "Format: Layer, Text", "Dialogue:0,Hello, world",
      ].join(newline);
      const root = parser.parse(source).rootNode;
      assert.strictEqual(root.hasError, false, root.toString());
      assert.strictEqual(root.namedChildCount, 2);
      const attachmentSection = root.namedChild(0);
      assert.deepStrictEqual(attachmentSection.descendantsOfType("attachment_data").map((node) => node.text), [...lines, "!!!!"]);
      assert.strictEqual(attachmentSection.descendantsOfType("key_value_pair").length, 2);
      const captures = query.captures(attachmentSection);
      assert.ok(!captures.some((capture) => capture.name === "comment"));
      for (const line of lines) {
        assert.ok(captures.some((capture) => capture.name === "string" && capture.node.text === line), line);
      }
      const dialogue = root.namedChild(1).lastNamedChild.childForFieldName("values_dialogue");
      assert.strictEqual(dialogue.lastNamedChild.text, "Hello, world");
    }
  }
});

test("attachment data requires a declaration in its matching section", () => {
  const parser = new Parser();
  parser.setLanguage(require("."));
  for (const source of [
    "[Script Info]\n!!!!",
    "[Fonts]\n!!!!",
    "[Graphics]\n!!!!",
    "[Fonts]\nfilename: image.bmp\n!!!!",
    "[Graphics]\nfontname: font.ttf\n!!!!",
  ]) {
    const root = parser.parse(source).rootNode;
    assert.strictEqual(root.hasError, true, source);
    assert.strictEqual(root.descendantsOfType("attachment_data").length, 0);
  }
  for (const [section, key] of [["Fonts", "fontname"], ["Graphics", "filename"]]) {
    const root = parser.parse(`[${section}]\n${key}: attachment\n!!!!`).rootNode;
    assert.strictEqual(root.hasError, false);
    assert.strictEqual(root.descendantsOfType("attachment_data")[0].text, "!!!!");
  }
});

test("incremental section edits invalidate attachment scanner state", () => {
  const parser = new Parser();
  parser.setLanguage(require("."));
  const before = "[Fonts]\nfontname: font.ttf\n!!!!\n[Events]\nFormat: Layer, Text\nDialogue:0,Hello, world\n";
  const tree = parser.parse(before);
  tree.edit({
    startIndex: 1, oldEndIndex: 6, newEndIndex: 6,
    startPosition: { row: 0, column: 1 }, oldEndPosition: { row: 0, column: 6 }, newEndPosition: { row: 0, column: 6 },
  });
  const after = before.replace("Fonts", "Other");
  const incremental = parser.parse(after, tree);
  const fresh = parser.parse(after);
  assert.strictEqual(incremental.rootNode.hasError, true);
  assert.strictEqual(incremental.rootNode.toString(), fresh.rootNode.toString());
  assert.strictEqual(incremental.rootNode.descendantsOfType("attachment_data").length, 0);
});

test("event Text preserves commas and override tags for declared formats", () => {
  const parser = new Parser();
  parser.setLanguage(require("."));
  const formats = [
    ["Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text", "0,0:00:01.00,0:00:02.00,Default,,0,0,0,,", 10],
    ["Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text", "Marked=0,0:00:01.00,0:00:02.00,Default,,0,0,0,,", 10],
    ["Start, End, Layer, Custom, Text", "0:00:01.00,0:00:02.00,0,,", 5],
    ["Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Extra, Text", "0,0:00:01.00,0:00:02.00,Default,,0,0,0,,,", 11],
    ["Text", "", 1],
    ["layer,\t text ", "0,", 2],
  ];
  for (const [format, fields, count] of formats) {
    for (const key of ["Dialogue", "Comment"]) {
      for (const newline of ["\n", "\r\n", "\r"]) {
        for (const text of ["Hello, world", "{\\pos(100,200)\\t(0,100,\\fs30)}字幕, test", ",leading,trailing,", "", "  spaced, text  "]) {
          const source = `[Events]${newline}Format: ${format}${newline}${key}:` + fields + text;
          const root = parser.parse(source).rootNode;
          assert.strictEqual(root.hasError, false, source);
          const pair = root.descendantsOfType("key_value_pair").at(-1);
          const values = pair.childForFieldName(`values_${key.toLowerCase()}`);
          assert.strictEqual(values.namedChildCount, count, source);
          assert.strictEqual(values.lastNamedChild.type, "value");
          assert.strictEqual(values.lastNamedChild.text, text, source);
        }
      }
    }
  }
});

test("event format state follows sections and format changes", () => {
  const parser = new Parser();
  parser.setLanguage(require("."));
  const source = "[V4+ Styles]\nFormat: Name, Fontname\nStyle: Default,Arial\n" +
    "[Events]\nDialogue:0,0:00:01.00,0:00:02.00,Default,,0,0,0,,default, text\n" +
    "Format: Layer, Text\nDialogue:0,short, text\n" +
    "Format: Start, End, Text\nComment:0:00:01.00,0:00:02.00,another, text\n" +
    "[V4+ Styles]\nFormat: Name,Fontname\nStyle: Default,Arial\n" +
    "[ Events ]\ndIaLoGuE:0:00:01.00,0:00:02.00,continued, text";
  const root = parser.parse(source).rootNode;
  assert.strictEqual(root.hasError, false, root.toString());
  const events = root.descendantsOfType("key_value_pair").filter((node) =>
    node.childForFieldName("key_dialogue") || node.childForFieldName("key_comment"),
  );
  assert.deepStrictEqual(events.map((node) => node.lastNamedChild.namedChildCount), [10, 2, 3, 3]);
  assert.deepStrictEqual(events.map((node) => node.lastNamedChild.lastNamedChild.text),
    ["default, text", "short, text", "another, text", "continued, text"]);
});

test("highlighting treats commas inside event Text as string content", () => {
  const language = require(".");
  const parser = new Parser();
  parser.setLanguage(language);
  const text = "{\\pos(100,200)}Hello, world";
  const root = parser.parse(`[Events]\nFormat: Layer, Text\nDialogue:0,${text}`).rootNode;
  const query = new Parser.Query(language, readFileSync(
    join(__dirname, "../../queries/highlights.scm"), "utf8",
  ));
  const captures = query.captures(root);
  const textCapture = captures.find((capture) => capture.name === "string" && capture.node.text === text);
  assert.ok(textCapture);
  assert.ok(!captures.some((capture) => capture.name === "punctuation.delimiter" &&
    capture.node.startIndex >= textCapture.node.startIndex + text.indexOf("Hello")));
});

test("changing Format incrementally updates the following Text boundary", () => {
  const parser = new Parser();
  parser.setLanguage(require("."));
  const before = "[Events]\nFormat: Layer, Extra, Text\nDialogue:0,first,second,third\n";
  const oldTree = parser.parse(before);
  const startIndex = before.indexOf("Extra, ");
  oldTree.edit({
    startIndex, oldEndIndex: startIndex + 7, newEndIndex: startIndex,
    startPosition: { row: 1, column: 15 },
    oldEndPosition: { row: 1, column: 22 },
    newEndPosition: { row: 1, column: 15 },
  });
  const after = before.replace("Extra, ", "");
  const incremental = parser.parse(after, oldTree);
  const fresh = parser.parse(after);
  assert.strictEqual(incremental.rootNode.hasError, false);
  assert.strictEqual(incremental.rootNode.toString(), fresh.rootNode.toString());
  const values = incremental.rootNode.descendantsOfType("key_value_pair").at(-1).lastNamedChild;
  assert.strictEqual(values.namedChildCount, 2);
  assert.strictEqual(values.lastNamedChild.text, "first,second,third");
});

test("section headers cannot cross line endings or contain opening brackets", () => {
  const parser = new Parser();
  parser.setLanguage(require("."));
  for (const newline of ["\n", "\r\n", "\r"]) {
    for (const header of [
      `[Script${newline}Info]`,
      `[V4+${newline}Styles]`,
      `[Custom${newline}Section]`,
      `[${newline}Events]`,
      `[Events${newline}]`,
      "[Bad[Name]",
      "[Broken",
    ]) {
      const source = `${header}${newline}[Events]${newline}Format: Layer,Text`;
      const root = parser.parse(source).rootNode;
      assert.strictEqual(root.hasError, true, source);
      for (const name of root.descendantsOfType("section_name")) {
        assert.doesNotMatch(name.text, /[\r\n\[]/, source);
      }
      const eventsHeader = root.descendantsOfType("section_header").find((node) =>
        node.childForFieldName("section_name_events")?.text === "Events" && !node.hasError,
      );
      assert.ok(eventsHeader, source);
      assert.strictEqual(eventsHeader.text, "[Events]");
      assert.strictEqual(eventsHeader.parent.lastNamedChild.childForFieldName("key_format").text, "Format");
    }
  }
});

test("single-line section names retain spaces, tabs, and case handling", () => {
  const parser = new Parser();
  parser.setLanguage(require("."));
  for (const header of ["[Script Info]", "[sCrIpT  iNfO]", "[Script\tInfo]", "[V4 Styles]", "[V4+ Styles]", "[Custom Section]", "[ Custom Section ]"]) {
    const root = parser.parse(header + "\nTitle: Example").rootNode;
    assert.strictEqual(root.hasError, false, header);
    assert.strictEqual(root.namedChildCount, 1, header);
    assert.strictEqual(root.namedChild(0).namedChild(0).text, header);
  }
});

test("brackets in comments preserve following fields and sections", () => {
  const parser = new Parser();
  const language = require(".");
  parser.setLanguage(language);
  const query = new Parser.Query(language, readFileSync(
    join(__dirname, "../../queries/highlights.scm"), "utf8",
  ));
  for (const prefix of [";", "!:"]) {
    for (const newline of ["\n", "\r\n", "\r"]) {
      for (const text of [" generated by [Aegisub]", " [Events] stays a comment", " unmatched ["]) {
        const comment = prefix + text;
        const source = ["[Script Info]", comment, "Title: Example", "[Events]", "Format: Layer,Text"].join(newline);
        const root = parser.parse(source).rootNode;
        assert.strictEqual(root.hasError, false, source);
        assert.strictEqual(root.namedChildCount, 2, source);
        const scriptInfo = root.namedChild(0);
        assert.strictEqual(scriptInfo.namedChild(1).type, "comment");
        assert.strictEqual(scriptInfo.namedChild(1).text, comment);
        assert.strictEqual(scriptInfo.namedChild(2).childForFieldName("key_title").text, "Title");
        assert.strictEqual(root.namedChild(1).namedChild(0).childForFieldName("section_name_events").text, "Events");
        const captures = query.captures(root).filter((capture) => capture.name === "comment");
        assert.deepStrictEqual(captures.map((capture) => capture.node.text), [comment]);
      }
    }
  }
});

test("bracket comments can end at the end of the file", () => {
  const parser = new Parser();
  parser.setLanguage(require("."));
  for (const comment of ["; [Aegisub]", "!: [Events]", "; unmatched ["]) {
    const root = parser.parse("[Script Info]\n" + comment).rootNode;
    assert.strictEqual(root.hasError, false);
    assert.strictEqual(root.namedChildCount, 1);
    assert.strictEqual(root.namedChild(0).lastNamedChild.text, comment);
    assert.strictEqual(root.namedChild(0).lastNamedChild.type, "comment");
  }
});

test("parses ASS sections, comments, and comma-separated dialogue", () => {
  const parser = new Parser();
  parser.setLanguage(require("."));
  const source = "\uFEFF[Script Info]\r\n; Subtitle metadata\r\nTitle: Example\r\n" +
    "[Events]\r\nFormat: Layer,Start,End,Style,Text\r\nDialogue: 0,0:00:01.00,0:00:02.00,Default,Hello world\r\n";
  const tree = parser.parse(source);
  assert.strictEqual(tree.rootNode.hasError, false);
  assert.strictEqual(tree.rootNode.namedChildCount, 2);
  assert.strictEqual(tree.rootNode.namedChild(1).type, "section");
  const values = tree.rootNode.descendantsOfType("values");
  assert.strictEqual(values[2].namedChildCount, 5);
  assert.strictEqual(values[2].lastNamedChild.text, "Hello world");
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
