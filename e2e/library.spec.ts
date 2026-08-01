import { expect, test, type Page } from "@playwright/test";

import { gotoApp } from "./helpers";

/**
 * Library (wiki + editor) against a fully mocked /api — no server process.
 * Every request is intercepted with page.route and answered from fixtures,
 * and the editor test asserts on the exact bytes the app tried to commit.
 */

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const PROJECT = { id: "hth", name: "Howl To Heaven" };

const CANON_PATH = "00_canon/world-rules.txt";
const SCRIPT_PATH = "01_script/ep0-script.txt";

const DOCS = [
  { relPath: CANON_PATH, size: 4096 },
  { relPath: "00_canon/open-questions.txt", size: 2048 },
  { relPath: SCRIPT_PATH, size: 20480 },
];

const HUA_RAW = "黑板前，少年逆光而立，粉筆灰浮在光柱裏。";

const SCRIPT_VIEW = {
  kind: "script",
  pages: [
    {
      pageStart: 1,
      pageEnd: null,
      attrRaw: "2格",
      declaredPanelCount: 2,
      panels: [
        {
          ordinal: 1,
          implicit: false,
          attrRaw: null,
          fields: [
            { kind: "畫", paren: null, raw: HUA_RAW },
            { kind: "白", paren: "少年", raw: "……我聽見了。" },
          ],
        },
        {
          ordinal: 2,
          implicit: false,
          attrRaw: "橫長",
          fields: [{ kind: "音", paren: null, raw: "咚——" }],
        },
      ],
    },
  ],
};

const SECRET_BODY = "私人燃料：只寫給作者自己的一段話。";

const canonView = (drawer: boolean) => ({
  kind: "canon",
  sections: [
    {
      headingRaw: "第一章　世界之初",
      title: "世界之初",
      neverShip: false,
      body: "世界由歌聲誕生。",
    },
    {
      headingRaw: "第十章　宇宙底層（私人燃料，永不入作品）",
      title: "宇宙底層（私人燃料，永不入作品）",
      neverShip: true,
      body: drawer ? SECRET_BODY : { redacted: true },
    },
  ],
});

/** Loaded editor content: U+3000 indent and a final newline, both must survive. */
const DOC_TEXT = "第一章　世界之初\n　世界由歌聲誕生。\n";
const DOC_SHA = "0123456789abcdef".repeat(4);
const NEW_SHA = "fedcba9876543210".repeat(4);
const CURRENT_SHA = "aaaabbbbccccdddd".repeat(4);

/* ------------------------------------------------------------------ */
/* Mock API                                                            */
/* ------------------------------------------------------------------ */

type EditBody = {
  path: string;
  baseSha256: string;
  contentBase64: string;
  message: string;
};

type ApiState = {
  viewRequests: { path: string | null; drawer: string | null }[];
  editRequests: EditBody[];
  /** Responses consumed per POST /edit, in order; empty = committed. */
  editPlan: { status: number; json: unknown }[];
};

const newApiState = (): ApiState => ({
  viewRequests: [],
  editRequests: [],
  editPlan: [],
});

const installApi = async (page: Page, state: ApiState): Promise<void> => {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname, searchParams } = url;

    if (pathname === "/api/projects") {
      return route.fulfill({ json: [PROJECT] });
    }
    if (pathname === `/api/projects/${PROJECT.id}/docs`) {
      return route.fulfill({ json: DOCS });
    }
    if (pathname === `/api/projects/${PROJECT.id}/view`) {
      const path = searchParams.get("path");
      const drawer = searchParams.get("drawer");
      state.viewRequests.push({ path, drawer });
      if (path === SCRIPT_PATH) return route.fulfill({ json: SCRIPT_VIEW });
      if (path === CANON_PATH) {
        return route.fulfill({ json: canonView(drawer === "author") });
      }
      return route.fulfill({ json: { kind: "raw", path, size: 2048 } });
    }
    if (pathname === `/api/projects/${PROJECT.id}/doc`) {
      const path = searchParams.get("path");
      return route.fulfill({
        json: {
          path,
          sha256: DOC_SHA,
          size: Buffer.byteLength(DOC_TEXT, "utf8"),
          contentBase64: Buffer.from(DOC_TEXT, "utf8").toString("base64"),
        },
      });
    }
    if (
      pathname === `/api/projects/${PROJECT.id}/edit` &&
      request.method() === "POST"
    ) {
      state.editRequests.push(request.postDataJSON() as EditBody);
      const planned = state.editPlan.shift() ?? {
        status: 200,
        json: { status: "committed", commitSha: "abc1234def", newSha256: NEW_SHA },
      };
      return route.fulfill({ status: planned.status, json: planned.json });
    }
    return route.fulfill({ status: 404, json: { error: "unmocked api call" } });
  });
};

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

