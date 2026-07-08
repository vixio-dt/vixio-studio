import * as THREE from "three";

import type { PropKind, ShotBlockout } from "./blockout";

/**
 * Procedural stage pieces shared by the interactive viewport and the
 * offscreen capture: floor, lights, mannequins, and prop set pieces. The
 * capture scene reuses these builders so the clay pass matches what the
 * user blocked, minus editor chrome (grid, labels, gizmos).
 */

export type CastMember = {
  characterId: string;
  name: string;
};

/** Golden-ratio hue walk keeps neighboring characters visually distinct. */
export const hueForIndex = (index: number): number =>
  (0.52 + index * 0.61803) % 1;

export const STAGE_EXTENT = 14;

/* ------------------------------------------------------------------ */
/* Environment                                                         */
/* ------------------------------------------------------------------ */

export const buildFloor = (): THREE.Mesh => {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(STAGE_EXTENT * 2.2, STAGE_EXTENT * 2.2),
    new THREE.MeshStandardMaterial({ color: 0x181a1f, roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  return floor;
};

export const buildGrid = (): THREE.GridHelper => {
  const grid = new THREE.GridHelper(STAGE_EXTENT * 2, STAGE_EXTENT * 2, 0x3a3f47, 0x24272d);
  grid.position.y = 0;
  return grid;
};

export const buildLights = (): THREE.Group => {
  const group = new THREE.Group();
  const hemisphere = new THREE.HemisphereLight(0x9aa5b1, 0x23262b, 0.9);
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(5, 8, 4);
  const fill = new THREE.DirectionalLight(0xdde4ee, 0.5);
  fill.position.set(-6, 4, -3);
  group.add(hemisphere, key, fill);
  return group;
};

/* ------------------------------------------------------------------ */
/* Mannequins                                                          */
/* ------------------------------------------------------------------ */

const buildLabelSprite = (name: string): THREE.Sprite => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    context.font = "600 30px 'Geist Mono', monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "rgba(232, 234, 237, 0.92)";
    context.fillText(name.slice(0, 14), 128, 34);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  sprite.position.y = 2.15;
  sprite.scale.set(1.5, 0.375, 1);
  return sprite;
};

/**
 * Capsule-and-sphere mannequin facing +z. A small nose cone marks the facing
 * direction so rotation reads at a glance. Label sprites are editor chrome
 * and are skipped for capture scenes.
 */
export const buildMannequin = (input: {
  hue: number;
  name: string | null;
}): THREE.Group => {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(input.hue, 0.45, 0.55),
    roughness: 0.7,
  });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.55, 4, 12), material);
  body.position.y = 1.02;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), material);
  head.position.y = 1.62;

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 8), material);
  nose.position.set(0, 1.62, 0.19);
  nose.rotation.x = Math.PI / 2;

  const armGeometry = new THREE.CapsuleGeometry(0.06, 0.5, 4, 8);
  const armLeft = new THREE.Mesh(armGeometry, material);
  armLeft.position.set(-0.34, 1.08, 0);
  armLeft.rotation.z = 0.14;
  const armRight = new THREE.Mesh(armGeometry, material);
  armRight.position.set(0.34, 1.08, 0);
  armRight.rotation.z = -0.14;

  const legGeometry = new THREE.CapsuleGeometry(0.08, 0.5, 4, 8);
  const legLeft = new THREE.Mesh(legGeometry, material);
  legLeft.position.set(-0.13, 0.38, 0);
  const legRight = new THREE.Mesh(legGeometry, material);
  legRight.position.set(0.13, 0.38, 0);

  group.add(body, head, nose, armLeft, armRight, legLeft, legRight);
  if (input.name !== null) group.add(buildLabelSprite(input.name));
  return group;
};

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

export const buildProp = (kind: PropKind): THREE.Group => {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0x767c86,
    roughness: 0.85,
  });
  switch (kind) {
    case "box": {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), material);
      mesh.position.y = 0.45;
      group.add(mesh);
      break;
    }
    case "cylinder": {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 1.1, 20),
        material,
      );
      mesh.position.y = 0.55;
      group.add(mesh);
      break;
    }
    case "plane": {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 0.08), material);
      mesh.position.y = 0.7;
      group.add(mesh);
      break;
    }
  }
  return group;
};

/* ------------------------------------------------------------------ */
/* Shared placement and capture scene                                  */
/* ------------------------------------------------------------------ */

export const applyPlacement = (
  object: THREE.Object3D,
  placement: { x: number; z: number; rotationY: number },
): void => {
  object.position.set(placement.x, 0, placement.z);
  object.rotation.y = placement.rotationY;
};

/**
 * A capture-only scene: floor, lights, mannequins, and props, with no grid,
 * labels, or gizmos. Material overrides (clay, depth) are applied per pass
 * by the capture pipeline.
 */
export const buildCaptureScene = (
  blockout: ShotBlockout,
  cast: readonly CastMember[],
): THREE.Scene => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101216);
  scene.add(buildLights());
  scene.add(buildFloor());
  blockout.mannequins.forEach((mannequin) => {
    const index = cast.findIndex(
      (member) => member.characterId === mannequin.characterId,
    );
    const group = buildMannequin({
      hue: hueForIndex(Math.max(index, 0)),
      name: null,
    });
    applyPlacement(group, mannequin);
    scene.add(group);
  });
  blockout.props.forEach((prop) => {
    const group = buildProp(prop.kind);
    applyPlacement(group, prop);
    scene.add(group);
  });
  return scene;
};

/** Frees geometries, materials, and textures under a root object. */
export const disposeObject = (root: THREE.Object3D): void => {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry.dispose();
      const material = object.material as THREE.Material | THREE.Material[];
      const materials = Array.isArray(material) ? material : [material];
      materials.forEach((entry) => entry.dispose());
    }
    if (object instanceof THREE.Sprite) {
      object.material.map?.dispose();
      object.material.dispose();
    }
  });
};
