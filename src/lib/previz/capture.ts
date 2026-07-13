import {
  BufferTarget,
  CanvasSource,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  QUALITY_MEDIUM,
  WebMOutputFormat,
} from "mediabunny";
import * as THREE from "three";

import { err, messageFromUnknown, ok, type Result } from "@/lib/result";

import type { ShotBlockout } from "./blockout";
import { sampleCameraTrack } from "./cameraMath";
import { buildCaptureScene, disposeObject, type CastMember } from "./sceneBuild";

/**
 * Offscreen previz capture: renders the interpolated camera move at 640x360,
 * 12fps, in two passes (clay and normalized depth), and muxes each pass to
 * webm. WebCodecs (vp9/vp8 through mediabunny) is preferred; when it is not
 * available the pipeline falls back to canvas.captureStream + MediaRecorder,
 * which paces frames in real time.
 */

export const CAPTURE_WIDTH = 640;
export const CAPTURE_HEIGHT = 360;
export const CAPTURE_FPS = 12;
export const CAPTURE_MAX_SECONDS = 10;

export type CapturePass = "clay" | "depth";

export type CaptureProgress = {
  pass: CapturePass;
  /** 0..1 across the whole two-pass capture. */
  fraction: number;
};

export type CaptureError = {
  code: "webgl-unavailable" | "encoder-unavailable" | "encode-failed";
  message: string;
};

export type CaptureOutput = {
  clay: Blob;
  depth: Blob;
  /** Human-readable encoder description, e.g. "webcodecs vp9". */
  codec: string;
  durationSeconds: number;
};

/* ------------------------------------------------------------------ */
/* Encoder selection                                                   */
/* ------------------------------------------------------------------ */

type EncoderChoice =
  | { kind: "webcodecs"; codec: "avc" | "vp8" | "vp9"; label: string }
  | { kind: "recorder"; mimeType: string; label: string };

const RECORDER_MIME_CANDIDATES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

const resolveEncoder = async (): Promise<EncoderChoice | null> => {
  if (typeof VideoEncoder !== "undefined") {
    try {
      // avc first: driving-video models accept mp4 but not webm, so a clip
      // that is mp4 at the source skips a transcode later.
      const codec = await getFirstEncodableVideoCodec(["avc", "vp9", "vp8"], {
        width: CAPTURE_WIDTH,
        height: CAPTURE_HEIGHT,
      });
      if (codec === "avc" || codec === "vp9" || codec === "vp8") {
        return { kind: "webcodecs", codec, label: `webcodecs ${codec}` };
      }
    } catch {
      // Fall through to the MediaRecorder path.
    }
  }
  if (typeof MediaRecorder !== "undefined") {
    for (const mimeType of RECORDER_MIME_CANDIDATES) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return { kind: "recorder", mimeType, label: `mediarecorder ${mimeType}` };
      }
    }
  }
  return null;
};

/* ------------------------------------------------------------------ */
/* Depth material: normalized linear view distance, near white         */
/* ------------------------------------------------------------------ */

const DEPTH_NEAR = 1;
const DEPTH_FAR = 30;

const buildDepthMaterial = (): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    uniforms: {
      uNear: { value: DEPTH_NEAR },
      uFar: { value: DEPTH_FAR },
    },
    vertexShader: `
      varying float vViewZ;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewZ = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uNear;
      uniform float uFar;
      varying float vViewZ;
      void main() {
        float d = clamp((vViewZ - uNear) / (uFar - uNear), 0.0, 1.0);
        gl_FragColor = vec4(vec3(1.0 - d), 1.0);
      }
    `,
  });

