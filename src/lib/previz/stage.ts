import * as THREE from "three";

import { err, ok, type Result } from "@/lib/result";

import {
  mannequinBlockKey,
  propBlockKey,
  type CameraTrack,
  type ShotBlockout,
} from "./blockout";
import { sampleCameraTrack } from "./cameraMath";
import {
  applyPlacement,
  buildFloor,
  buildGrid,
  buildLights,
  buildMannequin,
  buildProp,
  disposeObject,
  hueForIndex,
  STAGE_EXTENT,
  type CastMember,
} from "./sceneBuild";

/**
 * The interactive previz viewport: one WebGL renderer, a persistent scene
 * that is diffed against the current blockout, and two views onto it (a
 * user-orbitable stage view and the shot camera at the current scrub
 * position). All React-facing state stays outside; the page pushes state in
 * through methods and drives rendering from its own animation frame.
 */

export type StageViewMode = "stage" | "camera";

export type StageRenderState = {
  view: StageViewMode;
  track: CameraTrack | null;
  scrub: number;
};

export type StageError = {
  code: "webgl-unavailable";
  message: string;
};

const PATH_SAMPLES = 32;

export class PrevizStage {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private stageCamera: THREE.PerspectiveCamera;
  private shotCamera: THREE.PerspectiveCamera;
  private blocks = new Map<string, THREE.Group>();
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private orbit = { theta: 0.5, phi: 1.05, radius: 12, target: new THREE.Vector3(0, 1, 0) };
  private aspect = 16 / 9;
  private selectedKey: string | null = null;

