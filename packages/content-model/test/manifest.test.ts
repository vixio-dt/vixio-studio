import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  appendRecord,
  assetFileName,
  ManifestFieldError,
  ManifestParseError,
  MANIFEST_HEADER,
  parseManifest,
  serializeManifest,
  validateField,
} from "../src/manifest.ts";
import { readSource } from "../src/lines.ts";

const parse = (text: string) => parseManifest(readSource(Buffer.from(text, "utf-8")));

/**
 * Synthetic fixture exercising every field overload without shipping canon:
 * a numeric page with a `g<n>` grid panel, the three page tokens, slug
 * panels, lettered and unlettered versions plus the `note` breaker, empty
 * seeds, all four statuses, and all three image_link kinds.
 */
const FIXTURE = [
  MANIFEST_HEADER,
  "7,g3,v1,234177,completed,https://cdn.example/hf_x.png,Control test - PASSED",
  "TURN,shengtian-street,v2,541043,refused-filter,job:99f7867c-f7a4-4340-9343-45ec392f723a,Retry still refused",
  "STYLE-PROBE,probe-ab-xiaotian,note,,invalidated,,Superseded by canonical order run",
  "KEY,styleA-nbp,v3,,completed,https://cdn.example/hf_y.png,Playbook prompt - PASSED",
  "TURN,shengtian-stage,v4d,,pending,job:0914d367-8a89-4669-b02b-5003eed0c662,Rebind on fallback",
  "",
].join("\n");

describe("parseManifest", () => {
  const doc = parse(FIXTURE);

  it("round-trips the fixture byte-exactly", () => {
    expect(serializeManifest(doc)).toBe(FIXTURE);
    expect(doc.finalNewline).toBe(true);
  });

  it("types the page overloads", () => {
    expect(doc.records.map((r) => r.page)).toEqual([7, "TURN", "STYLE-PROBE", "KEY", "TURN"]);
  });

  it("types grid and slug panels", () => {
    expect(doc.records[0]!.panel).toEqual({ kind: "grid", raw: "g3", n: 3 });
    expect(doc.records[2]!.panel).toEqual({ kind: "slug", raw: "probe-ab-xiaotian" });
  });

  it("parses v-scheme versions and keeps documented breakers raw", () => {
    expect(doc.records[0]!.version).toEqual({ raw: "v1", parsed: { n: 1, letter: null } });
    expect(doc.records[4]!.version).toEqual({ raw: "v4d", parsed: { n: 4, letter: "d" } });
    expect(doc.records[2]!.version).toEqual({ raw: "note" });
    expect(doc.report.warnings).toEqual([]);
  });

  it("reads empty seeds as null", () => {
    expect(doc.records.map((r) => r.seed)).toEqual([234177, 541043, null, null, null]);
  });

  it("classifies image links, stripping the job: prefix", () => {
    expect(doc.records[0]!.imageLink).toEqual({
      kind: "url",
      value: "https://cdn.example/hf_x.png",
    });
    expect(doc.records[1]!.imageLink).toEqual({
      kind: "job",
      value: "99f7867c-f7a4-4340-9343-45ec392f723a",
    });
    expect(doc.records[2]!.imageLink).toEqual({ kind: "empty", value: "" });
  });

  it("reports row count and status census", () => {
    expect(doc.report.rowCount).toBe(5);
    expect(doc.report.statusCensus).toEqual({
      completed: 2,
      "refused-filter": 1,
      invalidated: 1,
      pending: 1,
    });
  });

  it("keeps rawLine verbatim with the record's line index", () => {
    expect(doc.records[2]!.line).toBe(3);
    expect(doc.records[2]!.rawLine).toBe(
      "STYLE-PROBE,probe-ab-xiaotian,note,,invalidated,,Superseded by canonical order run",
    );
  });

  it("throws on a header that is not byte-identical", () => {
    const bad = FIXTURE.replace("image_link", "image link");
    expect(() => parse(bad)).toThrow(ManifestParseError);
    expect(() => parse(bad)).toThrow(/Line 1/);
    expect(() => parse("")).toThrow(/Line 1/);
  });

  it("throws on field-count drift, naming the line", () => {
    const short = [MANIFEST_HEADER, "KEY,styleA,v1,1,completed,x", ""].join("\n");
    expect(() => parse(short)).toThrow(ManifestParseError);
    expect(() => parse(short)).toThrow(/Line 2: expected 7 comma-separated fields, got 6/);
    const long = FIXTURE.replace("Control test - PASSED", "Control test, PASSED");
    expect(() => parse(long)).toThrow(/Line 2: expected 7 comma-separated fields, got 8/);
    const blank = FIXTURE + "\n";
    expect(() => parse(blank)).toThrow(/Line 7: expected 7 comma-separated fields, got 1/);
  });

  it("throws on an unknown status", () => {
    const bad = FIXTURE.replace(",completed,https://cdn.example/hf_x.png", ",done,");
    expect(() => parse(bad)).toThrow(ManifestParseError);
    expect(() => parse(bad)).toThrow(/Line 2: unknown status "done"/);
  });

  it("throws on malformed page, panel, seed, and image_link", () => {
    expect(() => parse(FIXTURE.replace("7,g3", "PAGE-7,g3"))).toThrow(/Line 2.*page/);
    expect(() => parse(FIXTURE.replace("g3", "not_a_slug"))).toThrow(/Line 2.*panel/);
    expect(() => parse(FIXTURE.replace("234177", "12x3"))).toThrow(/Line 2.*seed/);
    expect(() => parse(FIXTURE.replace("https://cdn.example/hf_x.png", "ftp://x"))).toThrow(
      /Line 2.*image_link/,
    );
    expect(() =>
      parse(FIXTURE.replace("job:99f7867c-f7a4-4340-9343-45ec392f723a", "job:notauuid")),
    ).toThrow(/Line 3.*job:<uuid>/);
  });

  it("warns (not throws) on an undocumented version breaker", () => {
    const drifted = parse(FIXTURE.replace(",note,", ",final,"));
    expect(drifted.records[2]!.version).toEqual({ raw: "final" });
    expect(drifted.report.warnings).toEqual([
      'L4: version "final" is neither v<n>[a-d] nor a documented breaker.',
    ]);
  });

  it("preserves a missing trailing newline", () => {
    const unterminated = FIXTURE.slice(0, -1);
    const doc2 = parse(unterminated);
    expect(doc2.finalNewline).toBe(false);
    expect(serializeManifest(doc2)).toBe(unterminated);
  });
});