/* ------------------------------------------------------------------ */
/* Capture                                                             */
/* ------------------------------------------------------------------ */

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const captureBlockout = async (input: {
  blockout: ShotBlockout;
  cast: readonly CastMember[];
  durationSeconds: number;
  onProgress?: (progress: CaptureProgress) => void;
}): Promise<Result<CaptureOutput, CaptureError>> => {
  const duration = Math.min(
    CAPTURE_MAX_SECONDS,
    Math.max(1, input.durationSeconds),
  );
  const frameCount = Math.max(2, Math.round(duration * CAPTURE_FPS));

  const canvas = document.createElement("canvas");
  canvas.width = CAPTURE_WIDTH;
  canvas.height = CAPTURE_HEIGHT;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
    });
  } catch {
    return err({
      code: "webgl-unavailable",
      message: "WebGL could not start, so the capture cannot render.",
    });
  }
  renderer.setPixelRatio(1);
  renderer.setSize(CAPTURE_WIDTH, CAPTURE_HEIGHT, false);

  const encoder = await resolveEncoder();
  if (!encoder) {
    renderer.dispose();
    return err({
      code: "encoder-unavailable",
      message: "This browser has neither WebCodecs nor MediaRecorder webm support.",
    });
  }

  const scene = buildCaptureScene(input.blockout, input.cast);
  const camera = new THREE.PerspectiveCamera(
    40,
    CAPTURE_WIDTH / CAPTURE_HEIGHT,
    0.1,
    150,
  );
  const clayMaterial = new THREE.MeshStandardMaterial({
    color: 0x9aa0a6,
    roughness: 0.85,
  });
  const depthMaterial = buildDepthMaterial();

  const renderFrame = (frame: number): void => {
    const pose = sampleCameraTrack(input.blockout.camera, frame / (frameCount - 1));
    camera.fov = pose.fov;
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    camera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };

  const reportProgress = (pass: CapturePass, frame: number): void => {
    const passFraction = (frame + 1) / frameCount;
    const fraction = pass === "clay" ? passFraction / 2 : 0.5 + passFraction / 2;
    input.onProgress?.({ pass, fraction });
  };

  const preparePass = (pass: CapturePass): void => {
    scene.overrideMaterial = pass === "clay" ? clayMaterial : depthMaterial;
    scene.background = new THREE.Color(pass === "clay" ? 0x101216 : 0x000000);
  };

  const encodePassWithWebCodecs = async (
    pass: CapturePass,
    codec: "avc" | "vp8" | "vp9",
  ): Promise<Blob> => {
    preparePass(pass);
    const target = new BufferTarget();
    const mp4 = codec === "avc";
    const output = new Output({
      format: mp4 ? new Mp4OutputFormat() : new WebMOutputFormat(),
      target,
    });
    const source = new CanvasSource(canvas, { codec, bitrate: QUALITY_MEDIUM });
    output.addVideoTrack(source, { frameRate: CAPTURE_FPS });
    await output.start();
    for (let frame = 0; frame < frameCount; frame += 1) {
      renderFrame(frame);
      await source.add(frame / CAPTURE_FPS, 1 / CAPTURE_FPS);
      reportProgress(pass, frame);
    }
    await output.finalize();
    if (!target.buffer) throw new Error("Muxing produced no data");
    return new Blob([target.buffer], { type: mp4 ? "video/mp4" : "video/webm" });
  };

  const encodePassWithRecorder = async (
    pass: CapturePass,
    mimeType: string,
  ): Promise<Blob> => {
    preparePass(pass);
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error("The canvas produced no capture track");
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 5_000_000,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error("Recording failed"));
    });
    recorder.start();
    // Not every engine exposes CanvasCaptureMediaStreamTrack as a global.
    const requestFrame = (
      track as MediaStreamTrack & { requestFrame?: () => void }
    ).requestFrame;
    for (let frame = 0; frame < frameCount; frame += 1) {
      renderFrame(frame);
      requestFrame?.call(track);
      reportProgress(pass, frame);
      // MediaRecorder samples in real time, so pace frames at the target rate.
      await sleep(1000 / CAPTURE_FPS);
    }
    recorder.stop();
    await stopped;
    track.stop();
    return new Blob(chunks, { type: "video/webm" });
  };

  const encodePass = (pass: CapturePass): Promise<Blob> =>
    encoder.kind === "webcodecs"
      ? encodePassWithWebCodecs(pass, encoder.codec)
      : encodePassWithRecorder(pass, encoder.mimeType);

  try {
    const clay = await encodePass("clay");
    const depth = await encodePass("depth");
    return ok({ clay, depth, codec: encoder.label, durationSeconds: duration });
  } catch (cause) {
    return err({ code: "encode-failed", message: messageFromUnknown(cause) });
  } finally {
    disposeObject(scene);
    clayMaterial.dispose();
    depthMaterial.dispose();
    renderer.dispose();
  }
};