test.describe("library", () => {
  test("projects → docs → script view renders a panel's 畫 field verbatim", async ({
    page,
  }) => {
    const state = newApiState();
    await installApi(page, state);

    await gotoApp(page, "/library");
    const projectItem = page.getByTestId("library-project-item");
    await expect(projectItem).toHaveCount(1);
    await expect(projectItem).toContainText("Howl To Heaven");
    await projectItem.click();

    // Doc list, grouped by top-level dir.
    await expect(page).toHaveURL(/\/library\/hth$/);
    await expect(page.getByTestId("library-doc-item")).toHaveCount(3);
    await expect(page.getByRole("heading", { name: "00_canon" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "01_script" })).toBeVisible();

    await page
      .getByTestId("library-doc-item")
      .filter({ hasText: SCRIPT_PATH })
      .click();

    await expect(page.getByTestId("library-view-script")).toBeVisible();
    const pageCard = page.getByTestId("library-script-page");
    await expect(pageCard).toContainText("第1頁");
    await pageCard.locator("summary").click();
    await expect(page.getByTestId("library-view-script")).toContainText(HUA_RAW);
    // Field kind labels ride along with the raw text.
    await expect(page.getByTestId("library-view-script")).toContainText("畫");
    await expect(page.getByTestId("library-view-script")).toContainText(
      "……我聽見了。",
    );
  });

  test("canon view seals never-ship bodies until the author's drawer refetches with drawer=author", async ({
    page,
  }) => {
    const state = newApiState();
    await installApi(page, state);

    await gotoApp(
      page,
      `/library/hth/doc?path=${encodeURIComponent(CANON_PATH)}`,
    );

    await expect(page.getByTestId("library-view-canon")).toBeVisible();
    await expect(page.getByTestId("library-canon-redacted")).toBeVisible();
    // The private body is not in the DOM at all — the server never sent it.
    await expect(page.getByText(SECRET_BODY)).toHaveCount(0);
    expect(state.viewRequests.at(-1)?.drawer).toBeNull();

    await page.getByTestId("drawer-toggle").click();

    await expect(page.getByText(SECRET_BODY)).toBeVisible();
    await expect(page.getByTestId("library-canon-redacted")).toHaveCount(0);
    // The reveal came from a real refetch with drawer=author, not client state.
    expect(state.viewRequests.at(-1)).toEqual({
      path: CANON_PATH,
      drawer: "author",
    });
  });

  test("editor round-trips exact bytes, surfaces a conflict, then clears it on commit", async ({
    page,
  }) => {
    const state = newApiState();
    await installApi(page, state);

    await gotoApp(
      page,
      `/library/hth/edit?path=${encodeURIComponent(CANON_PATH)}`,
    );

    const editor = page.getByTestId("editor");
    await expect(editor).toBeVisible();
    await expect(editor).toContainText("世界由歌聲誕生");

    // Replace the whole document with new text ending in a newline.
    await editor.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText("全新內容");
    await page.keyboard.press("Enter");
    await expect(editor).toContainText("全新內容");

    // First save: the server reports a concurrent change.
    state.editPlan.push({
      status: 409,
      json: { status: "conflict", currentSha256: CURRENT_SHA },
    });
    await page.getByTestId("editor-save").click();
    await expect(page.getByTestId("conflict-banner")).toBeVisible();

    expect(state.editRequests).toHaveLength(1);
    const firstEdit = state.editRequests[0];
    // Precondition is the sha the doc was served with — the original base.
    expect(firstEdit.baseSha256).toBe(DOC_SHA);
    // The committed bytes decode to exactly the edited text: no trim, no
    // normalization, final newline preserved.
    expect(Buffer.from(firstEdit.contentBase64, "base64").toString("utf8")).toBe(
      "全新內容\n",
    );
    expect(firstEdit.path).toBe(CANON_PATH);
    expect(firstEdit.message).toBe(`edit: ${CANON_PATH}`);

    // Second save succeeds (default plan = committed): the banner clears.
    await page.getByTestId("editor-save").click();
    await expect(page.getByTestId("conflict-banner")).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("Committed");
    expect(state.editRequests).toHaveLength(2);
    expect(state.editRequests[1].baseSha256).toBe(DOC_SHA);
  });
});
