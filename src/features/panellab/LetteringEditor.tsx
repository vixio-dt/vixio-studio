import { Trash } from "@phosphor-icons/react";
import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { Button, Select, TextInput } from "@/components/ui";
import type { Balloon, BalloonKind, Character, Panel } from "@/domain/types";
import {
  BALLOON_FONT_STACK,
  layoutBalloon,
  LETTERING_INK,
  LETTERING_PAPER,
  spawnBalloonPosition,
} from "@/lib/comic/balloons";
import type { CharacterId } from "@/lib/id";
import { useProjectsStore } from "@/stores/projects";

import { panelLabCopy } from "./copy";
import { parseDialogueFromDescription } from "./panelLogic";

/**
 * Lettering mode: an SVG overlay on the panel art where balloons are dragged
 * into place, plus the control list where text, speaker, width, and tail are
 * edited. Balloon positions persist as 0..1 panel fractions.
 */

const BALLOON_KINDS: readonly BalloonKind[] = [
  "speech",
  "thought",
  "whisper",
  "burst",
  "caption",
  "sfx",
];

const KINDS_WITH_SPEAKER: readonly BalloonKind[] = [
  "speech",
  "thought",
  "whisper",
  "burst",
];

const KINDS_WITH_TAIL: readonly BalloonKind[] = ["speech", "thought"];

/** New balloons fan out by spawn order so a run of adds never stacks. */
const defaultBalloon = (kind: BalloonKind, spawnIndex: number): Balloon => {
  const position = spawnBalloonPosition(
    0.5,
    kind === "caption" ? 0.14 : 0.38,
    spawnIndex,
  );
  return {
    id: crypto.randomUUID(),
    kind,
    text: panelLabCopy.lettering.defaultText[kind],
    x: position.x,
    y: position.y,
    width: kind === "caption" ? 0.7 : kind === "sfx" ? 0.5 : 0.42,
    ...(KINDS_WITH_TAIL.includes(kind) ? { tailAngle: 115 } : {}),
  };
};

type DragState = {
  balloonId: string;
  /** Pointer-to-center offset in panel fractions, so grabs do not jump. */
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
};

type LetteringOverlayProps = {
  panel: Panel;
  /** Panel pixel size; drives the SVG coordinate space. */
  panelWidth: number;
  panelHeight: number;
};

