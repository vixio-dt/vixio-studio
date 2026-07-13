import { CubeTransparent } from "@phosphor-icons/react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { Button, MediaFrame, Skeleton } from "@/components/ui";
import type { Character } from "@/domain/types";
import type { ShotBlockout } from "@/lib/previz/blockout";
import {
  createPrevizStage,
  type PrevizStage,
  type StageRenderState,
} from "@/lib/previz/stage";

import { previzCopy } from "./copy";
import type { StageMode } from "./previzLogic";

type StageStatus =
  | { state: "starting" }
  | { state: "ready" }
  | { state: "failed"; message: string };

type DragState =
  | { kind: "block"; key: string; pointerId: number }
  | { kind: "stage-orbit"; pointerId: number; moved: boolean }
  | { kind: "key-orbit"; pointerId: number };

type StageViewportProps = {
  blockout: ShotBlockout | null;
  cast: readonly Character[];
  mode: StageMode;
  scrub: number;
  selectedBlockKey: string | null;
  onSelectBlock: (key: string | null) => void;
  onMoveBlock: (key: string, x: number, z: number) => void;
  onOrbitKeyframe: (yawDelta: number, pitchDelta: number) => void;
  onDollyKeyframe: (factor: number) => void;
};

/**
 * The Three.js viewport. Blocking mode drags mannequins and props on the
 * floor (empty space orbits the stage view); camera mode looks through the
 * shot camera at the scrub position and drags the active keyframe. WebGL
 * failure lands in an inline error state with a retry.
 */
export const StageViewport = ({
  blockout,
  cast,
  mode,
  scrub,
  selectedBlockKey,
  onSelectBlock,
  onMoveBlock,
  onOrbitKeyframe,
  onDollyKeyframe,
}: StageViewportProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<PrevizStage | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const lastPointRef = useRef({ x: 0, y: 0 });
  const [status, setStatus] = useState<StageStatus>({ state: "starting" });
  const [attempt, setAttempt] = useState(0);

  const renderStateRef = useRef<StageRenderState>({
    view: "stage",
    track: null,
    scrub: 0,
  });
  renderStateRef.current = {
    view: mode === "camera" ? "camera" : "stage",
    track: blockout?.camera ?? null,
    scrub,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const created = createPrevizStage(canvas);
    if (!created.ok) {
      setStatus({ state: "failed", message: created.error.message });
      return;
    }
    const stage = created.value;
    stageRef.current = stage;
    setStatus({ state: "ready" });

    const applySize = () => {
      const rect = wrapper.getBoundingClientRect();
      stage.resize(rect.width, rect.height, window.devicePixelRatio);
    };
    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(wrapper);

    let frame = requestAnimationFrame(function loop() {
      stage.render(renderStateRef.current);
      frame = requestAnimationFrame(loop);
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      stage.dispose();
      stageRef.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    stageRef.current?.syncBlockout(
      blockout,
      cast.map((character) => ({
        characterId: character.id,
        name: character.name,
      })),
    );
  }, [blockout, cast, status]);

  useEffect(() => {
    stageRef.current?.setSelected(selectedBlockKey);
  }, [selectedBlockKey, status]);

  const toNdc = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const stage = stageRef.current;
    if (!stage || !blockout) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    lastPointRef.current = { x: event.clientX, y: event.clientY };
    if (mode === "blocking") {
      const hit = stage.pick(toNdc(event));
      if (hit) {
        onSelectBlock(hit);
        dragRef.current = { kind: "block", key: hit, pointerId: event.pointerId };
      } else {
        dragRef.current = {
          kind: "stage-orbit",
          pointerId: event.pointerId,
          moved: false,
        };
      }
    } else {
      dragRef.current = { kind: "key-orbit", pointerId: event.pointerId };
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - lastPointRef.current.x;
    const dy = event.clientY - lastPointRef.current.y;
    lastPointRef.current = { x: event.clientX, y: event.clientY };
    if (drag.kind === "block") {
      const point = stage.groundPoint(toNdc(event));
      if (point) onMoveBlock(drag.key, point.x, point.z);
      return;
    }
    if (drag.kind === "stage-orbit") {
      if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;
      stage.orbitStage(-dx * 0.008, -dy * 0.008);
      return;
    }
    onOrbitKeyframe(-dx * 0.006, -dy * 0.006);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.kind === "stage-orbit" && !drag.moved) onSelectBlock(null);
    dragRef.current = null;
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const factor = Math.exp(event.deltaY * 0.001);
    if (mode === "blocking") {
      stage.dollyStage(factor);
      return;
    }
    onDollyKeyframe(factor);
  };

  return (
    <MediaFrame aspectRatio="16:9">
      <div ref={wrapperRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          data-testid="previz-canvas"
          className="h-full w-full touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
        />
        {status.state === "starting" ? (
          <Skeleton className="absolute inset-0" />
        ) : null}
        {status.state === "failed" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <CubeTransparent size={22} className="text-fg-muted" aria-hidden />
            <p className="text-sm text-fg">{previzCopy.stage.webglFailedTitle}</p>
            <p className="text-xs text-fg-secondary">
              {previzCopy.stage.webglFailedHint}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setStatus({ state: "starting" });
                setAttempt((current) => current + 1);
              }}
            >
              {previzCopy.stage.retry}
            </Button>
          </div>
        ) : null}
      </div>
    </MediaFrame>
  );
};
