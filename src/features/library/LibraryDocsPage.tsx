import { FileText, PencilSimple } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { EmptyState } from "@/components/ui";

import { fetchDocs, formatBytes, topLevelDir, type DocEntry } from "./api";
import { ErrorRow, LibraryPage, LoadingRow, type Loadable } from "./chrome";

/**
 * /library/:projectId — every document in the project checkout, grouped by
 * top-level directory in repo order. Click-through opens the parsed view;
 * the pencil jumps straight to the byte-faithful editor.
 */
export const LibraryDocsPage = () => {
  const { projectId = "" } = useParams<{ projectId: string }>();
  // Keyed by projectId: a result for a previous project renders as loading,
  // and no state write happens synchronously inside the effect.
  const [settled, setSettled] = useState<{
    key: string;
    load: Loadable<DocEntry[]>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDocs(projectId)
      .then((docs) => {
        if (!cancelled) {
          setSettled({ key: projectId, load: { state: "ready", data: docs } });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSettled({
            key: projectId,
            load: {
              state: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "could not load documents",
            },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const load = useMemo<Loadable<DocEntry[]>>(
    () =>
      settled !== null && settled.key === projectId
        ? settled.load
        : { state: "loading" },
    [settled, projectId],
  );

  const groups = useMemo(() => {
    if (load.state !== "ready") return [];
    const byDir = new Map<string, DocEntry[]>();
    for (const doc of load.data) {
      const dir = topLevelDir(doc.relPath);
      const bucket = byDir.get(dir);
      if (bucket) bucket.push(doc);
      else byDir.set(dir, [doc]);
    }
    return [...byDir.entries()];
  }, [load]);

  const docHref = (doc: DocEntry) =>
    `/library/${encodeURIComponent(projectId)}/doc?path=${encodeURIComponent(doc.relPath)}`;
  const editHref = (doc: DocEntry) =>
    `/library/${encodeURIComponent(projectId)}/edit?path=${encodeURIComponent(doc.relPath)}`;

  return (
    <LibraryPage backTo="/library" backLabel="Library" title={projectId}>
      {load.state === "loading" ? (
        <LoadingRow label="Loading documents…" />
      ) : load.state === "error" ? (
        <ErrorRow message={load.message} />
      ) : load.data.length === 0 ? (
        <div className="border border-line bg-ink-panel">
          <EmptyState
            icon={FileText}
            title="No documents"
            hint="This project's checkout has no tracked documents yet."
          />
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(([dir, docs]) => (
            <section key={dir} aria-label={dir}>
              <h2 className="font-mono text-xs uppercase tracking-wide text-fg-muted">
                {dir}
              </h2>
              <ul className="mt-2 divide-y divide-line border border-line bg-ink-panel">
                {docs.map((doc) => (
                  <li
                    key={doc.relPath}
                    className="flex items-stretch justify-between gap-2"
                  >
                    <Link
                      to={docHref(doc)}
                      data-testid="library-doc-item"
                      className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-ink-hover"
                    >
                      <FileText
                        size={16}
                        className="shrink-0 text-fg-muted"
                        aria-hidden
                      />
                      <span className="truncate font-mono text-[13px]">
                        {doc.relPath}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-xs text-fg-muted">
                        {formatBytes(doc.size)}
                      </span>
                    </Link>
                    <Link
                      to={editHref(doc)}
                      aria-label={`Edit ${doc.relPath}`}
                      className="flex w-11 shrink-0 items-center justify-center text-fg-muted transition-colors duration-150 hover:bg-ink-hover hover:text-fg"
                    >
                      <PencilSimple size={16} aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </LibraryPage>
  );
};