describe("validateField / appendRecord", () => {
  const doc = parse(FIXTURE);

  it("validateField rejects comma, CR, and LF, and passes clean text", () => {
    expect(() => validateField("Shengtian retry - PASSED")).not.toThrow();
    expect(() => validateField("a,b")).toThrow(ManifestFieldError);
    expect(() => validateField("a,b")).toThrow(/comma/);
    expect(() => validateField("a\rb")).toThrow(/CR/);
    expect(() => validateField("a\nb")).toThrow(/LF/);
  });

  it("appendRecord returns the exact new line and a re-parseable doc", () => {
    const { doc: next, line } = appendRecord(doc, {
      page: 8,
      panel: "g1",
      version: "v2",
      seed: 424242,
      status: "completed",
      imageLink: { kind: "url", value: "https://cdn.example/hf_z.png" },
      promptSummary: "New render - PASSED",
    });
    expect(line).toBe("8,g1,v2,424242,completed,https://cdn.example/hf_z.png,New render - PASSED");
    expect(serializeManifest(next)).toBe(FIXTURE + line + "\n");
    expect(next.report.rowCount).toBe(6);
    expect(next.report.statusCensus["completed"]).toBe(3);
    // Round-trip through a real re-parse.
    const reparsed = parse(serializeManifest(next));
    expect(reparsed.records).toEqual(next.records);
    expect(reparsed.records[5]!.page).toBe(8);
    // The input doc was not mutated.
    expect(doc.report.rowCount).toBe(5);
    expect(doc.records).toHaveLength(5);
  });

  it("serializes empty seed and empty image_link as empty fields", () => {
    const { line } = appendRecord(doc, {
      page: "STYLE-PROBE",
      panel: "probe-d",
      version: "v1",
      seed: null,
      status: "invalidated",
      imageLink: { kind: "empty", value: "" },
      promptSummary: "Withdrawn",
    });
    expect(line).toBe("STYLE-PROBE,probe-d,v1,,invalidated,,Withdrawn");
  });

  it("rejects a comma or newline in any appended field instead of quoting", () => {
    const init = {
      page: "TURN" as const,
      panel: "shengtian",
      version: "v1",
      seed: null,
      status: "pending" as const,
      imageLink: { kind: "empty", value: "" } as const,
      promptSummary: "ok",
    };
    expect(() => appendRecord(doc, { ...init, promptSummary: "left, right" })).toThrow(
      ManifestFieldError,
    );
    expect(() => appendRecord(doc, { ...init, promptSummary: "line one\nline two" })).toThrow(
      ManifestFieldError,
    );
    expect(() => appendRecord(doc, { ...init, promptSummary: "cr\rlf" })).toThrow(
      ManifestFieldError,
    );
    expect(() => appendRecord(doc, { ...init, panel: "a,b" })).toThrow(ManifestFieldError);
  });

  it("re-parses the built row, so malformed typed values still fail", () => {
    expect(() =>
      appendRecord(doc, {
        page: "TURN",
        panel: "not a slug",
        version: "v1",
        seed: null,
        status: "pending",
        imageLink: { kind: "empty", value: "" },
        promptSummary: "ok",
      }),
    ).toThrow(ManifestParseError);
  });
});