/** The draggable balloon layer rendered inside the panel's MediaFrame. */
export const LetteringOverlay = ({
  panel,
  panelWidth,
  panelHeight,
}: LetteringOverlayProps) => {
  const updatePanel = useProjectsStore((state) => state.updatePanel);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const pointerFractions = (
    event: ReactPointerEvent,
  ): { x: number; y: number } => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0.5, y: 0.5 };
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  };

  const clamp = (value: number): number => Math.min(0.98, Math.max(0.02, value));

  const startDrag =
    (balloon: Balloon) => (event: ReactPointerEvent<SVGGElement>) => {
    // Dragging a balloon must not kick off the browser's native text
    // selection drag over the surrounding page.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointer = pointerFractions(event);
    setDrag({
      balloonId: balloon.id,
      offsetX: pointer.x - balloon.x,
      offsetY: pointer.y - balloon.y,
      x: balloon.x,
      y: balloon.y,
    });
  };

  const moveDrag = (event: ReactPointerEvent<SVGGElement>) => {
    if (!drag) return;
    event.preventDefault();
    const pointer = pointerFractions(event);
    setDrag({
      ...drag,
      x: clamp(pointer.x - drag.offsetX),
      y: clamp(pointer.y - drag.offsetY),
    });
  };

  const endDrag = () => {
    if (!drag) return;
    updatePanel(panel.id, {
      balloons: panel.balloons.map((balloon) =>
        balloon.id === drag.balloonId
          ? { ...balloon, x: drag.x, y: drag.y }
          : balloon,
      ),
    });
    setDrag(null);
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${panelWidth} ${panelHeight}`}
      preserveAspectRatio="none"
      className={`absolute inset-0 h-full w-full touch-none ${drag ? "select-none" : ""}`}
    >
      {panel.balloons.map((balloon) => {
        const live =
          drag && drag.balloonId === balloon.id
            ? { ...balloon, x: drag.x, y: drag.y }
            : balloon;
        const geometry = layoutBalloon(live, panelWidth, panelHeight);
        const firstLineY =
          geometry.cy - ((geometry.lines.length - 1) / 2) * geometry.lineHeight;
        const isSfx = geometry.kind === "sfx";
        return (
          <g
            key={balloon.id}
            onPointerDown={startDrag(balloon)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className={drag?.balloonId === balloon.id ? "cursor-grabbing" : "cursor-grab"}
          >
            {geometry.tailPath ? (
              <path
                d={geometry.tailPath}
                fill={LETTERING_PAPER}
                stroke={LETTERING_INK}
                strokeWidth={geometry.strokeWidth}
                strokeLinejoin="round"
              />
            ) : null}
            {geometry.bodyPath.length > 0 ? (
              <path
                d={geometry.bodyPath}
                fill={LETTERING_PAPER}
                stroke={LETTERING_INK}
                strokeWidth={geometry.strokeWidth}
                strokeLinejoin="round"
                strokeDasharray={
                  geometry.dashed
                    ? `${geometry.strokeWidth * 3} ${geometry.strokeWidth * 2.2}`
                    : undefined
                }
              />
            ) : null}
            <text
              textAnchor="middle"
              fontFamily={BALLOON_FONT_STACK}
              fontSize={geometry.fontSize}
              fontWeight={isSfx ? 700 : 600}
              fill={isSfx ? LETTERING_PAPER : LETTERING_INK}
              stroke={isSfx ? LETTERING_INK : undefined}
              strokeWidth={isSfx ? geometry.fontSize * 0.16 : undefined}
              style={isSfx ? { paintOrder: "stroke" } : undefined}
            >
              {geometry.lines.map((line, index) => (
                <tspan
                  key={index}
                  x={geometry.cx}
                  y={firstLineY + index * geometry.lineHeight}
                  dominantBaseline="middle"
                >
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

type LetteringControlsProps = {
  panel: Panel;
  /** Project cast for the speaker picker. */
  characters: readonly Character[];
};

/** Add-balloon row and the per-balloon edit list, under the stage. */
export const LetteringControls = ({ panel, characters }: LetteringControlsProps) => {
  const updatePanel = useProjectsStore((state) => state.updatePanel);

  const setBalloons = (balloons: Balloon[]) => updatePanel(panel.id, { balloons });

  const addBalloon = (kind: BalloonKind) =>
    setBalloons([...panel.balloons, defaultBalloon(kind, panel.balloons.length)]);

  const patchBalloon = (id: string, patch: Partial<Omit<Balloon, "id">>) =>
    setBalloons(
      panel.balloons.map((balloon) =>
        balloon.id === id ? { ...balloon, ...patch } : balloon,
      ),
    );

  const removeBalloon = (id: string) =>
    setBalloons(panel.balloons.filter((balloon) => balloon.id !== id));

  const existingTexts = useMemo(
    () => new Set(panel.balloons.map((balloon) => balloon.text.trim())),
    [panel.balloons],
  );
  const importableLines = useMemo(
    () =>
      parseDialogueFromDescription(panel.description, characters).filter(
        (line) => !existingTexts.has(line.text),
      ),
    [panel.description, characters, existingTexts],
  );

  const importDialogue = () => {
    if (importableLines.length === 0) return;
    const created = importableLines.map((line, offset) => {
      const spawnIndex = panel.balloons.length + offset;
      const position = spawnBalloonPosition(0.5, 0.38, spawnIndex);
      const balloon: Balloon = {
        id: crypto.randomUUID(),
        kind: "speech",
        text: line.text,
        x: position.x,
        y: position.y,
        width: 0.42,
        tailAngle: 115,
      };
      return line.characterId ? { ...balloon, characterId: line.characterId } : balloon;
    });
    setBalloons([...panel.balloons, ...created]);
  };

  return (
    <div className="flex flex-col gap-3 border border-line bg-ink-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-fg-secondary">
          {panelLabCopy.lettering.addLabel}
        </span>
        {BALLOON_KINDS.map((kind) => (
          <Button
            key={kind}
            variant="outline"
            size="sm"
            data-testid={`lettering-add-${kind}`}
            onClick={() => addBalloon(kind)}
          >
            {panelLabCopy.lettering.kinds[kind]}
          </Button>
        ))}
      </div>
      <p className="text-xs text-fg-muted">{panelLabCopy.lettering.hint}</p>

      <div className="flex flex-col gap-1.5 border-t border-line pt-3">
        <Button
          variant="outline"
          size="sm"
          data-testid="import-dialogue"
          disabled={importableLines.length === 0}
          onClick={importDialogue}
          className="self-start"
        >
          {panelLabCopy.lettering.importDialogue}
        </Button>
        <p className="text-xs text-fg-muted">
          {importableLines.length > 0
            ? panelLabCopy.lettering.importDialogueHint(importableLines.length)
            : panelLabCopy.lettering.importDialogueEmpty}
        </p>
      </div>

      {panel.balloons.length === 0 ? (
        <p className="text-xs text-fg-muted">{panelLabCopy.lettering.none}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {panel.balloons.map((balloon, position) => (
            <BalloonRow
              key={balloon.id}
              balloon={balloon}
              position={position + 1}
              characters={characters}
              onPatch={(patch) => patchBalloon(balloon.id, patch)}
              onRemove={() => removeBalloon(balloon.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
};

type BalloonRowProps = {
  balloon: Balloon;
  /** 1-based position in the list. */
  position: number;
  characters: readonly Character[];
  onPatch: (patch: Partial<Omit<Balloon, "id">>) => void;
  onRemove: () => void;
};

const BalloonRow = ({
  balloon,
  position,
  characters,
  onPatch,
  onRemove,
}: BalloonRowProps) => {
  const hasSpeaker = KINDS_WITH_SPEAKER.includes(balloon.kind);
  const hasTail = KINDS_WITH_TAIL.includes(balloon.kind);

  return (
    <li
      data-testid="balloon-item"
      className="flex flex-col gap-2 border border-line bg-ink-canvas p-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-fg-secondary">
          {panelLabCopy.lettering.balloonLabel(position)},{" "}
          {panelLabCopy.lettering.kinds[balloon.kind]}
        </span>
        <button
          type="button"
          aria-label={panelLabCopy.lettering.remove}
          title={panelLabCopy.lettering.remove}
          onClick={onRemove}
          className="flex size-7 items-center justify-center text-fg-muted transition-colors duration-150 hover:bg-danger/10 hover:text-danger"
        >
          <Trash size={14} aria-hidden />
        </button>
      </div>

      <TextInput
        value={balloon.text}
        aria-label={panelLabCopy.lettering.textLabel}
        onChange={(event) => onPatch({ text: event.target.value })}
        className="h-8 text-[13px]"
      />

      <div className="grid grid-cols-2 gap-2">
        {hasSpeaker ? (
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] text-fg-muted">
              {panelLabCopy.lettering.speakerLabel}
            </span>
            <Select
              value={balloon.characterId ?? ""}
              onChange={(event) =>
                onPatch({
                  characterId:
                    event.target.value.length > 0
                      ? (event.target.value as CharacterId)
                      : undefined,
                })
              }
              className="h-8 text-[13px]"
            >
              <option value="">{panelLabCopy.lettering.noSpeaker}</option>
              {characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}

        <label className="flex min-w-0 flex-col gap-1">
          <span className="flex justify-between text-[11px] text-fg-muted">
            {panelLabCopy.lettering.widthLabel}
            <span className="font-mono">{Math.round(balloon.width * 100)}%</span>
          </span>
          <input
            type="range"
            min={0.12}
            max={0.85}
            step={0.01}
            value={balloon.width}
            onChange={(event) => onPatch({ width: Number(event.target.value) })}
            className="h-8 w-full accent-accent-media"
          />
        </label>

        {hasTail ? (
          <label className="flex min-w-0 flex-col gap-1">
            <span className="flex justify-between text-[11px] text-fg-muted">
              {panelLabCopy.lettering.tailLabel}
              <span className="font-mono">{balloon.tailAngle ?? 115}</span>
            </span>
            <input
              type="range"
              min={-180}
              max={180}
              step={5}
              value={balloon.tailAngle ?? 115}
              onChange={(event) =>
                onPatch({ tailAngle: Number(event.target.value) })
              }
              className="h-8 w-full accent-accent-media"
            />
          </label>
        ) : null}

        <label className="flex min-w-0 flex-col gap-1">
          <span className="flex justify-between text-[11px] text-fg-muted">
            {panelLabCopy.lettering.fontScaleLabel}
            <span className="font-mono">
              {Math.round((balloon.fontScale ?? 1) * 100)}%
            </span>
          </span>
          <input
            type="range"
            data-testid="balloon-font-scale"
            min={0.5}
            max={2}
            step={0.1}
            value={balloon.fontScale ?? 1}
            onChange={(event) =>
              onPatch({ fontScale: Number(event.target.value) })
            }
            className="h-8 w-full accent-accent-media"
          />
        </label>
      </div>
    </li>
  );
};
