import type { ManifestView, ManifestViewRow } from "../api";
import { KindChip } from "./shared";

/**
 * Manifest view: the generation ledger as a table — status census as chips
 * above, then one row per manifest record. Cell values arrive in the
 * parser's shapes (`panel: { kind, raw }`, `version: { raw }`,
 * `imageLink: { kind, value }`), so cells fall back through raw/value
 * representations rather than assuming any one of them.
 */

const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record["raw"] === "string") return record["raw"];
    if (typeof record["value"] === "string") return record["value"];
  }
  return String(value);
};

const statusTone = (status: string): "neutral" | "accent" | "danger" => {
  if (status === "completed") return "accent";
  if (status === "refused-filter" || status === "invalidated") return "danger";
  return "neutral";
};

const Row = ({ row }: { row: ManifestViewRow }) => (
  <tr className="border-t border-line align-top">
    <td className="px-3 py-2 font-mono text-xs">{cellText(row.page)}</td>
    <td className="px-3 py-2 font-mono text-xs">{cellText(row.panel)}</td>
    <td className="px-3 py-2 font-mono text-xs">{cellText(row.version)}</td>
    <td className="px-3 py-2 font-mono text-xs text-fg-muted">
      {row.seed === null || row.seed === undefined ? "" : String(row.seed)}
    </td>
    <td className="px-3 py-2">
      {row.status !== undefined ? (
        <KindChip label={row.status} tone={statusTone(row.status)} />
      ) : null}
    </td>
    <td className="max-w-48 truncate px-3 py-2 font-mono text-xs text-fg-muted">
      {cellText(row.imageLink)}
    </td>
    <td className="px-3 py-2 text-xs text-fg-secondary">
      {row.promptSummary ?? ""}
    </td>
  </tr>
);

export const ManifestDocView = ({ view }: { view: ManifestView }) => {
  const rows = view.rows ?? [];
  const census = Object.entries(view.statusCensus ?? {});
  return (
    <div data-testid="library-view-manifest" className="flex flex-col gap-4">
      {census.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {census.map(([status, count]) => (
            <span key={status} className="inline-flex items-center gap-1.5">
              <KindChip label={status} tone={statusTone(status)} />
              <span className="font-mono text-xs text-fg-secondary">{count}</span>
            </span>
          ))}
          <span className="ml-auto font-mono text-xs text-fg-muted">
            {rows.length} rows
          </span>
        </div>
      ) : null}
      <div className="overflow-x-auto border border-line bg-ink-panel">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="text-xs text-fg-muted">
              <th className="px-3 py-2 font-mono font-normal">page</th>
              <th className="px-3 py-2 font-mono font-normal">panel</th>
              <th className="px-3 py-2 font-mono font-normal">version</th>
              <th className="px-3 py-2 font-mono font-normal">seed</th>
              <th className="px-3 py-2 font-mono font-normal">status</th>
              <th className="px-3 py-2 font-mono font-normal">image_link</th>
              <th className="px-3 py-2 font-mono font-normal">prompt_summary</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <Row key={index} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
