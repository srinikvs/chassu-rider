import * as THREE from "three";
import type { Rng } from "./rng";

const PACK = 6;
const TRAIL = 6.55;
const PREVIEW_NEAR = -9;
const PREVIEW_FAR = -26;

export type RiderPose = {
  x: number;
  z: number;
  hop: number;
  speed: number;
};

type Mode = "cross" | "edge";

type Critter = {
  mesh: THREE.Group;
  body: THREE.Group;
  tail: THREE.Group;
  fl: THREE.Mesh;
  fr: THREE.Mesh;
  hl: THREE.Mesh;
  hr: THREE.Mesh;
  rust: THREE.MeshLambertMaterial;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  phase: number;
  mode: Mode;
  flee: number;
};

export type SquirrelPack = {
  update: (dt: number, rider: RiderPose, moving: boolean) => void;
  reset: (rider: RiderPose) => void;
  dispose: () => void;
};

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function wrapPi(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function makeShared() {
  return {
    ball: new THREE.SphereGeometry(1, 8, 6),
    ear: new THREE.ConeGeometry(1, 1, 5),
    foot: new THREE.BoxGeometry(1, 1, 1),
    disc: new THREE.CircleGeometry(1, 10),
    fur: new THREE.MeshLambertMaterial({ color: 0xe6d2b8 }),
    rust: new THREE.MeshLambertMaterial({ color: 0x8d4d2a }),
    belly: new THREE.MeshLambertMaterial({ color: 0xf6ead8 }),
    tail: new THREE.MeshLambertMaterial({ color: 0x7a4324 }),
    frost: new THREE.MeshLambertMaterial({ color: 0xc9b39a }),
    eye: new THREE.MeshLambertMaterial({ color: 0x111111 }),
    nose: new THREE.MeshLambertMaterial({ color: 0x241610 }),
    earIn: new THREE.MeshLambertMaterial({ color: 0xe0a090 }),
    shade: new THREE.MeshBasicMaterial({ color: 0x3d4c58, transparent: true, opacity: 0.26 }),
  };
}

type Shared = ReturnType<typeof makeShared>;

function addBall(
  parent: THREE.Object3D,
  geo: THREE.SphereGeometry,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}

function buildSquirrel(shared: Shared, tint: number): {
  mesh: THREE.Group;
  body: THREE.Group;
  tail: THREE.Group;
  fl: THREE.Mesh;
  fr: THREE.Mesh;
  hl: THREE.Mesh;
  hr: THREE.Mesh;
  rust: THREE.MeshLambertMaterial;
} {
  const mesh = new THREE.Group();
  const body = new THREE.Group();
  const tail = new THREE.Group();
  mesh.add(body);
  body.add(tail);

  const rust = shared.rust.clone();
  rust.color.offsetHSL(tint * 0.7, 0.02, tint * 0.12);
  mesh.addEventListener("removed", () => {
    rust.dispose();
  });

  addBall(body, shared.ball, shared.fur, 0, 0.26, 0, 0.18, 0.16, 0.22);
  addBall(body, shared.ball, rust, 0, 0.34, -0.02, 0.14, 0.09, 0.18);
  addBall(body, shared.ball, shared.belly, 0, 0.2, 0.04, 0.13, 0.1, 0.16);
  addBall(body, shared.ball, shared.fur, 0, 0.36, 0.2, 0.13, 0.13, 0.13);
  addBall(body, shared.ball, rust, 0, 0.38, 0.16, 0.1, 0.05, 0.08);

  const earL = new THREE.Mesh(shared.ear, rust);
  earL.position.set(-0.07, 0.5, 0.18);
  earL.scale.set(0.06, 0.12, 0.06);
  earL.rotation.x = -0.28;
  const earR = earL.clone();
  earR.position.x = 0.07;
  const inL = new THREE.Mesh(shared.ear, shared.earIn);
  inL.position.set(-0.07, 0.48, 0.2);
  inL.scale.set(0.034, 0.07, 0.03);
  inL.rotation.x = -0.28;
  const inR = inL.clone();
  inR.position.x = 0.07;
  body.add(earL, earR, inL, inR);

  const eyeL = new THREE.Mesh(shared.ball, shared.eye);
  eyeL.position.set(-0.055, 0.38, 0.3);
  eyeL.scale.set(0.032, 0.036, 0.032);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.055;
  const nose = new THREE.Mesh(shared.ball, shared.nose);
  nose.position.set(0, 0.34, 0.32);
  nose.scale.set(0.026, 0.02, 0.028);
  body.add(eyeL, eyeR, nose);

  tail.position.set(0, 0.28, -0.16);
  addBall(tail, shared.ball, shared.tail, 0, 0.1, -0.08, 0.1, 0.09, 0.12);
  addBall(tail, shared.ball, shared.tail, 0, 0.26, -0.14, 0.14, 0.14, 0.14);
  addBall(tail, shared.ball, shared.frost, 0, 0.42, -0.08, 0.15, 0.15, 0.13);
  addBall(tail, shared.ball, shared.frost, 0, 0.48, 0.06, 0.11, 0.11, 0.1);

  const mkFoot = (x: number, z: number) => {
    const f = new THREE.Mesh(shared.foot, shared.nose);
    f.position.set(x, 0.055, z);
    f.scale.set(0.07, 0.05, 0.11);
    body.add(f);
    return f;
  };
  const fl = mkFoot(-0.08, 0.14);
  const fr = mkFoot(0.08, 0.14);
  const hl = mkFoot(-0.09, -0.12);
  const hr = mkFoot(0.09, -0.12);

  const shadow = new THREE.Mesh(shared.disc, shared.shade);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  shadow.scale.set(0.38, 0.24, 1);
  mesh.add(shadow);

  mesh.scale.setScalar(1.72);
  return { mesh, body, tail, fl, fr, hl, hr, rust };
}

function seedVelocity(c: Critter, rider: RiderPose, moving: boolean, rand: Rng) {
  const dash = moving ? Math.max(8, rider.speed) : 5.4;
  if (c.mode === "cross") {
    const dir = c.x >= 0 ? -1 : 1;
    c.vx = dir * (5.2 + rand() * 2.6);
    c.vz = -dash * (0.1 + rand() * 0.22);
  } else {
    const along = rand() < 0.45 ? 1.05 : 0.58;
    c.vx = (rand() - 0.5) * 1.4;
    c.vz = -dash * along;
  }
}

function placeFresh(c: Critter, rider: RiderPose, moving: boolean, preview: boolean, rand: Rng) {
  c.mode = rand() < 0.68 ? "cross" : "edge";
  c.phase = rand() * Math.PI * 2;
  c.flee = 0;
  if (preview) {
    c.z = rider.z + PREVIEW_NEAR - rand() * (PREVIEW_NEAR - PREVIEW_FAR);
    c.x = (rand() < 0.5 ? -1 : 1) * (3.2 + rand() * 2.6);
  } else if (moving) {
    c.z = rider.z - 14 - rand() * 22;
    c.x = c.mode === "edge"
      ? (rand() < 0.5 ? -1 : 1) * (5.2 + rand() * 1.3)
      : (rand() - 0.5) * TRAIL * 1.55;
  } else {
    c.z = rider.z + PREVIEW_NEAR - rand() * 18;
    c.x = (rand() < 0.5 ? -1 : 1) * (3.2 + rand() * 2.6);
  }
  seedVelocity(c, rider, moving, rand);
  c.yaw = Math.atan2(-c.vx, -c.vz);
}

export function createSquirrelPack(scene: THREE.Scene, rand: Rng): SquirrelPack {
  const shared = makeShared();
  const pack: Critter[] = [];
  for (let i = 0; i < PACK; i++) {
    const built = buildSquirrel(shared, (i - 3) * 0.03);
    scene.add(built.mesh);
    pack.push({
      ...built,
      x: 0,
      z: 0,
      vx: 0,
      vz: 0,
      yaw: 0,
      phase: i,
      mode: i % 2 === 0 ? "cross" : "edge",
      flee: 0,
    });
  }

  function pose(c: Critter, dt: number) {
    const spd = Math.hypot(c.vx, c.vz);
    c.phase += dt * (11 + spd * 1.7);
    const bob = Math.abs(Math.sin(c.phase * 2)) * 0.07;
    c.body.position.y = bob + (c.flee > 0 ? 0.05 : 0);
    c.body.rotation.x = -0.08 + Math.sin(c.phase * 2) * 0.09;
    c.tail.rotation.x = -0.85 + Math.sin(c.phase * 1.7) * 0.18;
    c.tail.rotation.y = Math.sin(c.phase * 1.3) * 0.26;
    const stride = Math.sin(c.phase * 2) * 0.07;
    c.fl.position.z = 0.14 + stride;
    c.fr.position.z = 0.14 - stride;
    c.hl.position.z = -0.12 - stride;
    c.hr.position.z = -0.12 + stride;
    const target = Math.atan2(-c.vx, -c.vz);
    c.yaw += wrapPi(target - c.yaw) * 0.24;
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.yaw + Math.PI;
    c.mesh.visible = true;
  }

  function update(dt: number, rider: RiderPose, moving: boolean) {
    for (const c of pack) {
      c.flee = Math.max(0, c.flee - dt);
      const dx = c.x - rider.x;
      const dz = c.z - rider.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 8.5 && d2 > 0.04) {
        const inv = 1 / Math.sqrt(d2);
        c.vx += dx * inv * 24 * dt;
        c.vz += dz * inv * 14 * dt;
        c.flee = 0.55;
      }

      if (c.mode === "edge" && c.flee <= 0) {
        const bank = c.x >= 0 ? 6.05 : -6.05;
        c.vx += (bank - c.x) * 1.5 * dt;
      }

      c.x += c.vx * dt;
      c.z += c.vz * dt;

      if (Math.abs(c.x) > TRAIL + 0.85) {
        c.vx *= -1;
        c.x = clamp(c.x, -TRAIL - 0.85, TRAIL + 0.85);
      }

      const spd = Math.hypot(c.vx, c.vz);
      const cap = 13;
      if (spd > cap) {
        c.vx *= cap / spd;
        c.vz *= cap / spd;
      }

      const behind = c.z > rider.z + (moving ? 6 : 8);
      const tooClose = moving && c.z > rider.z - 5;
      const gone = c.z < rider.z - (moving ? 48 : 32);
      const stray = Math.abs(c.x) > 10.2;
      if (behind || tooClose || gone || stray) placeFresh(c, rider, moving, !moving, rand);
      pose(c, dt);
    }
  }

  function reset(rider: RiderPose) {
    const play = rider.speed > 1;
    const slots = play
      ? [
          { x: -4.2, z: -15.0, cross: true },
          { x: 4.4, z: -16.5, cross: true },
          { x: -3.1, z: -20.0, cross: true },
          { x: 3.4, z: -22.5, cross: true },
          { x: -5.5, z: -26.0, cross: false },
          { x: 5.3, z: -29.0, cross: false },
        ]
      : [
          { x: -4.8, z: -10.5, cross: true },
          { x: 5.0, z: -11.2, cross: true },
          { x: -3.6, z: -14.8, cross: true },
          { x: 3.8, z: -16.4, cross: true },
          { x: -5.6, z: -19.5, cross: false },
          { x: 5.4, z: -22.0, cross: false },
        ];
    for (let i = 0; i < pack.length; i++) {
      const c = pack[i];
      const slot = slots[i] ?? slots[0];
      if (!c || !slot) continue;
      c.mode = slot.cross ? "cross" : "edge";
      c.x = slot.x;
      c.z = rider.z + slot.z;
      c.phase = i * 1.05;
      c.flee = 0;
      seedVelocity(c, rider, rider.speed > 1, rand);
      if (c.mode === "cross") c.vx = (c.x >= 0 ? -1 : 1) * (5.4 + i * 0.28);
      pose(c, 0);
    }
  }

  function dispose() {
    for (const c of pack) {
      scene.remove(c.mesh);
      c.rust.dispose();
    }
    shared.ball.dispose();
    shared.ear.dispose();
    shared.foot.dispose();
    shared.disc.dispose();
    for (const m of [
      shared.fur,
      shared.rust,
      shared.belly,
      shared.tail,
      shared.frost,
      shared.eye,
      shared.nose,
      shared.earIn,
      shared.shade,
    ]) {
      m.dispose();
    }
  }

  return { update, reset, dispose };
}
