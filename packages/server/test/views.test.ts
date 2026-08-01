/**
 * GET /api/projects/:id/view — parsed-view endpoint tests.
 *
 * Extends the temp-git-repo fixture with synthetic mini-documents for every
 * view kind (script, canon, open-questions, design, manifest, raw), then
 * asserts the projected shapes, the never-ship redaction gate (ON by default,
 * OFF only for drawer=author), 422 on malformed files, and byte-identical
 * field raws.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Hono } from "hono";
import { createApp } from "../src/app.ts";
import type { CanonView, DesignView, ManifestView, ScriptView } from "../src/views.ts";
import { makeFixture, PLAIN_DOC_PATH, PLAIN_DOC_TEXT, type Fixture } from "./fixture.ts";

const SEP = "━".repeat(23);

const headerZh = (title: string): string =>
  `VIXIO CREATIVES｜《哮天》HOWL TO HEAVEN\n文件：${title}\n版本 v1｜狀態：測試\n`;

/* ---------------- synthetic fixtures ---------------- */

const SCRIPT_PATH = "01_script/episode-zero-script.txt";
/** 畫 field value: first line plus a U+3000-indented continuation line. */
const SCRIPT_HUA_RAW = "山風吹過石階。\n　　燈籠在霧中搖晃。";
const SCRIPT_BAI_RAW = "「誰在那裡？」";
const SCRIPT_TEXT =
  headerZh("第零集分鏡稿（測試）") +
  "圖例：畫＝畫面描述。\n" +
  `${SEP}\n` +
  "第一幕（第1至2頁）\n" +
  "序：山門前。\n" +
  "第1頁（2格）雨夜\n" +
  "格1（橫長）畫：山風吹過石階。\n" +
  "　　燈籠在霧中搖晃。\n" +
  "白（哮天）：「誰在那裡？」\n" +
  "格2（黑底）音：——\n" +
  "第2頁（跨頁大圖）\n" +
  "畫：整座山被雲海吞沒。\n" +
  `${SEP}\n` +
  "第零集測試稿完。\n";

const CANON_PATH = "00_canon/world-rules.txt";
const CANON_PRIVATE_TEXT = "這一段是絕不能外流的私密草稿。";
const CANON_TEXT =
  headerZh("世界規則（測試）") +
  "範圍：本檔為測試用。\n" +
  `${SEP}\n` +
  "第一章　燈與狼\n" +
  "狼靈以紙蓮燈為引。\n" +
  "燈滅則歸山。\n" +
  "第二章　私藏（私人燃料，永不入作品）\n" +
  `${CANON_PRIVATE_TEXT}\n` +
  "第三章　市集\n" +
  "市集在山腳下。\n";

const OQ_PATH = "00_canon/open-questions.txt";
const OQ_TEXT =
  headerZh("未決問題（測試）") +
  "範圍：測試用未決問題清單。\n" +
  "\n" +
  "人物\n" +
  "一、哮天的聲音由誰配？\n" +
  "　　候選：兩位配音員。\n" +
  "二（已定）：狼形定案為白狼。\n" +
  "\n" +
  "世界\n" +
  "三之二、市集的燈籠數目？\n" +
  "存而不論：以下暫不處理。\n";

const DESIGN_PATH = "02_art/character-design-prompts.txt";
const DESIGN_TEXT =
  "VIXIO CREATIVES｜《哮天》HOWL TO HEAVEN\n" +
  "Document: Character Design Prompts (test)\n" +
  "Version v1 | Status: test\n" +
  "(v1 changelog: test fixture.)\n" +
  "\n" +
  `${SEP}\n` +
  "1. XIAOTIAN (stage costume)\n" +
  "CORE BLOCK:\n" +
  "white wolf spirit, glowing paper lotus lantern,\n" +
  "ink-wash mountain backdrop\n" +
  "NEGATIVE: text, watermark, extra limbs\n" +
  "VARIANT — TRUE FORM (full moon\n" +
  "reveal panel):\n" +
  "colossal celestial hound, storm clouds\n" +
  `${SEP}\n` +
  "Set Blocks\n" +
  "SET 1 — MOUNTAIN GATE (exterior)\n" +
  "mist, stone steps, prayer flags\n" +
  `${SEP}\n` +
  "Prop Blocks\n" +
  "PAPER LOTUS LANTERN:\n" +
  "folded white paper, inner amber glow\n" +
  `${SEP}\n` +
  "Style Blocks (STALE — superseded)\n" +
  "STYLE BLOCK A (painterly):\n" +
  "loose ink wash, muted palette\n";

const MANIFEST_PATH = "03_output/manifest.csv";
const MANIFEST_ROW_1 =
  "1,g1,v1,12345,completed,https://cdn.example.com/ep0_p1_g1_v1.png,xiaotian at the mountain gate";
