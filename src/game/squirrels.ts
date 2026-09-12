import * as THREE from "three";

const PACK = 6;
const TRAIL = 6.55;
const PREVIEW_NEAR = -5.5;
const PREVIEW_FAR = -38;

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
    fur: new THREE.MeshLambertMaterial({ color: 0xe8dcc8 }),
    rust: new THREE.MeshLambertMaterial({ color: 0xa66a42 }),
    belly: new THREE.MeshLambertMaterial({ color: 0xf6eee3 }),
    tail: new THREE.MeshLambertMaterial({ color: 0xb88860 }),
    frost: new THREE.MeshLambertMaterial({ color: 0xd8c8b2 }),
    eye: new THREE.MeshLambertMaterial({ color: 0x141414 }),
    nose: new THREE.MeshLambertMaterial({ color: 0x2a1c16 }),
    earIn: new THREE.MeshLambertMaterial({ color: 0xe8a898 }),
    shade: new THREE.MeshBasicMaterial({ color: 0x3d4c58, transparent: true, opacity: 0.22 }),
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

function buildSquirrel(shared: Shared, tint: number): { mesh: THREE.Group; body: THREE.Group; tail: THREE.Group; fl: THREE.Mesh; fr: THREE.Mesh; hl: THREE.Mesh; hr: THREE.Mesh } {
  const mesh = new THREE.Group();
  const body = new THREE.Group();
  const tail = new THREE.Group();
  mesh.add(body);
  body.add(tail);

  const rust = shared.rust.clone();
  rust.color.offsetHSL(tint * 0.8, 0.04, tint * 0.15);

  addBall(body, shared.ball, shared.fur, 0, 0.24, 0, 0.17, 0.14, 0.24);
  addBall(body, shared.ball, rust, 0, 0.3, -0.02, 0.13, 0.08, 0.2);
  addBall(body, shared.ball, shared.belly, 0, 0.17, 0.04, 0.12, 0.09, 0.18);
  addBall(body, shared.ball, shared.fur, 0, 0.34, 0.22, 0.13, 0.12, 0.13);
  addBall(body, shared.ball, rust, 0, 0.36, 0.18, 0.1, 0.05, 0.08);

  const earL = new THREE.Mesh(shared.ear, rust);
  earL.position.set(-0.07, 0.46, 0.2);
  earL.scale.set(0.055, 0.1, 0.055);
  earL.rotation.x = -0.35;
  const earR = earL.clone();
  earR.position.x = 0.07;
  const inL = new THREE.Mesh(shared.ear, shared.earIn);
  inL.position.set(-0.07, 0.445, 0.22);
  inL.scale.set(0.032, 0.06, 0.03);
  inL.rotation.x = -0.35;
  const inR = inL.clone();
  inR.position.x = 0.07;
  body.add(earL, earR, inL, inR);

  const eyeL = new THREE.Mesh(shared.ball, shared.eye);
  eyeL.position.set(-0.055, 0.36, 0.32);
  eyeL.scale.set(0.028, 0.032, 0.028);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.055;
  const nose = new THREE.Mesh(shared.ball, shared.nose);
  nose.position.set(0, 0.32, 0.34);
  nose.scale.set(0.025, 0.02, 0.03);
  body.add(eyeL, eyeR, nose);

  tail.position.set(0, 0.26, -0.18);
  addBall(tail, shared.ball, shared.tail, 0, 0.06, -0.08, 0.09, 0.08, 0.12);
  addBall(tail, shared.ball, shared.tail, 0, 0.16, -0.18, 0.12, 0.11, 0.14);
  addBall(tail, shared.ball, shared.frost, 0, 0.28, -0.22, 0.13, 0.12, 0.13);
  addBall(tail, shared.ball, shared.frost, 0, 0.38, -0.14, 0.1, 0.1, 0.09);

  const mkFoot = (x: number, z: number) => {
    const f = new THREE.Mesh(shared.foot, shared.nose);
    f.position.set(x, 0.05, z);
    f.scale.set(0.055, 0.04, 0.09);
    body.add(f);
    return f;
  };
  const fl = mkFoot(-0.07, 0.12);
  const fr = mkFoot(0.07, 0.12);
  const hl = mkFoot(-0.08, -0.1);
  const hr = mkFoot(0.08, -0.1);

  const shadow = new THREE.Mesh(shared.disc, shared.shade);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  shadow.scale.set(0.28, 0.18, 1);
  mesh.add(shadow);

  mesh.scale.setScalar(1.95);
  return { mesh, body, tail, fl, fr, hl, hr };
}

function seedVelocity(c: Critter, rider: RiderPose, moving: boolean) {
  const dash = moving ? Math.max(8, rider.speed) : 5.2;
  if (c.mode === "cross") {
    const dir = c.x >= 0 ? -1 : 1;
    c.vx = dir * (4.6 + Math.random() * 2.8);
    c.vz = -dash * (0.12 + Math.random() * 0.28);
  } else {
    const along = Math.random() < 0.45 ? 1.05 : 0.55;
    c.vx = (Math.random() - 0.5) * 1.6;
    c.vz = -dash * along;
  }
}

