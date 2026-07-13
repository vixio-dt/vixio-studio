import { useEffect, useRef, useState } from "react";

import { Button, Field, Segmented, Select } from "@/components/ui";
import { CAMERA_PRESETS } from "@/domain/constants";
import type { CameraPresetId } from "@/domain/types";
import type { CameraKeyframe, CameraTrack, Vec3 } from "@/lib/previz/blockout";
import {
  clampFocal,
  FOCAL_MAX,
  FOCAL_MIN,
  focalToFov,
  fovToFocal,
} from "@/lib/previz/cameraMath";

import { previzCopy } from "./copy";
import type { KeyframeId } from "./previzLogic";

type CameraPanelProps = {
  presetId: CameraPresetId;
  track: CameraTrack;
  activeKey: KeyframeId;
  onSelectPreset: (presetId: CameraPresetId) => void;
  onReseed: () => void;
  onSelectKeyframe: (key: KeyframeId) => void;
  onReplaceKeyframe: (key: KeyframeId, keyframe: CameraKeyframe) => void;
};

const AXES = ["x", "y", "z"] as const;
type Axis = (typeof AXES)[number];

/**
 * Compact numeric field that follows external edits (orbit drags) while the
 * user is not typing in it.
 */
const AxisInput = ({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) => {
  const [text, setText] = useState(value.toFixed(1));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setText(value.toFixed(1));
  }, [value]);

  return (
    <input
      type="number"
      step={0.1}
      aria-label={label}
      value={text}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        setText(value.toFixed(1));
      }}
      onChange={(event) => {
        setText(event.target.value);
        const parsed = Number(event.target.value);
        if (Number.isFinite(parsed)) onCommit(parsed);
      }}
      className="h-8 w-full border border-line-strong bg-ink-canvas px-2 font-mono text-xs text-fg transition-colors duration-150 focus:border-accent-media focus:outline-none"
    />
  );
};

/** Camera keyframe editing: preset, A/B pose fields, and focal length. */
export const CameraPanel = ({
  presetId,
  track,
  activeKey,
  onSelectPreset,
  onReseed,
  onSelectKeyframe,
  onReplaceKeyframe,
}: CameraPanelProps) => {
  const copy = previzCopy.camera;
  const keyframe = activeKey === "a" ? track.a : track.b;
  const focal = Math.round(clampFocal(fovToFocal(keyframe.fov)));

  const commitVec = (target: "position" | "lookAt", axis: Axis, value: number) => {
    const vec: Vec3 = { ...keyframe[target], [axis]: value };
    onReplaceKeyframe(activeKey, { ...keyframe, [target]: vec });
  };

  return (
    <section className="flex flex-col gap-4">
      <Field label={copy.presetLabel} helper={copy.presetHelper}>
        {({ inputId, describedBy }) => (
          <Select
            id={inputId}
            aria-describedby={describedBy}
            value={presetId}
            onChange={(event) =>
              onSelectPreset(event.target.value as CameraPresetId)
            }
          >
            {CAMERA_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="flex items-center justify-between gap-2">
        <Segmented
          size="sm"
          ariaLabel={copy.keyframeLabel}
          options={[
            { value: "a", label: copy.keyframeA },
            { value: "b", label: copy.keyframeB },
          ]}
          value={activeKey}
          onChange={onSelectKeyframe}
        />
        <Button size="sm" variant="ghost" onClick={onReseed}>
          {copy.reseed}
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-[11px] text-fg-muted">{copy.positionLabel}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {AXES.map((axis) => (
            <AxisInput
              key={`${activeKey}-position-${axis}`}
              label={`${copy.positionLabel} ${copy.axis[axis]}`}
              value={keyframe.position[axis]}
              onCommit={(value) => commitVec("position", axis, value)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-[11px] text-fg-muted">{copy.lookAtLabel}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {AXES.map((axis) => (
            <AxisInput
              key={`${activeKey}-lookat-${axis}`}
              label={`${copy.lookAtLabel} ${copy.axis[axis]}`}
              value={keyframe.lookAt[axis]}
              onCommit={(value) => commitVec("lookAt", axis, value)}
            />
          ))}
        </div>
      </div>

      <label className="flex min-w-0 flex-col gap-1">
        <span className="flex justify-between text-[11px] text-fg-muted">
          {copy.focalLabel}
          <span className="font-mono text-fg-secondary">
            {copy.focalValue(focal)}
          </span>
        </span>
        <input
          type="range"
          min={FOCAL_MIN}
          max={FOCAL_MAX}
          step={1}
          data-testid="previz-camera-fov"
          value={focal}
          onChange={(event) =>
            onReplaceKeyframe(activeKey, {
              ...keyframe,
              fov: focalToFov(clampFocal(Number(event.target.value))),
            })
          }
          className="h-6 w-full accent-accent-media"
        />
      </label>
    </section>
  );
};