const MANIFEST_TEXT =
  "page,panel,version,seed,status,image_link,prompt_summary\n" +
  `${MANIFEST_ROW_1}\n` +
  "1,g2,v1a,,pending,job:0f8b6c2a-1111-2222-3333-444455556666,wolf silhouette in mist\n" +
  "STYLE-PROBE,styleA-nbp,styleA-painterly,,invalidated,,painterly probe\n" +
  "TURN,xiaotian-turn,v2,777,refused-filter,job:aaaaaaaa-bbbb-cccc-dddd-eeeeffff0000,turnaround sheet\n";

const BROKEN_CANON_PATH = "00_canon/broken.txt";
const BROKEN_CANON_TEXT = "not a canon header\nat all\nreally\n";

const CRLF_SCRIPT_PATH = "01_script/crlf.txt";
const CRLF_SCRIPT_TEXT = "VIXIO CREATIVES｜《哮天》HOWL TO HEAVEN\r\n文件：x\r\n";

/* ---------------- harness ---------------- */

let fx: Fixture;
let app: Hono;

beforeEach(async () => {
  fx = await makeFixture();
  const docs: ReadonlyArray<readonly [string, string]> = [
    [SCRIPT_PATH, SCRIPT_TEXT],
    [CANON_PATH, CANON_TEXT],
    [OQ_PATH, OQ_TEXT],
    [DESIGN_PATH, DESIGN_TEXT],
    [MANIFEST_PATH, MANIFEST_TEXT],
    [BROKEN_CANON_PATH, BROKEN_CANON_TEXT],
    [CRLF_SCRIPT_PATH, CRLF_SCRIPT_TEXT],
  ];
  for (const [relPath, text] of docs) {
    const abs = path.join(fx.repo, relPath);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, Buffer.from(text, "utf8"));
  }
  const projectsFile = path.join(fx.base, "projects.json");
  await writeFile(
    projectsFile,
    JSON.stringify([{ id: fx.project.id, name: fx.project.name, path: fx.project.path }]),
  );
  app = await createApp(projectsFile);
});

afterEach(async () => {
  await fx.cleanup();
});

function viewUrl(relPath: string, drawer?: string): string {
  const q = new URLSearchParams({ path: relPath });
  if (drawer !== undefined) q.set("drawer", drawer);
  return `/api/projects/${fx.project.id}/view?${q.toString()}`;
}

/* ---------------- tests ---------------- */

describe("GET /api/projects/:id/view — script", () => {
  it("projects the script into header/acts/pages/report with the exact page shape", async () => {
    const res = await app.request(viewUrl(SCRIPT_PATH));
    expect(res.status).toBe(200);
    const view = (await res.json()) as ScriptView;
    expect(view.kind).toBe("script");
    expect(view.header.docTitle).toBe("第零集分鏡稿（測試）");
    expect(view.header.version).toBe("v1");
    expect(view.header.status).toBe("測試");
    expect(view.acts).toEqual([
      { name: "第一幕", declaredStart: 1, declaredEnd: 2, headingLine: 5 },
    ]);
    // toEqual pins the projection: no headerLine/physicalPages/parts may leak.
    expect(view.pages).toEqual([
      {
        blockIndex: 0,
        pageStart: 1,
        pageEnd: null,
        attrRaw: "2格",
        attrKind: "panel-count",
        declaredPanelCount: 2,
        trailingNote: "雨夜",
        panels: [
          {
            ordinal: 1,
            implicit: false,
            attrRaw: "橫長",
            fields: [
              { kind: "畫", paren: null, raw: SCRIPT_HUA_RAW },
              { kind: "白", paren: "哮天", raw: SCRIPT_BAI_RAW },
            ],
          },
          {
            ordinal: 2,
            implicit: false,
            attrRaw: "黑底",
            fields: [{ kind: "音", paren: null, raw: "——" }],
          },
        ],
      },
      {
        blockIndex: 1,
        pageStart: 2,
        pageEnd: null,
        attrRaw: "跨頁大圖",
        attrKind: "shape",
        declaredPanelCount: null,
        trailingNote: null,
        panels: [
          {
            ordinal: null,
            implicit: true,
            attrRaw: null,
            fields: [{ kind: "畫", paren: null, raw: "整座山被雲海吞沒。" }],
          },
        ],
      },
    ]);
    expect(view.report.pageBlockCount).toBe(2);
    expect(view.report.physicalPageCount).toBe(2);
    expect(view.report.panelCount).toBe(3);
    expect(view.report.fieldCounts).toEqual({ 畫: 2, 白: 1, 音: 1 });
    expect(view.report.declaredPanelMismatches).toEqual([]);
    expect(view.report.actRangeMismatches).toEqual([]);
    expect(view.report.warnings).toEqual([]);
  });

  it("returns field raws byte-identical to the fixture content (U+3000 continuation intact)", async () => {
    const res = await app.request(viewUrl(SCRIPT_PATH));
    const view = (await res.json()) as ScriptView;
    const hua = view.pages[0]?.panels[0]?.fields[0]?.raw;
    const bai = view.pages[0]?.panels[0]?.fields[1]?.raw;
    expect(hua).toBe(SCRIPT_HUA_RAW);
    expect(bai).toBe(SCRIPT_BAI_RAW);
    expect(Buffer.from(hua ?? "", "utf8").equals(Buffer.from(SCRIPT_HUA_RAW, "utf8"))).toBe(true);
    expect(Buffer.from(bai ?? "", "utf8").equals(Buffer.from(SCRIPT_BAI_RAW, "utf8"))).toBe(true);
  });
});