function placeFresh(c: Critter, rider: RiderPose, moving: boolean, preview: boolean) {
  c.mode = Math.random() < 0.62 ? "cross" : "edge";
  c.phase = Math.random() * Math.PI * 2;
  c.flee = 0;
  if (preview) {
    c.z = rider.z + PREVIEW_NEAR - Math.random() * (PREVIEW_NEAR - PREVIEW_FAR);
    c.x = (Math.random() - 0.5) * TRAIL * 1.7;
  } else if (moving) {
    c.z = rider.z - 10 - Math.random() * 36;
    c.x = c.mode === "edge"
      ? (Math.random() < 0.5 ? -1 : 1) * (5.4 + Math.random() * 1.4)
      : (Math.random() - 0.5) * TRAIL * 1.6;
  } else {
    c.z = rider.z + PREVIEW_NEAR - Math.random() * 26;
    c.x = (Math.random() - 0.5) * TRAIL * 1.7;
  }
  seedVelocity(c, rider, moving);
  c.yaw = Math.atan2(-c.vx, -c.vz);
}

export function createSquirrelPack(scene: THREE.Scene): SquirrelPack {
  const shared = makeShared();
  const pack: Critter[] = [];
  for (let i = 0; i < PACK; i++) {
    const built = buildSquirrel(shared, (i - 2.5) * 0.035);
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
    c.phase += dt * (10 + spd * 1.6);
    const bob = Math.abs(Math.sin(c.phase * 2)) * 0.055;
    c.body.position.y = bob + (c.flee > 0 ? 0.04 : 0);
    c.body.rotation.x = -0.08 + Math.sin(c.phase * 2) * 0.08;
    c.tail.rotation.x = -0.55 + Math.sin(c.phase * 1.7) * 0.28;
    c.tail.rotation.y = Math.sin(c.phase * 1.3) * 0.22;
    const stride = Math.sin(c.phase * 2) * 0.055;
    c.fl.position.z = 0.12 + stride;
    c.fr.position.z = 0.12 - stride;
    c.hl.position.z = -0.1 - stride;
    c.hr.position.z = -0.1 + stride;
    const target = Math.atan2(-c.vx, -c.vz);
    c.yaw += wrapPi(target - c.yaw) * 0.22;
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
      if (d2 < 7.3 && d2 > 0.04) {
        const inv = 1 / Math.sqrt(d2);
        c.vx += dx * inv * 22 * dt;
        c.vz += dz * inv * 14 * dt;
        c.flee = 0.55;
      }

      if (c.mode === "edge" && c.flee <= 0) {
        const bank = c.x >= 0 ? 6.1 : -6.1;
        c.vx += (bank - c.x) * 1.4 * dt;
      }

      c.x += c.vx * dt;
      c.z += c.vz * dt;

      if (Math.abs(c.x) > TRAIL + 0.9) {
        c.vx *= -1;
        c.x = clamp(c.x, -TRAIL - 0.9, TRAIL + 0.9);
      }

      const spd = Math.hypot(c.vx, c.vz);
      const cap = 13;
      if (spd > cap) {
        c.vx *= cap / spd;
        c.vz *= cap / spd;
      }

      const behind = c.z > rider.z + 9;
      const gone = c.z < rider.z - (moving ? 58 : 42);
      const stray = Math.abs(c.x) > 10.5;
      if (behind || gone || stray) placeFresh(c, rider, moving, !moving);
      pose(c, dt);
    }
  }

  function reset(rider: RiderPose) {
    for (let i = 0; i < pack.length; i++) {
      const c = pack[i];
      if (!c) continue;
      c.mode = i % 3 === 0 ? "edge" : "cross";
      const t = PACK <= 1 ? 0 : i / (PACK - 1);
      c.z = rider.z - 10.5 - t * 18;
      c.x = (i % 2 === 0 ? -1 : 1) * (1.8 + (i % 3) * 1.5);
      c.phase = i * 1.1;
      c.flee = 0;
      seedVelocity(c, rider, rider.speed > 1);
      if (c.mode === "cross") c.vx = (c.x >= 0 ? -1 : 1) * (5.2 + i * 0.35);
      pose(c, 0);
    }
  }

  function dispose() {
    for (const c of pack) scene.remove(c.mesh);
    shared.ball.dispose();
    shared.ear.dispose();
    shared.foot.dispose();
    shared.disc.dispose();
    for (const m of [shared.fur, shared.rust, shared.belly, shared.tail, shared.frost, shared.eye, shared.nose, shared.earIn, shared.shade]) {
      m.dispose();
    }
  }

  return { update, reset, dispose };
}
