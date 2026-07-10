import type { Character, GenerationTask } from "@/domain/types";
import type { CharacterId, PanelId, TaskId } from "@/lib/id";

/** Task scans for the panel lab, mirroring the frame lab's discipline. */

const isPanelTaskFor = (task: GenerationTask, panelId: PanelId): boolean =>
  task.target.kind === "panel-image" && task.target.panelId === panelId;

/** Queued or running panel-image tasks for one panel, oldest first. */
export const activePanelTasks = (
  tasks: Record<TaskId, GenerationTask>,
  panelId: PanelId,
): GenerationTask[] =>
  Object.values(tasks)
    .filter(
      (task) =>
        isPanelTaskFor(task, panelId) &&
        (task.status.state === "queued" || task.status.state === "running"),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export type PanelFailure = {
  taskId: TaskId;
  message: string;
};

/**
 * The newest failed panel-image task for this panel, suppressed once a newer
 * attempt is in flight or has already succeeded.
 */
export const latestPanelFailure = (
  tasks: Record<TaskId, GenerationTask>,
  panelId: PanelId,
): PanelFailure | null => {
  let failed: GenerationTask | null = null;
  let newestOther: string | null = null;
  for (const task of Object.values(tasks)) {
    if (!isPanelTaskFor(task, panelId)) continue;
    if (task.status.state === "failed") {
      if (!failed || task.createdAt > failed.createdAt) failed = task;
    } else if (!newestOther || task.createdAt > newestOther) {
      newestOther = task.createdAt;
    }
  }
  if (!failed || failed.status.state !== "failed") return null;
  if (newestOther && newestOther > failed.createdAt) return null;
  return { taskId: failed.id, message: failed.status.message };
};

/* ------------------------------------------------------------------ */
/* Dialogue import                                                     */
/* ------------------------------------------------------------------ */

/** One line of `Name: text` dialogue found in a panel description. */
export type ParsedDialogueLine = {
  speakerName: string;
  characterId: CharacterId | undefined;
  text: string;
};

/** A line reads as a speaker cue: "Name:" or "NAME:" followed by the line. */
const SPEAKER_LINE = /^([A-Za-z][A-Za-z' -]{0,39}):\s*(.+)$/;

/** All-caps speaker cues ("GUARD:") read as dialogue even with no cast match. */
const isCapsSpeaker = (name: string): boolean => /^[A-Z][A-Z' -]*$/.test(name);

/**
 * Parses a panel description for screenplay-style dialogue: one line per
 * speaker cue, matched case-insensitively against the project's cast, or
 * accepted on its own when the cue reads as a generic all-caps speaker.
 * Lines with neither a cast match nor an all-caps cue are left as prose.
 */
export const parseDialogueFromDescription = (
  description: string,
  characters: readonly Character[],
): ParsedDialogueLine[] => {
  const lines: ParsedDialogueLine[] = [];
  for (const rawLine of description.split(/\r?\n/)) {
    const match = SPEAKER_LINE.exec(rawLine.trim());
    if (!match) continue;
    const speakerName = match[1]?.trim() ?? "";
    const text = match[2]?.trim() ?? "";
    if (speakerName.length === 0 || text.length === 0) continue;
    const character = characters.find(
      (candidate) => candidate.name.toLowerCase() === speakerName.toLowerCase(),
    );
    if (!character && !isCapsSpeaker(speakerName)) continue;
    lines.push({ speakerName, characterId: character?.id, text });
  }
  return lines;
};