describe("GET /api/projects/:id/view — canon and never-ship redaction", () => {
  it("redacts never-ship bodies by default: {redacted:true}, bytes absent from the JSON", async () => {
    const res = await app.request(viewUrl(CANON_PATH));
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw.includes(CANON_PRIVATE_TEXT)).toBe(false);
    const view = JSON.parse(raw) as CanonView;
    expect(view.kind).toBe("canon");
    expect(view.header.docTitle).toBe("世界規則（測試）");
    expect(view.sections).toEqual([
      {
        headingRaw: "第一章　燈與狼",
        ordinal: 1,
        title: "燈與狼",
        neverShip: false,
        body: "狼靈以紙蓮燈為引。\n燈滅則歸山。",
      },
      {
        headingRaw: "第二章　私藏（私人燃料，永不入作品）",
        ordinal: 2,
        title: "私藏（私人燃料，永不入作品）",
        neverShip: true,
        body: { redacted: true },
      },
      {
        headingRaw: "第三章　市集",
        ordinal: 3,
        title: "市集",
        neverShip: false,
        body: "市集在山腳下。",
      },
    ]);
  });

  it("still redacts for any drawer other than author", async () => {
    const res = await app.request(viewUrl(CANON_PATH, "reader"));
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw.includes(CANON_PRIVATE_TEXT)).toBe(false);
    const view = JSON.parse(raw) as CanonView;
    expect(view.sections[1]?.body).toEqual({ redacted: true });
  });

  it("returns the private body verbatim with drawer=author", async () => {
    const res = await app.request(viewUrl(CANON_PATH, "author"));
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw.includes(CANON_PRIVATE_TEXT)).toBe(true);
    const view = JSON.parse(raw) as CanonView;
    expect(view.sections[1]?.neverShip).toBe(true);
    expect(view.sections[1]?.body).toBe(CANON_PRIVATE_TEXT);
  });
});

describe("GET /api/projects/:id/view — open-questions", () => {
  it("returns the parsed doc: categories, items (file order), states, notes, census", async () => {
    const res = await app.request(viewUrl(OQ_PATH));
    expect(res.status).toBe(200);
    const view = (await res.json()) as {
      kind: string;
      header: { docTitle: string };
      categories: Array<{
        nameRaw: string;
        items: Array<{
          ordinalRaw: string;
          ordinalMajor: number;
          ordinalMinor: number | null;
          state: string | null;
          delimiter: string;
          textRaw: string;
        }>;
        notes: Array<{ line: number; text: string }>;
      }>;
      items: unknown[];
      report: { categoryCount: number; itemCount: number; stateCensus: Record<string, number> };
    };
    expect(view.kind).toBe("open-questions");
    expect(view.header.docTitle).toBe("未決問題（測試）");
    expect(view.categories.map((c) => c.nameRaw)).toEqual(["人物", "世界"]);
    expect(view.items).toHaveLength(3);

    const first = view.categories[0]?.items[0];
    expect(first?.ordinalRaw).toBe("一");
    expect(first?.state).toBeNull();
    expect(first?.delimiter).toBe("、");
    // U+3000-indented continuation joined with \n, verbatim.
    expect(first?.textRaw).toBe("哮天的聲音由誰配？\n　　候選：兩位配音員。");

    const second = view.categories[0]?.items[1];
    expect(second?.state).toBe("已定");
    expect(second?.delimiter).toBe("：");
    expect(second?.textRaw).toBe("狼形定案為白狼。");

    const compound = view.categories[1]?.items[0];
    expect(compound?.ordinalRaw).toBe("三之二");
    expect(compound?.ordinalMajor).toBe(3);
    expect(compound?.ordinalMinor).toBe(2);

    expect(view.categories[1]?.notes).toEqual([{ line: 12, text: "存而不論：以下暫不處理。" }]);
    expect(view.report.categoryCount).toBe(2);
    expect(view.report.itemCount).toBe(3);
    expect(view.report.stateCensus).toEqual({ 已定: 1 });
  });
});

