import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  commitEdit,
  DocNotFoundError,
  gitLog,
  listDocs,
  PathViolationError,
  readDoc,
  sha256Hex,
} from "../src/store.ts";
import {
  CJK_DOC_PATH,
  CJK_DOC_TEXT,
  ESCAPE_SYMLINK_PATH,
  makeFixture,
  OUTSIDE_FILE_NAME,
  PLAIN_DOC_PATH,
  type Fixture,
} from "./fixture.ts";

let fx: Fixture;

beforeEach(async () => {
  fx = await makeFixture();
});

afterEach(async () => {
  await fx.cleanup();
});

describe("path traversal defenses", () => {
  it("rejects ../ traversal", async () => {
    await expect(readDoc(fx.project, `../${OUTSIDE_FILE_NAME}`)).rejects.toBeInstanceOf(
      PathViolationError,
    );
  });

  it("rejects embedded .. segments", async () => {
    await expect(
      readDoc(fx.project, `canon/../../${OUTSIDE_FILE_NAME}`),
    ).rejects.toBeInstanceOf(PathViolationError);
  });

  it("rejects absolute paths", async () => {
    const abs = path.join(fx.base, OUTSIDE_FILE_NAME);
    await expect(readDoc(fx.project, abs)).rejects.toBeInstanceOf(PathViolationError);
  });

  it("rejects symlinks whose target escapes the project root", async () => {
    await expect(readDoc(fx.project, ESCAPE_SYMLINK_PATH)).rejects.toBeInstanceOf(
      PathViolationError,
    );
  });

  it("rejects empty, NUL, and backslash paths", async () => {
    await expect(readDoc(fx.project, "")).rejects.toBeInstanceOf(PathViolationError);
    await expect(readDoc(fx.project, "a\0b")).rejects.toBeInstanceOf(PathViolationError);
    await expect(readDoc(fx.project, "canon\\x.md")).rejects.toBeInstanceOf(PathViolationError);
  });

  it("the same defenses apply to commitEdit and gitLog", async () => {
    await expect(
      commitEdit(fx.project, {
        relPath: `../${OUTSIDE_FILE_NAME}`,
        baseSha256: "0".repeat(64),
        newBytes: Buffer.from("x"),
        message: "nope",
      }),
    ).rejects.toBeInstanceOf(PathViolationError);
    await expect(gitLog(fx.project, `../${OUTSIDE_FILE_NAME}`)).rejects.toBeInstanceOf(
      PathViolationError,
    );
  });
});

describe("readDoc", () => {
  it("returns exact bytes, sha256, and size for CJK/U+3000 content", async () => {
    // Guard: the fixture really does contain ideographic spaces.
    expect(CJK_DOC_TEXT.includes("　")).toBe(true);

    const expected = Buffer.from(CJK_DOC_TEXT, "utf8");
    const doc = await readDoc(fx.project, CJK_DOC_PATH);

    expect(doc.bytes.equals(expected)).toBe(true);
    expect(doc.sha256).toBe(sha256Hex(expected));
    expect(doc.size).toBe(expected.length);
  });

  it("round-trips bytes through base64 with matching sha256", async () => {
    const doc = await readDoc(fx.project, CJK_DOC_PATH);
    const roundTripped = Buffer.from(doc.bytes.toString("base64"), "base64");
    expect(roundTripped.equals(doc.bytes)).toBe(true);
    expect(sha256Hex(roundTripped)).toBe(doc.sha256);
  });

  it("throws DocNotFoundError for missing files and directories", async () => {
    await expect(readDoc(fx.project, "no-such.md")).rejects.toBeInstanceOf(DocNotFoundError);
    await expect(readDoc(fx.project, "canon")).rejects.toBeInstanceOf(DocNotFoundError);
  });
});

describe("listDocs", () => {
  it("lists tracked files with byte sizes and excludes untracked junk", async () => {
    await writeFile(path.join(fx.repo, "junk.tmp"), "untracked junk\n");

    const docs = await listDocs(fx.project);
    const byPath = new Map(docs.map((d) => [d.relPath, d.size]));

    expect(byPath.get(CJK_DOC_PATH)).toBe(Buffer.from(CJK_DOC_TEXT, "utf8").length);
    expect(byPath.get(PLAIN_DOC_PATH)).toBe(Buffer.byteLength("plain ascii notes\n"));
    expect(byPath.has("junk.tmp")).toBe(false);
    expect(byPath.has(ESCAPE_SYMLINK_PATH)).toBe(false);
  });
});