  private gizmoA: THREE.Mesh;
  private gizmoB: THREE.Mesh;
  private pathLine: THREE.Line;
  private marker: THREE.Mesh;
  private lookLine: THREE.Line;
  private lookLinePositions: THREE.BufferAttribute;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1013);
    this.scene.add(buildLights());
    this.scene.add(buildFloor());
    this.scene.add(buildGrid());

    this.stageCamera = new THREE.PerspectiveCamera(45, this.aspect, 0.1, 200);
    this.shotCamera = new THREE.PerspectiveCamera(40, this.aspect, 0.1, 200);

    const gizmoGeometry = new THREE.ConeGeometry(0.16, 0.4, 12);
    this.gizmoA = new THREE.Mesh(
      gizmoGeometry,
      new THREE.MeshBasicMaterial({ color: 0xe8eaed, wireframe: true }),
    );
    this.gizmoB = new THREE.Mesh(
      gizmoGeometry.clone(),
      new THREE.MeshBasicMaterial({ color: 0x8a919c, wireframe: true }),
    );
    this.pathLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x4a515c }),
    );
    this.marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xe8eaed }),
    );
    this.lookLinePositions = new THREE.BufferAttribute(new Float32Array(6), 3);
    const lookGeometry = new THREE.BufferGeometry();
    lookGeometry.setAttribute("position", this.lookLinePositions);
    this.lookLine = new THREE.Line(
      lookGeometry,
      new THREE.LineBasicMaterial({ color: 0x3a4149 }),
    );
    this.scene.add(this.gizmoA, this.gizmoB, this.pathLine, this.marker, this.lookLine);
  }

  resize(width: number, height: number, pixelRatio: number): void {
    if (width <= 0 || height <= 0) return;
    this.aspect = width / height;
    this.renderer.setPixelRatio(Math.min(pixelRatio, 2));
    this.renderer.setSize(width, height, false);
  }

  /* ---------------------------------------------------------------- */
  /* Scene sync                                                        */
  /* ---------------------------------------------------------------- */

  syncBlockout(blockout: ShotBlockout | null, cast: readonly CastMember[]): void {
    const wanted = new Set<string>();

    if (blockout) {
      blockout.mannequins.forEach((mannequin) => {
        const key = mannequinBlockKey(mannequin.characterId);
        wanted.add(key);
        let group = this.blocks.get(key);
        if (!group) {
          const index = cast.findIndex(
            (member) => member.characterId === mannequin.characterId,
          );
          const member = index >= 0 ? cast[index] : undefined;
          group = buildMannequin({
            hue: hueForIndex(Math.max(index, 0)),
            name: member ? member.name : null,
          });
          group.userData.blockKey = key;
          this.blocks.set(key, group);
          this.scene.add(group);
        }
        applyPlacement(group, mannequin);
      });
      blockout.props.forEach((prop) => {
        const key = propBlockKey(prop.id);
        wanted.add(key);
        let group = this.blocks.get(key);
        if (!group) {
          group = buildProp(prop.kind);
          group.userData.blockKey = key;
          this.blocks.set(key, group);
          this.scene.add(group);
        }
        applyPlacement(group, prop);
      });
    }

    for (const [key, group] of this.blocks) {
      if (wanted.has(key)) continue;
      this.scene.remove(group);
      disposeObject(group);
      this.blocks.delete(key);
    }

    this.updateGizmos(blockout?.camera ?? null);
    this.applySelectionTint();
  }

  private updateGizmos(track: CameraTrack | null): void {
    const visible = track !== null;
    this.gizmoA.visible = visible;
    this.gizmoB.visible = visible;
    this.pathLine.visible = visible;
    if (!track) return;

    const orient = (mesh: THREE.Mesh, position: THREE.Vector3, lookAt: THREE.Vector3) => {
      mesh.position.copy(position);
      const direction = lookAt.clone().sub(position).normalize();
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    };
    orient(
      this.gizmoA,
      new THREE.Vector3(track.a.position.x, track.a.position.y, track.a.position.z),
      new THREE.Vector3(track.a.lookAt.x, track.a.lookAt.y, track.a.lookAt.z),
    );
    orient(
      this.gizmoB,
      new THREE.Vector3(track.b.position.x, track.b.position.y, track.b.position.z),
      new THREE.Vector3(track.b.lookAt.x, track.b.lookAt.y, track.b.lookAt.z),
    );

    const points: THREE.Vector3[] = [];
    for (let index = 0; index <= PATH_SAMPLES; index += 1) {
      const pose = sampleCameraTrack(track, index / PATH_SAMPLES);
      points.push(new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z));
    }
    this.pathLine.geometry.dispose();
    this.pathLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
  }

  /* ---------------------------------------------------------------- */
  /* Selection                                                         */
  /* ---------------------------------------------------------------- */

  setSelected(blockKey: string | null): void {
    this.selectedKey = blockKey;
    this.applySelectionTint();
  }

  private applySelectionTint(): void {
    for (const [key, group] of this.blocks) {
      const selected = key === this.selectedKey;
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const material = object.material as THREE.Material;
        if (material instanceof THREE.MeshStandardMaterial) {
          material.emissive.setHex(selected ? 0x2b4d57 : 0x000000);
        }
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Picking and dragging                                              */
  /* ---------------------------------------------------------------- */

  /** Returns the block key under the pointer in the stage view, if any. */
  pick(ndc: { x: number; y: number }): string | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), this.stageCamera);
    const groups = [...this.blocks.values()];
    const hits = this.raycaster.intersectObjects(groups, true);
    for (const hit of hits) {
      let current: THREE.Object3D | null = hit.object;
      while (current) {
        const key = current.userData.blockKey as string | undefined;
        if (key) return key;
        current = current.parent;
      }
    }
    return null;
  }

  /** Projects the pointer onto the stage floor, clamped to the stage extent. */
  groundPoint(ndc: { x: number; y: number }): { x: number; z: number } | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), this.stageCamera);
    const intersection = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, intersection);
    if (!hit) return null;
    return {
      x: Math.min(STAGE_EXTENT, Math.max(-STAGE_EXTENT, intersection.x)),
      z: Math.min(STAGE_EXTENT, Math.max(-STAGE_EXTENT, intersection.z)),
    };
  }

  orbitStage(yawDelta: number, pitchDelta: number): void {
    this.orbit.theta += yawDelta;
    this.orbit.phi = Math.min(1.5, Math.max(0.2, this.orbit.phi + pitchDelta));
  }

  dollyStage(factor: number): void {
    this.orbit.radius = Math.min(40, Math.max(3, this.orbit.radius * factor));
  }

  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  render(state: StageRenderState): void {
    const editorChromeVisible = state.view === "stage";
    this.gizmoA.visible = editorChromeVisible && state.track !== null;
    this.gizmoB.visible = editorChromeVisible && state.track !== null;
    this.pathLine.visible = editorChromeVisible && state.track !== null;
    this.marker.visible = editorChromeVisible && state.track !== null;
    this.lookLine.visible = editorChromeVisible && state.track !== null;

    if (state.track) {
      const pose = sampleCameraTrack(state.track, state.scrub);
      this.marker.position.set(pose.position.x, pose.position.y, pose.position.z);
      this.lookLinePositions.setXYZ(0, pose.position.x, pose.position.y, pose.position.z);
      this.lookLinePositions.setXYZ(1, pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
      this.lookLinePositions.needsUpdate = true;

      if (state.view === "camera") {
        this.shotCamera.fov = pose.fov;
        this.shotCamera.aspect = this.aspect;
        this.shotCamera.position.set(pose.position.x, pose.position.y, pose.position.z);
        this.shotCamera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
        this.shotCamera.updateProjectionMatrix();
        this.renderer.render(this.scene, this.shotCamera);
        return;
      }
    }

    const { theta, phi, radius, target } = this.orbit;
    this.stageCamera.aspect = this.aspect;
    this.stageCamera.position.set(
      target.x + radius * Math.sin(phi) * Math.sin(theta),
      target.y + radius * Math.cos(phi),
      target.z + radius * Math.sin(phi) * Math.cos(theta),
    );
    this.stageCamera.lookAt(target);
    this.stageCamera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.stageCamera);
  }

  dispose(): void {
    disposeObject(this.scene);
    this.renderer.dispose();
    this.blocks.clear();
  }
}

/**
 * Guarded construction: headless and locked-down browsers can refuse a WebGL
 * context, which three surfaces as a throw. The caller renders an inline
 * error state instead of crashing.
 */
export const createPrevizStage = (
  canvas: HTMLCanvasElement,
): Result<PrevizStage, StageError> => {
  try {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    return ok(new PrevizStage(renderer));
  } catch {
    return err({
      code: "webgl-unavailable",
      message: "WebGL could not start in this browser.",
    });
  }
};
