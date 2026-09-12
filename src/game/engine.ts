import * as THREE from "three";
import {
  setMuted,
  setWindLevel,
  sfxCrash,
  sfxGift,
  sfxJump,
  sfxStart,
  unlockAudio,
} from "./audio";
import { frand, mulberry32, type Rng } from "./rng";
import { loadSave, writeBest, writeMuted } from "./save";
import { createSquirrelPack } from "./squirrels";
import type { PublicEngine, Screen, UiState } from "./types";

const STEP = 1 / 60;
const SLOPE_HALF = 7.1;
const CHUNK_LEN = 36;
const CHUNK_COUNT = 7;
const BASE_SPEED = 17;
const MAX_SPEED = 34;
const TURN_RATE = 2.35;
const MAX_YAW = 0.55;
const GRAVITY = 26;
const JUMP_VEL = 9.1;
const COYOTE = 0.1;
const BUFFER = 0.14;
const PLAYER_R = 0.48;
const TREE_N = 18;
const ROCK_N = 12;
const MAN_N = 8;
const BALL_N = 6;
const GIFT_N = 12;
const GAP_N = 5;
const SIDE_N = 48;
const GIFT_COLORS = [0xb85c4a, 0x3d7a62, 0x3e6488, 0xa56b3a];

type Kind = "tree" | "rock" | "snowman" | "snowball" | "gift" | "gap";

type Ent = {
  kind: Kind;
  active: boolean;
  x: number;
  z: number;
  r: number;
  h: number;
  w: number;
  len: number;
  vx: number;
  hopable: boolean;
  index: number;
};

