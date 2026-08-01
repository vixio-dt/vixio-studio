import { Eye, EyeSlash, PencilSimple, Question } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { fetchView, type DocView, type UnknownView } from "./api";
import { ErrorRow, LibraryPage, LoadingRow, type Loadable } from "./chrome";
import { CanonDocView } from "./views/CanonDocView";
import { DesignDocView } from "./views/DesignDocView";
import { ManifestDocView } from "./views/ManifestDocView";
import { OpenQuestionsDocView } from "./views/OpenQuestionsDocView";
import { RawDocView } from "./views/RawDocView";
import { ScriptDocView } from "./views/ScriptDocView";

/**
 * /library/:projectId/doc?path=… — the parsed read view of one document,
 * rendered per kind. The author's-drawer toggle re-fetches the view with
 * `drawer=author`; the private material never reaches the client otherwise.
 */

const UnknownDocView = ({
  view,
  editHref,
}: {
  view: UnknownView;
  editHref: string;
}) => (
  <div
    data-testid="library-view-unknown"
    className="flex flex-col items-center gap-3 border border-line bg-ink-panel px-6 py-16 text-center"
  >
    <Question size={28} className="text-fg-muted" aria-hidden />
    <div>
      <p className="font-display text-base font-bold tracking-[-0.02em]">
        Unfamiliar view kind
      </p>
      <p className="mt-1 text-sm text-fg-secondary">
        The server sent a{" "}
        <span className="font-mono text-[13px]">{view.actualKind}</span> view
        this client does not render yet. The bytes are still reachable through
        the editor.
      </p>
    </div>
    <Link
      to={editHref}
      className="mt-2 inline-flex h-9 items-center gap-2 border border-line-strong px-3 text-sm transition-colors duration-150 hover:bg-ink-hover"
    >
      <PencilSimple size={16} aria-hidden />
      Open in editor
    </Link>
  </div>
);

export const LibraryDocPage = () => {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const path = searchParams.get("path") ?? "";
  const [drawerOpen, setDrawerOpen] = useState(false);

  // One fetch per (project, path, drawer) key; results for any other key
  // render as loading, so the effect never writes state synchronously.
  const viewKey = `${projectId}\u0000${path}\u0000${drawerOpen ? "author" : ""}`;
  const [settled, setSettled] = useState<{
    key: string;
    load: Loadable<DocView>;
  } | null>(null);

  useEffect(() => {
    if (path === "") return;
    let cancelled = false;
    fetchView(projectId, path, drawerOpen ? { drawer: "author" } : {})
      .then((view) => {
        if (!cancelled) {
          setSettled({ key: viewKey, load: { state: "ready", data: view } });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSettled({
            key: viewKey,
            load: {
              state: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "could not load the view",
            },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, path, drawerOpen, viewKey]);

  const load: Loadable<DocView> =
    path === ""
      ? { state: "error", message: "missing ?path= query parameter" }
      : settled !== null && settled.key === viewKey
        ? settled.load
        : { state: "loading" };

  const editHref = `/library/${encodeURIComponent(projectId)}/edit?path=${encodeURIComponent(path)}`;

  const renderView = (view: DocView) => {
    switch (view.kind) {
      case "script":
        return <ScriptDocView view={view} />;
      case "canon":
        return <CanonDocView view={view} />;
      case "open-questions":
        return <OpenQuestionsDocView view={view} />;
      case "design":
        return <DesignDocView view={view} />;
      case "manifest":
        return <ManifestDocView view={view} />;
      case "raw":
        return <RawDocView view={view} editHref={editHref} />;
      case "unknown":
        return <UnknownDocView view={view} editHref={editHref} />;
    }
  };

  return (
    <LibraryPage
      backTo={`/library/${encodeURIComponent(projectId)}`}
      backLabel={projectId}
      title={path}
      actions={
        <>
          <button
            type="button"
            data-testid="drawer-toggle"
            aria-pressed={drawerOpen}
            onClick={() => setDrawerOpen((open) => !open)}
            className={`inline-flex h-8 items-center gap-2 border px-2.5 text-[13px] transition-colors duration-150 ${
              drawerOpen
                ? "border-danger/40 bg-danger/10 text-danger"
                : "border-line-strong text-fg-secondary hover:bg-ink-hover hover:text-fg"
            }`}
          >
            {drawerOpen ? (
              <Eye size={15} aria-hidden />
            ) : (
              <EyeSlash size={15} aria-hidden />
            )}
            Author&#39;s drawer
          </button>
          <Link
            to={editHref}
            className="inline-flex h-8 items-center gap-2 border border-line-strong px-2.5 text-[13px] text-fg-secondary transition-colors duration-150 hover:bg-ink-hover hover:text-fg"
          >
            <PencilSimple size={15} aria-hidden />
            Edit
          </Link>
        </>
      }
    >
      {load.state === "loading" ? (
        <LoadingRow label="Loading view…" />
      ) : load.state === "error" ? (
        <ErrorRow message={load.message} />
      ) : (
        renderView(load.data)
      )}
    </LibraryPage>
  );
};