describe("assetFileName", () => {
  it("matches the pipeline spec's own example", () => {
    expect(assetFileName({ page: 33, panel: 1, version: 2 })).toBe("ep0_p33_g1_v2");
  });

  it("normalizes manifest-flavoured g/v prefixes without doubling them", () => {
    expect(assetFileName({ page: 7, panel: "g3", version: "v1" })).toBe("ep0_p7_g3_v1");
    expect(assetFileName({ page: 44, panel: 2, version: "v4a" })).toBe("ep0_p44_g2_v4a");
  });

  it("rejects empty or path-unsafe parts", () => {
    expect(() => assetFileName({ page: 1, panel: "a/b", version: 1 })).toThrow(ManifestFieldError);
    expect(() => assetFileName({ page: "", panel: 1, version: 1 })).toThrow(ManifestFieldError);
  });
});

/**
 * Canon loop: the real manifest, present only where a checkout exists (dev
 * containers, the VPS). CI runs the synthetic fixtures above; this suite is
 * the oracle that the codec matches the actual data. Censuses audited
 * 2026-08-01 against the file (42 rows, 8503 bytes, trailing LF).
 */
const HTH = process.env["HTH_REPO_PATH"];

describe.skipIf(!HTH)("03_output/manifest.csv (real repo)", () => {
  // describe bodies run even when the suite is skipped, so load lazily —
  // eager top-level reads would crash collection in env-less CI.
  let cache: { bytes: Buffer; doc: ReturnType<typeof parseManifest> } | undefined;
  const oracle = () => {
    if (cache === undefined) {
      const bytes = readFileSync(`${HTH}/03_output/manifest.csv`);
      cache = { bytes, doc: parseManifest(readSource(bytes)) };
    }
    return cache;
  };

  it("round-trips byte-exactly, trailing newline included", () => {
    const { bytes, doc } = oracle();
    expect(Buffer.from(serializeManifest(doc), "utf-8").equals(bytes)).toBe(true);
    expect(doc.finalNewline).toBe(true);
  });

  it("matches the audited row count and status census", () => {
    const { doc } = oracle();
    expect(doc.report.rowCount).toBe(42);
    expect(doc.report.statusCensus).toEqual({
      completed: 28,
      "refused-filter": 11,
      pending: 2,
      invalidated: 1,
    });
  });

  it("matches the audited page-overload census", () => {
    const { doc } = oracle();
    const census: Record<string, number> = {};
    for (const record of doc.records) {
      const key = typeof record.page === "number" ? "numeric" : record.page;
      census[key] = (census[key] ?? 0) + 1;
    }
    expect(census).toEqual({ TURN: 22, "STYLE-PROBE": 10, KEY: 9, numeric: 1 });
    // The single numeric row is the control test: page 7, panel g3.
    const numeric = doc.records.filter((record) => typeof record.page === "number");
    expect(numeric.map((r) => [r.page, r.panel])).toEqual([
      [7, { kind: "grid", raw: "g3", n: 3 }],
    ]);
  });

  it("parses every version: 39 v-scheme rows, exactly the 3 documented breakers", () => {
    const { doc } = oracle();
    const breakers = doc.records.filter((record) => record.version.parsed === undefined);
    expect(breakers.map((record) => record.version.raw).sort()).toEqual([
      "note",
      "styleA-painterly",
      "styleB-cel",
    ]);
    expect(doc.records.length - breakers.length).toBe(39);
  });

  it("matches the audited seed and image-link censuses", () => {
    const { doc } = oracle();
    expect(doc.records.filter((record) => record.seed === null)).toHaveLength(5);
    const kinds: Record<string, number> = {};
    for (const record of doc.records) {
      kinds[record.imageLink.kind] = (kinds[record.imageLink.kind] ?? 0) + 1;
    }
    expect(kinds).toEqual({ url: 28, job: 11, empty: 3 });
  });

  it("parses with zero warnings", () => {
    const { doc } = oracle();
    expect(doc.report.warnings).toEqual([]);
  });
});
