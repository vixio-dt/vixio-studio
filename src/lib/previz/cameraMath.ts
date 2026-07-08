import type { CameraPresetId } from "@/domain/types";

import type { CameraKeyframe, CameraTrack, Vec3 } from "./blockout";

/**
 * Pure camera math for the previz stage: focal-length conversions, the
 * ease-in-out interpolation between the two keyframes (with an arc mode for
 * orbital moves), and the seed poses each camera preset starts from.
 * Everything here is deterministic and framework-free so the interactive
 * stage and the offscreen capture render the exact same move.
 */

/* ------------------------------------------------------------------ */
/* Focal length <-> vertical field of view (full-frame, 24mm sensor)   */
/* ------------------------------------------------------------------ */

export const FOCAL_MIN = 16;
export const FOCAL_MAX = 135;

export const focalToFov = (focalMm: number): number =>
  (2 * Math.atan(12 / focalMm) * 180) / Math.PI;

export const fovToFocal = (fovDegrees: number): number =>
  12 / Math.tan((fovDegrees * Math.PI) / 360);

export const clampFocal = (focalMm: number): number =>
  Math.min(FOCAL_MAX, Math.max(FOCAL_MIN, focalMm));

/* ------------------------------------------------------------------ */
/* Vector helpers                                                      */
/* ------------------------------------------------------------------ */

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerpVec3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  z: lerp(a.z, b.z, t),
});

/** Smoothstep ease-in-out; the one easing previz uses everywhere. */
export const easeInOut = (t: number): number => {
  const clamped = clamp01(t);
  return clamped * clamped * (3 - 2 * clamped);
};

/* ------------------------------------------------------------------ */
/* Interpolation                                                       */
/* ------------------------------------------------------------------ */

export type CameraPose = {
  position: Vec3;
  lookAt: Vec3;
  fov: number;
};

const normalizeAngle = (angle: number): number => {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result <= -Math.PI) result += Math.PI * 2;
  return result;
};

/**
 * Samples the camera move at t in [0, 1] with ease-in-out. Linear tracks
 * lerp position and lookAt; arc tracks sweep the camera around the lookAt
 * point (radius and height interpolated), which is what orbital presets
 * need since a straight lerp would cut through the subject.
 */
export const sampleCameraTrack = (track: CameraTrack, t: number): CameraPose => {
  const eased = easeInOut(t);
  const fov = lerp(track.a.fov, track.b.fov, eased);
  const lookAt = lerpVec3(track.a.lookAt, track.b.lookAt, eased);

  if (track.mode === "linear") {
    return {
      position: lerpVec3(track.a.position, track.b.position, eased),
      lookAt,
      fov,
    };
  }

  const offsetA = {
    x: track.a.position.x - track.a.lookAt.x,
    z: track.a.position.z - track.a.lookAt.z,
  };
  const offsetB = {
    x: track.b.position.x - track.b.lookAt.x,
    z: track.b.position.z - track.b.lookAt.z,
  };
  const radiusA = Math.hypot(offsetA.x, offsetA.z);
  const radiusB = Math.hypot(offsetB.x, offsetB.z);
  const angleA = Math.atan2(offsetA.x, offsetA.z);
  const angleB = Math.atan2(offsetB.x, offsetB.z);
  const sweep = normalizeAngle(angleB - angleA) + track.arcTurns * Math.PI * 2;
  const angle = angleA + sweep * eased;
  const radius = lerp(radiusA, radiusB, eased);
  return {
    position: {
      x: lookAt.x + Math.sin(angle) * radius,
      y: lerp(track.a.position.y, track.b.position.y, eased),
      z: lookAt.z + Math.cos(angle) * radius,
    },
    lookAt,
    fov,
  };
};

/* ------------------------------------------------------------------ */
/* Keyframe editing helpers (orbit-style drag, dolly)                  */
/* ------------------------------------------------------------------ */

const MIN_ORBIT_RADIUS = 0.4;
const MAX_ORBIT_RADIUS = 60;

/** Rotates the keyframe camera around its lookAt point (drag-to-orbit). */
export const orbitKeyframe = (
  keyframe: CameraKeyframe,
  yawDelta: number,
  pitchDelta: number,
): CameraKeyframe => {
  const offset = {
    x: keyframe.position.x - keyframe.lookAt.x,
    y: keyframe.position.y - keyframe.lookAt.y,
    z: keyframe.position.z - keyframe.lookAt.z,
  };
  const radius = Math.max(
    Math.hypot(offset.x, offset.y, offset.z),
    MIN_ORBIT_RADIUS,
  );
  const theta = Math.atan2(offset.x, offset.z) + yawDelta;
  const rawPhi = Math.acos(Math.min(1, Math.max(-1, offset.y / radius)));
  const phi = Math.min(Math.PI - 0.12, Math.max(0.12, rawPhi + pitchDelta));
  return {
    ...keyframe,
    position: {
      x: keyframe.lookAt.x + radius * Math.sin(phi) * Math.sin(theta),
      y: keyframe.lookAt.y + radius * Math.cos(phi),
      z: keyframe.lookAt.z + radius * Math.sin(phi) * Math.cos(theta),
    },
  };
};