type Pointer = { id: number; x: number; y: number; sx: number; sy: number };

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function makeSnowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  if (!g) return new THREE.CanvasTexture(c);
  g.fillStyle = "#f3f7fb";
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 500; i++) {
    const a = Math.random() * 0.22;
    g.fillStyle = `rgba(164,186,204,${a})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 1 + (Math.random() > 0.8 ? 1 : 0), 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createEngine(
  canvas: HTMLCanvasElement,
  onUi: (ui: UiState) => void,
): PublicEngine {
  const save = loadSave();
  let screen: Screen = "title";
  let distance = 0;
  let gifts = 0;
  let score = 0;
  let best = save.best;
  let newBest = false;
  let muted = save.muted;
  setMuted(muted);

  let rng: Rng = mulberry32(1);
  const keys = new Set<string>();
  let qaKeys: string[] | null = null;
  let qaSteer: number | null = null;
  const pointers = new Map<number, Pointer>();
  let jumpBuffer = 0;
  let coyote = 0;
  let jumpHeld = false;
  let startHeld = false;

  const player = {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    hop: 0,
    vy: 0,
    speed: 0,
    roll: 0,
    spin: 0,
  };

  let spawnZ = -28;
  let shake = 0;
  let crashT = 0;
  let uiAcc = 0;
  let acc = 0;
  let lastT = 0;
  let raf = 0;
  let running = true;

  const ents: Ent[] = [];
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: window.innerWidth >= 720,
    powerPreference: "high-performance",
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x8ec6e8, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ec6e8);
  scene.fog = new THREE.Fog(0xcfe4f4, 26, 92);

  const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 180);
  camera.position.set(0, 2.55, 5.1);

  scene.add(new THREE.HemisphereLight(0xd8eeff, 0xb7c4ce, 1.05));
  const sun = new THREE.DirectionalLight(0xfff3dd, 1.15);
  sun.position.set(18, 28, 12);
  scene.add(sun);

  const snowTex = makeSnowTexture();
  const snowMat = new THREE.MeshLambertMaterial({ map: snowTex, color: 0xf7fbff });
  const bankMat = new THREE.MeshLambertMaterial({ color: 0xe7eef4 });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c3a28 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x1f4a36 });
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x7a7f86 });
  const manMat = new THREE.MeshLambertMaterial({ color: 0xf2f5f8 });
  const carrotMat = new THREE.MeshLambertMaterial({ color: 0xc56a2d });
  const ballMat = new THREE.MeshLambertMaterial({ color: 0xeef4f8 });
  const giftMat = new THREE.MeshLambertMaterial({ color: 0xb85c4a });
  const gapMat = new THREE.MeshLambertMaterial({ color: 0x3d4e5c });
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x7a3b2e });
  const runnerMat = new THREE.MeshLambertMaterial({ color: 0x2a3138 });
  const coatMat = new THREE.MeshLambertMaterial({ color: 0x2f4d63 });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xe8cbb0 });

  const groundChunks: THREE.Mesh[] = [];
  const bankL: THREE.Mesh[] = [];
  const bankR: THREE.Mesh[] = [];
  const groundGeo = new THREE.PlaneGeometry(22, CHUNK_LEN);
  groundGeo.rotateX(-Math.PI / 2);
  const bankGeo = new THREE.BoxGeometry(5.5, 1.6, CHUNK_LEN);

  for (let i = 0; i < CHUNK_COUNT; i++) {
    const g = new THREE.Mesh(groundGeo, snowMat);
    const bl = new THREE.Mesh(bankGeo, bankMat);
    const br = new THREE.Mesh(bankGeo, bankMat);
    scene.add(g, bl, br);
    groundChunks.push(g);
    bankL.push(bl);
    bankR.push(br);
  }

  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 1.1, 6);
  const leafGeo = new THREE.ConeGeometry(1.05, 2.4, 7);
  const rockGeo = new THREE.IcosahedronGeometry(0.62, 0);
  const sphereGeo = new THREE.SphereGeometry(1, 10, 8);
  const noseGeo = new THREE.ConeGeometry(0.07, 0.32, 6);
  const ballGeo = new THREE.SphereGeometry(0.55, 10, 8);
  const giftGeo = new THREE.BoxGeometry(0.48, 0.42, 0.48);
  const gapGeo = new THREE.BoxGeometry(1, 0.35, 1);

  const treeTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREE_N + SIDE_N);
  const treeLeaves = new THREE.InstancedMesh(leafGeo, leafMat, TREE_N + SIDE_N);
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_N);
  const manBody = new THREE.InstancedMesh(sphereGeo, manMat, MAN_N * 3);
  const manNose = new THREE.InstancedMesh(noseGeo, carrotMat, MAN_N);
  const balls = new THREE.InstancedMesh(ballGeo, ballMat, BALL_N);
  const giftMesh = new THREE.InstancedMesh(giftGeo, giftMat, GIFT_N);
  giftMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GIFT_N * 3), 3);
  const gapMesh = new THREE.InstancedMesh(gapGeo, gapMat, GAP_N);

  for (const m of [treeTrunks, treeLeaves, rocks, manBody, manNose, balls, giftMesh, gapMesh]) {
    m.frustumCulled = false;
    scene.add(m);
  }

  const sideTrees: { x: number; z: number; s: number }[] = [];
  for (let i = 0; i < SIDE_N; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    sideTrees.push({
      x: side * (8.6 + (i % 7) * 0.7),
      z: 6 - i * 3.6,
      s: 0.9 + (i % 5) * 0.14,
    });
  }

  const mountains = new THREE.Group();
  const mtMat = new THREE.MeshLambertMaterial({ color: 0xd5e4ef });
  const mtRock = new THREE.MeshLambertMaterial({ color: 0x8fa0ad });
  for (let i = 0; i < 7; i++) {
    const mt = new THREE.Mesh(
      new THREE.ConeGeometry(12 + (i % 3) * 4, 22 + (i % 4) * 5, 5),
      i % 2 ? mtMat : mtRock,
    );
    const side = i - 3;
    mt.position.set(side * 22 + (side === 0 ? 28 : 0), 7, -88 - Math.abs(side) * 6);
    mountains.add(mt);
  }
  scene.add(mountains);

  const sled = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 1.55), woodMat);
  deck.position.y = 0.28;
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 1.7), runnerMat);
  const r2 = r1.clone();
  r1.position.set(-0.28, 0.12, 0.05);
  r2.position.set(0.28, 0.12, 0.05);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.28, 4, 8), coatMat);
  body.position.set(0, 0.72, 0.05);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skinMat);
  head.position.set(0, 1.08, 0.08);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.16, 8), new THREE.MeshLambertMaterial({ color: 0x1c2a36 }));
  hat.position.set(0, 1.24, 0.08);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.35), woodMat);
  nose.position.set(0, 0.3, 0.85);
  sled.add(deck, r1, r2, body, head, hat, nose);
  sled.scale.setScalar(1.35);
  scene.add(sled);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 10),
    new THREE.MeshBasicMaterial({ color: 0x3d4c58, transparent: true, opacity: 0.28 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  scene.add(shadow);

  const flakeCount = 220;
  const flakePos = new Float32Array(flakeCount * 3);
  for (let i = 0; i < flakeCount; i++) {
    flakePos[i * 3] = (Math.random() - 0.5) * 28;
    flakePos[i * 3 + 1] = Math.random() * 12;
    flakePos[i * 3 + 2] = -Math.random() * 70;
  }
  const flakeGeo = new THREE.BufferGeometry();
  flakeGeo.setAttribute("position", new THREE.BufferAttribute(flakePos, 3));
  const flakes = new THREE.Points(
    flakeGeo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.85 }),
  );
  scene.add(flakes);

  const squirrels = createSquirrelPack(scene);

  function hideInstance(mesh: THREE.InstancedMesh, i: number) {
    dummy.position.set(0, -40, 0);
    dummy.scale.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  function stamp(
    mesh: THREE.InstancedMesh,
    i: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) {
    dummy.position.set(x, y, z);
    dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(rx, ry, rz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  function alloc(kind: Kind, extra: Partial<Ent> = {}): Ent | null {
    const e = ents.find((x) => x.kind === kind && !x.active);
    if (!e) return null;
    e.active = true;
    e.vx = 0;
    e.w = 0;
    e.len = 0;
    Object.assign(e, extra);
    return e;
  }

  function bootPools() {
    ents.length = 0;
    for (let i = 0; i < TREE_N; i++) ents.push({ kind: "tree", active: false, x: 0, z: 0, r: 0.72, h: 3.2, w: 0, len: 0, vx: 0, hopable: false, index: i });
    for (let i = 0; i < ROCK_N; i++) ents.push({ kind: "rock", active: false, x: 0, z: 0, r: 0.7, h: 0.7, w: 0, len: 0, vx: 0, hopable: true, index: i });
    for (let i = 0; i < MAN_N; i++) ents.push({ kind: "snowman", active: false, x: 0, z: 0, r: 0.62, h: 1.45, w: 0, len: 0, vx: 0, hopable: true, index: i });
    for (let i = 0; i < BALL_N; i++) ents.push({ kind: "snowball", active: false, x: 0, z: 0, r: 0.6, h: 0.85, w: 0, len: 0, vx: 0, hopable: true, index: i });
    for (let i = 0; i < GIFT_N; i++) ents.push({ kind: "gift", active: false, x: 0, z: 0, r: 0.7, h: 0.5, w: 0, len: 0, vx: 0, hopable: true, index: i });
    for (let i = 0; i < GAP_N; i++) ents.push({ kind: "gap", active: false, x: 0, z: 0, r: 0, h: 0, w: 3.6, len: 4.6, vx: 0, hopable: true, index: i });
  }

  function clearWorld() {
    for (const e of ents) e.active = false;
    for (let i = 0; i < TREE_N; i++) {
      hideInstance(treeTrunks, i);
      hideInstance(treeLeaves, i);
    }
    for (let i = 0; i < ROCK_N; i++) hideInstance(rocks, i);
    for (let i = 0; i < MAN_N * 3; i++) hideInstance(manBody, i);
    for (let i = 0; i < MAN_N; i++) hideInstance(manNose, i);
    for (let i = 0; i < BALL_N; i++) hideInstance(balls, i);
    for (let i = 0; i < GIFT_N; i++) hideInstance(giftMesh, i);
    for (let i = 0; i < GAP_N; i++) hideInstance(gapMesh, i);
    markInstances();
  }

  function markInstances() {
    treeTrunks.instanceMatrix.needsUpdate = true;
    treeLeaves.instanceMatrix.needsUpdate = true;
    rocks.instanceMatrix.needsUpdate = true;
    manBody.instanceMatrix.needsUpdate = true;
    manNose.instanceMatrix.needsUpdate = true;
    balls.instanceMatrix.needsUpdate = true;
    giftMesh.instanceMatrix.needsUpdate = true;
    if (giftMesh.instanceColor) giftMesh.instanceColor.needsUpdate = true;
    gapMesh.instanceMatrix.needsUpdate = true;
  }

  function placeTree(e: Ent) {
    stamp(treeTrunks, e.index, e.x, 0.55, e.z, 1, 1, 1);
    stamp(treeLeaves, e.index, e.x, 2.05, e.z, 1, 1, 1);
  }
  function placeRock(e: Ent) {
    stamp(rocks, e.index, e.x, 0.38, e.z, 1, 0.72, 1.1, 0.2, e.x, 0.1);
  }
  function placeMan(e: Ent) {
    const i = e.index;
    stamp(manBody, i * 3, e.x, 0.38, e.z, 0.5, 0.42, 0.5);
    stamp(manBody, i * 3 + 1, e.x, 0.92, e.z, 0.38, 0.34, 0.38);
    stamp(manBody, i * 3 + 2, e.x, 1.32, e.z, 0.26, 0.26, 0.26);
    stamp(manNose, i, e.x, 1.32, e.z + 0.28, 1, 1, 1, Math.PI / 2, 0, 0);
  }
  function placeBall(e: Ent) {
    stamp(balls, e.index, e.x, 0.55, e.z, 1, 1, 1);
  }
  function placeGift(e: Ent) {
    const c = GIFT_COLORS[e.index % GIFT_COLORS.length] ?? 0xb85c4a;
    tmpColor.setHex(c);
    giftMesh.setColorAt(e.index, tmpColor);
    stamp(giftMesh, e.index, e.x, 0.32 + Math.sin(e.z * 0.4) * 0.05, e.z, 1, 1, 1, 0, e.z * 0.2, 0);
  }
  function placeGap(e: Ent) {
    stamp(gapMesh, e.index, e.x, -0.12, e.z, e.w, 1, e.len);
  }

  function blocked(x: number, z: number, r: number, ignore?: Ent): boolean {
    for (const o of ents) {
      if (!o.active || o === ignore || o.kind === "gap" || o.kind === "gift") continue;
      const dx = o.x - x;
      const dz = o.z - z;
      if (dx * dx + dz * dz < (o.r + r + 0.8) ** 2) return true;
    }
    return false;
  }

  function difficulty(): number {
    return 1 - Math.exp(-distance / 380);
  }

  function placePattern(z: number) {
    if (distance < 18) return;
    const t = difficulty();
    const safe = frand(rng, -SLOPE_HALF + 1.8, SLOPE_HALF - 1.8);
    const corridor = 2.7 - t * 0.4;
    const roll = rng();

    const canPut = (x: number, rad: number) =>
      Math.abs(x - safe) > corridor + rad * 0.4 && Math.abs(x) < SLOPE_HALF - 0.4 && !blocked(x, z, rad);

    if (distance > 90 && roll > 0.86) {
      const e = alloc("gap");
      if (e) {
        e.x = clamp(safe + frand(rng, -1.2, 1.2), -3, 3);
        e.z = z;
        e.w = 3.3 + t * 0.7;
        e.len = 4.2 + t * 1.1;
        placeGap(e);
      }
      const g = alloc("gift");
      if (g) {
        g.x = e ? e.x : safe;
        g.z = z;
        placeGift(g);
      }
      return;
    }

    if (roll > 0.72) {
      for (let i = 0; i < 3; i++) {
        const g = alloc("gift");
        if (!g) break;
        g.x = clamp(safe + (i - 1) * 0.15, -SLOPE_HALF + 0.5, SLOPE_HALF - 0.5);
        g.z = z - i * 2.1;
        placeGift(g);
      }
      return;
    }

    if (roll > 0.58 && t > 0.15) {
      const e = alloc("snowball");
      if (e) {
        e.x = frand(rng, -SLOPE_HALF + 1, SLOPE_HALF - 1);
        if (Math.abs(e.x - safe) < corridor) e.x = safe + (e.x < safe ? -corridor - 1 : corridor + 1);
        e.z = z;
        e.vx = (rng() < 0.5 ? -1 : 1) * (1.8 + t * 2.2);
        placeBall(e);
      }
    }

    const n = roll > 0.38 ? 2 : 1;
    const kinds: Kind[] = t > 0.55 ? ["tree", "rock", "snowman", "tree"] : t > 0.25 ? ["tree", "rock", "snowman"] : ["tree", "rock"];
    for (let i = 0; i < n; i++) {
      const kind = kinds[Math.floor(rng() * kinds.length)] ?? "tree";
      let x = frand(rng, -SLOPE_HALF + 0.6, SLOPE_HALF - 0.6);
      for (let k = 0; k < 6 && !canPut(x, 0.7); k++) x = frand(rng, -SLOPE_HALF + 0.6, SLOPE_HALF - 0.6);
      if (!canPut(x, 0.7)) continue;
      const e = alloc(kind);
      if (!e) continue;
      e.x = x;
      e.z = z + frand(rng, -1.2, 1.2);
      if (kind === "tree") placeTree(e);
      else if (kind === "rock") placeRock(e);
      else placeMan(e);
    }

    if (rng() > 0.55) {
      const g = alloc("gift");
      if (g && !blocked(safe, z - 1.4, 0.5)) {
        g.x = safe;
        g.z = z - 1.4;
        placeGift(g);
      }
    }
  }

  function layoutChunks() {
    const base = Math.floor(player.z / CHUNK_LEN);
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const z = (base - i) * CHUNK_LEN;
      const g = groundChunks[i];
      const bl = bankL[i];
      const br = bankR[i];
      if (g) g.position.set(0, 0, z);
      if (bl) bl.position.set(-11.2, 0.4, z);
      if (br) br.position.set(11.2, 0.4, z);
    }
  }

  function layoutSides() {
    const span = SIDE_N * 3.6;
    for (let i = 0; i < SIDE_N; i++) {
      const t = sideTrees[i];
      if (!t) continue;
      let z = t.z;
      const rel = z - player.z;
      if (rel > 10) {
        t.z = z - span;
        z = t.z;
      } else if (rel < -span + 8) {
        t.z = z + span;
        z = t.z;
      }
      const idx = TREE_N + i;
      stamp(treeTrunks, idx, t.x, 0.55 * t.s, z, t.s, t.s, t.s);
      stamp(treeLeaves, idx, t.x, 2.05 * t.s, z, t.s, t.s, t.s);
    }
  }

  function emitUi() {
    uiAcc = 0;
    onUi({
      screen,
      distance,
      gifts,
      score,
      best,
      muted,
      newBest,
    });
  }

  function held(): Set<string> {
    if (qaKeys) return new Set(qaKeys);
    return keys;
  }

  function steerValue(): number {
    if (qaSteer != null) return qaSteer;
    const h = held();
    let s = 0;
    if (h.has("KeyA") || h.has("ArrowLeft")) s += 1;
    if (h.has("KeyD") || h.has("ArrowRight")) s -= 1;
    if (screen === "play") {
      for (const p of pointers.values()) {
        if (p.x < 0.38) s += 1;
        else if (p.x > 0.62) s -= 1;
      }
    }
    return clamp(s, -1, 1);
  }

  function wantJump(): boolean {
    const h = held();
    if (h.has("Space") || h.has("KeyW") || h.has("ArrowUp")) return true;
    return false;
  }

  function resetRun(play: boolean) {
    const fresh = loadSave();
    best = Math.max(best, fresh.best);
    rng = mulberry32((Math.random() * 0xffffffff) | 0);
    player.x = 0;
    player.y = 0;
    player.z = 0;
    player.yaw = 0;
    player.hop = 0;
    player.vy = 0;
    player.speed = play ? BASE_SPEED : 0;
    player.roll = 0;
    player.spin = 0;
    distance = 0;
    gifts = 0;
    score = 0;
    newBest = false;
    spawnZ = -28;
    shake = 0;
    crashT = 0;
    jumpBuffer = 0;
    coyote = 0;
    clearWorld();
    layoutChunks();
    distance = play ? 0 : 140;
    for (let z = -22; z > -90; z -= 16) placePattern(z);
    distance = 0;
    spawnZ = -90;
    screen = play ? "play" : "title";
    if (play) {
      sfxStart();
      player.speed = BASE_SPEED;
    }
    squirrels.reset(player);
    emitUi();
  }

  function crash() {
    if (screen !== "play") return;
    screen = "over";
    crashT = 0;
    shake = 0.7;
    player.spin = frand(() => Math.random(), -8, 8);
    sfxCrash();
    try {
      navigator.vibrate?.(40);
    } catch {
      /* ignore */
    }
    score = Math.floor(distance) + gifts * 25;
    if (score > best) {
      best = score;
      newBest = true;
      writeBest(best);
    }
    setWindLevel(0);
    emitUi();
  }

  function doJump() {
    player.vy = JUMP_VEL;
    player.hop = Math.max(player.hop, 0.02);
    coyote = 0;
    jumpBuffer = 0;
    sfxJump();
  }

  function sweptHit(ex: number, ez: number, er: number, dx: number, dz: number): boolean {
    const px = player.x;
    const pz = player.z;
    const vx = dx;
    const vz = dz;
    const wx = px - ex;
    const wz = pz - ez;
    const c = vx * vx + vz * vz;
    const r = PLAYER_R + er;
    if (c < 1e-8) return wx * wx + wz * wz < r * r;
    let t = (-wx * vx - wz * vz) / c;
    t = clamp(t, 0, 1);
    const qx = wx + vx * t;
    const qz = wz + vz * t;
    return qx * qx + qz * qz < r * r;
  }

  function startEdge(h: Set<string>): boolean {
    const down = h.has("Space") || h.has("Enter") || h.has("KeyW");
    const edge = down && !startHeld;
    startHeld = down;
    return edge;
  }

  function simulate(dt: number) {
    const h = held();
    if (screen === "title") {
      if (startEdge(h)) {
        resetRun(true);
        return;
      }
      player.yaw = Math.sin(lastT * 0.00045) * 0.12;
      squirrels.update(dt, player, false);
      return;
    }
    if (screen === "over") {
      crashT += dt;
      player.spin *= 1 - 1.8 * dt;
      sled.rotation.z += player.spin * dt;
      sled.rotation.x += dt * 1.2;
      player.hop = Math.max(0, player.hop - dt * 3);
      squirrels.update(dt, player, false);
      if (crashT > 0.4 && startEdge(h)) {
        resetRun(true);
        return;
      }
      startEdge(h);
      return;
    }

    const steer = steerValue();
    const jumping = wantJump();
    if (jumping && !jumpHeld) jumpBuffer = BUFFER;
    jumpHeld = jumping;
    jumpBuffer = Math.max(0, jumpBuffer - dt);

    const t = difficulty();
    player.speed = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * t;
    const grounded = player.hop <= 0.02;
    if (grounded) coyote = COYOTE;
    else coyote = Math.max(0, coyote - dt);
    if (jumpBuffer > 0 && coyote > 0) doJump();

    player.vy -= GRAVITY * dt;
    player.hop += player.vy * dt;
    if (player.hop <= 0) {
      player.hop = 0;
      player.vy = 0;
    }

    player.yaw += steer * TURN_RATE * dt;
    player.yaw = clamp(player.yaw, -MAX_YAW, MAX_YAW);
    if (steer === 0) player.yaw += -player.yaw * 2.4 * dt;

    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const dx = fx * player.speed * dt;
    const dz = fz * player.speed * dt;
    player.x += dx;
    player.z += dz;
    if (player.x > SLOPE_HALF) {
      player.x = SLOPE_HALF;
      player.yaw *= 0.45;
    } else if (player.x < -SLOPE_HALF) {
      player.x = -SLOPE_HALF;
      player.yaw *= 0.45;
    }

    distance = Math.max(distance, -player.z);
    score = Math.floor(distance) + gifts * 25;
    if (score > best) {
      best = score;
      newBest = true;
      writeBest(best);
    }
    player.roll += (steer * 0.42 - player.roll) * (1 - Math.exp(-12 * dt));

    const spacing = 17.5 - t * 7.5;
    const ahead = player.z - (38 + player.speed * 1.55);
    while (spawnZ > ahead) {
      placePattern(spawnZ);
      spawnZ -= spacing;
    }

    for (const e of ents) {
      if (!e.active) continue;
      if (e.z > player.z + 10) {
        e.active = false;
        if (e.kind === "tree") {
          hideInstance(treeTrunks, e.index);
          hideInstance(treeLeaves, e.index);
        } else if (e.kind === "rock") hideInstance(rocks, e.index);
        else if (e.kind === "snowman") {
          hideInstance(manBody, e.index * 3);
          hideInstance(manBody, e.index * 3 + 1);
          hideInstance(manBody, e.index * 3 + 2);
          hideInstance(manNose, e.index);
        } else if (e.kind === "snowball") hideInstance(balls, e.index);
        else if (e.kind === "gift") hideInstance(giftMesh, e.index);
        else hideInstance(gapMesh, e.index);
        continue;
      }
      if (e.kind === "snowball") {
        e.x += e.vx * dt;
        if (Math.abs(e.x) > SLOPE_HALF - 0.4) {
          e.vx *= -1;
          e.x = clamp(e.x, -SLOPE_HALF + 0.4, SLOPE_HALF - 0.4);
        }
        placeBall(e);
      }
      if (e.kind === "gift") {
        stamp(
          giftMesh,
          e.index,
          e.x,
          0.34 + Math.sin(lastT * 0.006 + e.index) * 0.1,
          e.z,
          1,
          1,
          1,
          0,
          lastT * 0.002 + e.index,
          0,
        );
        const gx = player.x - e.x;
        const gz = player.z - e.z;
        if (gx * gx + gz * gz < 1.05 && player.hop < 2.2) {
          e.active = false;
          hideInstance(giftMesh, e.index);
          gifts += 1;
          sfxGift();
        }
        continue;
      }
      if (e.kind === "gap") {
        if (
          player.z < e.z + e.len * 0.5 &&
          player.z > e.z - e.len * 0.5 &&
          Math.abs(player.x - e.x) < e.w * 0.5 - 0.1 &&
          player.hop < 0.32
        ) {
          crash();
          return;
        }
        continue;
      }
      const over = e.hopable && player.hop > e.h * 0.55;
      if (!over && sweptHit(e.x, e.z, e.r, dx, dz)) {
        crash();
        return;
      }
    }

    setWindLevel(0.25 + t * 0.75);
    shake = Math.max(0, shake - dt * 3);
    squirrels.update(dt, player, true);
    markInstances();
  }

  function render() {
    layoutChunks();
    layoutSides();
    mountains.position.set(0, 0, player.z - 96);

    const hop = player.hop;
    sled.position.set(player.x, 0.02 + hop, player.z);
    if (screen !== "over") {
      sled.rotation.set(0, player.yaw + Math.PI, -player.roll);
    }
    shadow.position.set(player.x, 0.03, player.z);
    const s = 0.7 * (1 - Math.min(hop * 0.18, 0.55));
    shadow.scale.set(s, s, 1);
    (shadow.material as THREE.MeshBasicMaterial).opacity = hop > 0.1 ? 0.14 : 0.28;

    const lookZ = player.z - 7;
    const camX = player.x * 0.78 + (Math.random() - 0.5) * shake;
    const camY = 2.45 + hop * 0.22 + (Math.random() - 0.5) * shake * 0.35;
    const camZ = player.z + 5.05;
    camera.position.x += (camX - camera.position.x) * 0.18;
    camera.position.y += (camY - camera.position.y) * 0.18;
    camera.position.z += (camZ - camera.position.z) * 0.22;
    camera.lookAt(player.x * 0.25, 0.55 + hop * 0.25, lookZ);
    camera.fov = 58 + (player.speed - BASE_SPEED) * 0.18;
    camera.updateProjectionMatrix();

    const pos = flakeGeo.getAttribute("position");
    if (pos) {
      for (let i = 0; i < flakeCount; i++) {
        let x = pos.getX(i);
        let y = pos.getY(i) - 3.2 * STEP * 4;
        let z = pos.getZ(i);
        if (y < 0 || z > player.z + 8) {
          x = player.x + (Math.random() - 0.5) * 24;
          y = 2 + Math.random() * 10;
          z = player.z - 8 - Math.random() * 60;
        }
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
    }

    renderer.render(scene, camera);
  }

  function resize() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function loop(now: number) {
    if (!running) return;
    if (!lastT) lastT = now;
    let dt = (now - lastT) / 1000;
    lastT = now;
    dt = Math.min(dt, 0.1);
    acc += dt;
    uiAcc += dt;
    while (acc >= STEP) {
      simulate(STEP);
      acc -= STEP;
    }
    render();
    if (uiAcc > 0.12 && screen === "play") emitUi();
    raf = requestAnimationFrame(loop);
  }

  const GAME_KEYS = new Set([
    "Space",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "KeyA",
    "KeyD",
    "KeyW",
    "KeyS",
  ]);

  function onKeyDown(e: KeyboardEvent) {
    if (e.repeat) {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      return;
    }
    keys.add(e.code);
    if (GAME_KEYS.has(e.code) || e.code === "Enter") e.preventDefault();
    unlockAudio();
  }
  function onKeyUp(e: KeyboardEvent) {
    keys.delete(e.code);
  }
  function onBlur() {
    keys.clear();
    pointers.clear();
  }
  function onVis() {
    if (document.hidden) keys.clear();
    else unlockAudio();
  }

  function canvasPos(e: PointerEvent) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / Math.max(1, r.width),
      y: (e.clientY - r.top) / Math.max(1, r.height),
    };
  }

  function onPointerDown(e: PointerEvent) {
    if (screen !== "play") return;
    const p = canvasPos(e);
    pointers.set(e.pointerId, { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y });
    if (p.x >= 0.38 && p.x <= 0.62) jumpBuffer = BUFFER;
    unlockAudio();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }
  function onPointerMove(e: PointerEvent) {
    const cur = pointers.get(e.pointerId);
    if (!cur) return;
    const p = canvasPos(e);
    cur.x = p.x;
    cur.y = p.y;
    if (cur.sy - p.y > 0.08) jumpBuffer = BUFFER;
  }
  function onPointerUp(e: PointerEvent) {
    const cur = pointers.get(e.pointerId);
    if (cur) {
      const p = canvasPos(e);
      if (cur.sy - p.y > 0.07) jumpBuffer = BUFFER;
    }
    pointers.delete(e.pointerId);
  }

  bootPools();
  resetRun(false);
  // Title attract: a quiet slope already dressed
  player.speed = 0;
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVis);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  window.__controlsTest = {
    getYaw: () => player.yaw,
    getSpeed: () => player.speed,
    setSteer: (v) => {
      qaSteer = v;
    },
    setKeys: (codes) => {
      qaKeys = codes;
    },
  };

  raf = requestAnimationFrame(loop);

  return {
    start: () => {
      unlockAudio();
      resetRun(true);
    },
    restart: () => {
      unlockAudio();
      resetRun(true);
    },
    toggleMute: () => {
      muted = !muted;
      setMuted(muted);
      writeMuted(muted);
      emitUi();
    },
    destroy: () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      if (window.__controlsTest) delete window.__controlsTest;
      squirrels.dispose();
      snowTex.dispose();
      renderer.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
    },
  };
}