describe("GET /api/projects/:id/view — design", () => {
  it("projects characters/sets/props/styleBlocks with raw payloads and superseded flags", async () => {
    const res = await app.request(viewUrl(DESIGN_PATH));
    expect(res.status).toBe(200);
    const view = (await res.json()) as DesignView;
    expect(view.kind).toBe("design");
    expect(view.header.docTitle).toBe("Character Design Prompts (test)");
    expect(view.characters).toEqual([
      {
        ordinal: 1,
        nameLiteral: "XIAOTIAN",
        qualifier: "stage costume",
        subBlocks: [
          {
            kind: "core",
            label: "CORE BLOCK",
            payloadRaw: "white wolf spirit, glowing paper lotus lantern,\nink-wash mountain backdrop",
          },
          { kind: "negative", label: "NEGATIVE", payloadRaw: "text, watermark, extra limbs" },
          {
            // Wrapped marker header: the label keeps its line break.
            kind: "variant",
            label: "VARIANT — TRUE FORM (full moon\nreveal panel)",
            payloadRaw: "colossal celestial hound, storm clouds",
          },
        ],
      },
    ]);
    expect(view.sets).toEqual([
      {
        ordinal: 1,
        nameLiteral: "MOUNTAIN GATE",
        gloss: "exterior",
        payloadRaw: "mist, stone steps, prayer flags",
        subVersions: [],
      },
    ]);
    expect(view.props).toEqual([
      { nameLiteral: "PAPER LOTUS LANTERN", payloadRaw: "folded white paper, inner amber glow" },
    ]);
    expect(view.styleBlocks).toEqual([
      {
        label: "STYLE BLOCK A",
        gloss: "painterly",
        payloadRaw: "loose ink wash, muted palette",
        superseded: true,
      },
    ]);
  });
});

describe("GET /api/projects/:id/view — manifest", () => {
  it("returns rows and the status census", async () => {
    const res = await app.request(viewUrl(MANIFEST_PATH));
    expect(res.status).toBe(200);
    const view = (await res.json()) as ManifestView;
    expect(view.kind).toBe("manifest");
    expect(view.rows).toHaveLength(4);
    expect(view.rows[0]).toEqual({
      line: 1,
      rawLine: MANIFEST_ROW_1,
      page: 1,
      panel: { kind: "grid", raw: "g1", n: 1 },
      version: { raw: "v1", parsed: { n: 1, letter: null } },
      seed: 12345,
      status: "completed",
      imageLink: { kind: "url", value: "https://cdn.example.com/ep0_p1_g1_v1.png" },
      promptSummary: "xiaotian at the mountain gate",
    });
    // Documented version breaker: raw kept, `parsed` absent, no warning.
    expect(view.rows[2]?.version).toEqual({ raw: "styleA-painterly" });
    expect(view.rows[2]?.page).toBe("STYLE-PROBE");
    expect(view.rows[1]?.seed).toBeNull();
    expect(view.rows[1]?.imageLink).toEqual({
      kind: "job",
      value: "0f8b6c2a-1111-2222-3333-444455556666",
    });
    expect(view.statusCensus).toEqual({
      completed: 1,
      pending: 1,
      invalidated: 1,
      "refused-filter": 1,
    });
  });
});

describe("GET /api/projects/:id/view — raw fallback and errors", () => {
  it("returns {kind:'raw', size} for paths outside the known layouts", async () => {
    const res = await app.request(viewUrl(PLAIN_DOC_PATH));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      kind: "raw",
      size: Buffer.byteLength(PLAIN_DOC_TEXT, "utf8"),
    });
  });

  it("422s with {error} when the parser rejects the file", async () => {
    const badHeader = await app.request(viewUrl(BROKEN_CANON_PATH));
    expect(badHeader.status).toBe(422);
    const badHeaderBody = (await badHeader.json()) as { error: string };
    expect(typeof badHeaderBody.error).toBe("string");
    expect(badHeaderBody.error.length).toBeGreaterThan(0);

    const crlf = await app.request(viewUrl(CRLF_SCRIPT_PATH));
    expect(crlf.status).toBe(422);
    const crlfBody = (await crlf.json()) as { error: string };
    expect(crlfBody.error).toContain("CR");
  });

  it("404s for an unknown path and an unknown project", async () => {
    const missing = await app.request(viewUrl("01_script/no-such.txt"));
    expect(missing.status).toBe(404);

    const noProject = await app.request(
      `/api/projects/nope/view?path=${encodeURIComponent(SCRIPT_PATH)}`,
    );
    expect(noProject.status).toBe(404);
  });

  it("400s when the path query parameter is missing", async () => {
    const res = await app.request(`/api/projects/${fx.project.id}/view`);
    expect(res.status).toBe(400);
  });
});