describe("commitEdit", () => {
  const NEW_TEXT =
    "# 世界規則 v1.1\n" +
    "　　第一章　狼與燈籠（改）\n" +
    "　　「聽見了。」\n";

  it("commits when baseSha256 matches and returns the new sha + commit sha", async () => {
    const before = await readDoc(fx.project, CJK_DOC_PATH);
    const newBytes = Buffer.from(NEW_TEXT, "utf8");

    const result = await commitEdit(fx.project, {
      relPath: CJK_DOC_PATH,
      baseSha256: before.sha256,
      newBytes,
      message: "edit: bump 世界規則 to v1.1",
    });

    expect(result.status).toBe("committed");
    if (result.status !== "committed") throw new Error("unreachable");
    expect(result.newSha256).toBe(sha256Hex(newBytes));

    const head = (await fx.git("rev-parse", "HEAD")).trim();
    expect(result.commitSha).toBe(head);

    const subject = (await fx.git("log", "-1", "--format=%s")).trim();
    expect(subject).toBe("edit: bump 世界規則 to v1.1");

    // Bytes on disk are EXACTLY newBytes.
    const onDisk = await readFile(path.join(fx.repo, CJK_DOC_PATH));
    expect(onDisk.equals(newBytes)).toBe(true);

    // The edited path is clean — the commit captured the exact write.
    const status = await fx.git("status", "--porcelain", "--", CJK_DOC_PATH);
    expect(status.trim()).toBe("");
  });

  it("returns conflict and leaves the file untouched on stale baseSha256", async () => {
    const before = await readDoc(fx.project, CJK_DOC_PATH);
    const staleSha = sha256Hex(Buffer.from("some other base content", "utf8"));

    const result = await commitEdit(fx.project, {
      relPath: CJK_DOC_PATH,
      baseSha256: staleSha,
      newBytes: Buffer.from(NEW_TEXT, "utf8"),
      message: "should not land",
    });

    expect(result).toEqual({ status: "conflict", currentSha256: before.sha256 });

    const onDisk = await readFile(path.join(fx.repo, CJK_DOC_PATH));
    expect(onDisk.equals(before.bytes)).toBe(true);

    const commitCount = (await fx.git("rev-list", "--count", "HEAD")).trim();
    expect(commitCount).toBe("1");
  });

  it("preserves bytes verbatim — no encoding transforms on the write path", async () => {
    // Deliberately not valid UTF-8: the store must never decode/re-encode.
    const rawBytes = Buffer.from([0xef, 0xbb, 0xbf, 0xe3, 0x80, 0x80, 0xff, 0xfe, 0x00, 0x41]);
    const before = await readDoc(fx.project, PLAIN_DOC_PATH);

    const result = await commitEdit(fx.project, {
      relPath: PLAIN_DOC_PATH,
      baseSha256: before.sha256,
      newBytes: rawBytes,
      message: "edit: raw bytes",
    });
    expect(result.status).toBe("committed");

    const onDisk = await readFile(path.join(fx.repo, PLAIN_DOC_PATH));
    expect(onDisk.equals(rawBytes)).toBe(true);

    const readBack = await readDoc(fx.project, PLAIN_DOC_PATH);
    expect(readBack.bytes.equals(rawBytes)).toBe(true);
    expect(readBack.sha256).toBe(sha256Hex(rawBytes));
  });

  it("rejects an empty commit message", async () => {
    const before = await readDoc(fx.project, PLAIN_DOC_PATH);
    await expect(
      commitEdit(fx.project, {
        relPath: PLAIN_DOC_PATH,
        baseSha256: before.sha256,
        newBytes: Buffer.from("x"),
        message: "   ",
      }),
    ).rejects.toThrow(/message/);
  });
});

describe("gitLog", () => {
  it("returns sha/date/subject entries newest first and respects limit", async () => {
    const before = await readDoc(fx.project, CJK_DOC_PATH);
    await commitEdit(fx.project, {
      relPath: CJK_DOC_PATH,
      baseSha256: before.sha256,
      newBytes: Buffer.from("second version\n", "utf8"),
      message: "second commit",
    });

    const entries = await gitLog(fx.project, CJK_DOC_PATH, 10);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.subject).toBe("second commit");
    expect(entries[1]?.subject).toBe("init fixture");
    for (const entry of entries) {
      expect(entry.sha).toMatch(/^[0-9a-f]{40}$/);
      expect(Number.isNaN(Date.parse(entry.date))).toBe(false);
    }

    const limited = await gitLog(fx.project, CJK_DOC_PATH, 1);
    expect(limited).toHaveLength(1);
    expect(limited[0]?.subject).toBe("second commit");
  });

  it("only shows commits touching the given path", async () => {
    const entries = await gitLog(fx.project, PLAIN_DOC_PATH, 10);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.subject).toBe("init fixture");
  });
});