/** Moves the keyframe camera toward or away from its lookAt point. */
export const dollyKeyframe = (
  keyframe: CameraKeyframe,
  factor: number,
): CameraKeyframe => {
  const offset = {
    x: keyframe.position.x - keyframe.lookAt.x,
    y: keyframe.position.y - keyframe.lookAt.y,
    z: keyframe.position.z - keyframe.lookAt.z,
  };
  const radius = Math.max(
    Math.hypot(offset.x, offset.y, offset.z),
    MIN_ORBIT_RADIUS,
  );
  const next = Math.min(
    MAX_ORBIT_RADIUS,
    Math.max(MIN_ORBIT_RADIUS, radius * factor),
  );
  const scale = next / radius;
  return {
    ...keyframe,
    position: {
      x: keyframe.lookAt.x + offset.x * scale,
      y: keyframe.lookAt.y + offset.y * scale,
      z: keyframe.lookAt.z + offset.z * scale,
    },
  };
};

/* ------------------------------------------------------------------ */
/* Preset seeds                                                        */
/* ------------------------------------------------------------------ */

const rotateAroundY = (position: Vec3, center: Vec3, degrees: number): Vec3 => {
  const radians = (degrees * Math.PI) / 180;
  const dx = position.x - center.x;
  const dz = position.z - center.z;
  return {
    x: center.x + dx * Math.cos(radians) + dz * Math.sin(radians),
    y: position.y,
    z: center.z - dx * Math.sin(radians) + dz * Math.cos(radians),
  };
};

/**
 * Seeds a camera track for a preset around the given subject point (the
 * mannequin centroid, or stage origin). Positions treat +z as "in front of
 * the subject" and heights are absolute stage meters.
 */
export const seedCameraTrack = (
  presetId: CameraPresetId,
  subject: Vec3,
): CameraTrack => {
  const at = (dx: number, height: number, dz: number): Vec3 => ({
    x: subject.x + dx,
    y: height,
    z: subject.z + dz,
  });
  const keyframe = (
    position: Vec3,
    focalMm: number,
    lookAt: Vec3 = subject,
  ): CameraKeyframe => ({ position, lookAt, fov: focalToFov(focalMm) });
  const linear = (a: CameraKeyframe, b: CameraKeyframe): CameraTrack => ({
    a,
    b,
    mode: "linear",
    arcTurns: 0,
  });
  const arc = (
    a: CameraKeyframe,
    b: CameraKeyframe,
    arcTurns = 0,
  ): CameraTrack => ({ a, b, mode: "arc", arcTurns });
  const swungBy = (a: CameraKeyframe, degrees: number): CameraKeyframe => ({
    ...a,
    position: rotateAroundY(a.position, a.lookAt, degrees),
  });

  switch (presetId) {
    case "static":
      return linear(keyframe(at(0, 1.6, 6), 35), keyframe(at(0, 1.6, 6), 35));
    case "dolly-in":
      return linear(
        keyframe(at(0, 1.6, 7.5), 35),
        keyframe(at(0, 1.5, 2.8), 35),
      );
    case "dolly-out":
      return linear(
        keyframe(at(0, 1.5, 2.8), 35),
        keyframe(at(0, 1.6, 7.5), 35),
      );
    case "crash-zoom-in":
      return linear(keyframe(at(0, 1.6, 8), 28), keyframe(at(0, 1.6, 8), 110));
    case "dolly-zoom-in":
      return linear(
        keyframe(at(0, 1.6, 7.5), 65),
        keyframe(at(0, 1.5, 3), 24),
      );
    case "whip-pan":
      return linear(
        keyframe(at(0, 1.7, 6), 35, at(-8, 1.6, 0)),
        keyframe(at(0, 1.7, 6), 35),
      );
    case "crane-up":
      return linear(
        keyframe(at(0, 1.2, 6.5), 32),
        keyframe(at(0, 7.5, 7.5), 32),
      );
    case "crane-over-head":
      return linear(
        keyframe(at(0, 1.7, 5.5), 32),
        keyframe(at(0, 8.5, 0.6), 32, at(0, 0.5, 0)),
      );
    case "orbit-360": {
      const start = keyframe(at(0, 2, 6), 35);
      return arc(start, { ...start }, 1);
    }
    case "arc-left": {
      const start = keyframe(at(0, 1.8, 6), 35);
      return arc(start, swungBy(start, 75));
    }
    case "arc-right": {
      const start = keyframe(at(0, 1.8, 6), 35);
      return arc(start, swungBy(start, -75));
    }
    case "snorricam": {
      const start = keyframe(at(0, 1.5, 1.4), 24, at(0, 1.5, 0));
      return arc(start, swungBy(start, 25));
    }
    case "fpv-drone":
      return linear(
        keyframe(at(3.5, 4.5, 9), 16),
        keyframe(at(0, 1.2, 2), 16),
      );
    case "handheld":
      return linear(
        keyframe(at(0.15, 1.55, 5.2), 35, at(0.1, 1.45, 0)),
        keyframe(at(-0.12, 1.65, 5), 35, at(-0.08, 1.5, 0)),
      );
    case "bullet-time": {
      const start = keyframe(at(0, 1.6, 4.5), 50);
      return arc(start, swungBy(start, 150));
    }
    case "dutch-angle":
      return linear(
        keyframe(at(0.8, 1.3, 4.2), 35),
        keyframe(at(0.8, 1.3, 4.2), 35),
      );
    case "through-object":
      return linear(
        keyframe(at(0, 1.5, 8), 30),
        keyframe(at(0, 1.5, -5), 30, at(0, 1.5, -12)),
      );
    case "head-tracking":
      return linear(
        keyframe(at(-1.6, 1.6, 3.2), 85, at(0, 1.55, 0)),
        keyframe(at(1.6, 1.6, 3.2), 85, at(0, 1.55, 0)),
      );
  }
};
