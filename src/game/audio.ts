type Buses = {
  ctx: AudioContext;
  master: GainNode;
  sfx: GainNode;
  wind: GainNode;
  windFilter: BiquadFilterNode;
};

let buses: Buses | null = null;
let muted = false;
let windSrc: AudioBufferSourceNode | null = null;

function getBuses(): Buses | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!buses) {
    const ctx = new AC({ latencyHint: "interactive" });
    const master = ctx.createGain();
    const sfx = ctx.createGain();
    const wind = ctx.createGain();
    const windFilter = ctx.createBiquadFilter();
    sfx.gain.value = 0.72;
    wind.gain.value = 0;
    master.gain.value = muted ? 0 : 0.85;
    windFilter.type = "bandpass";
    windFilter.frequency.value = 520;
    windFilter.Q.value = 0.7;
    sfx.connect(master);
    windFilter.connect(wind);
    wind.connect(master);
    master.connect(ctx.destination);
    buses = { ctx, master, sfx, wind, windFilter };
    startWind(buses);
  }
  return buses;
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function startWind(b: Buses) {
  try {
    windSrc?.stop();
  } catch {
    /* already stopped */
  }
  const src = b.ctx.createBufferSource();
  src.buffer = makeNoise(b.ctx);
  src.loop = true;
  src.connect(b.windFilter);
  src.start();
  windSrc = src;
}

export function unlockAudio() {
  const b = getBuses();
  if (!b) return;
  if (b.ctx.state === "suspended") void b.ctx.resume();
}

export function setMuted(next: boolean) {
  muted = next;
  const b = buses;
  if (!b) return;
  b.master.gain.setTargetAtTime(next ? 0 : 0.85, b.ctx.currentTime, 0.02);
}

export function isMuted(): boolean {
  return muted;
}

export function setWindLevel(n: number) {
  const b = buses;
  if (!b || muted) return;
  const t = Math.max(0, Math.min(1, n));
  b.wind.gain.setTargetAtTime(t * 0.07, b.ctx.currentTime, 0.12);
  b.windFilter.frequency.setTargetAtTime(380 + t * 900, b.ctx.currentTime, 0.12);
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain = 0.05,
  slide?: number,
) {
  const b = getBuses();
  if (!b || muted) return;
  const { ctx, sfx } = b;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), ctx.currentTime + dur);
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + dur);
  o.connect(g);
  g.connect(sfx);
  o.start();
  o.stop(ctx.currentTime + dur + 0.03);
}

export function sfxJump() {
  unlockAudio();
  tone(320, 0.12, "sine", 0.04, 520);
}

export function sfxGift() {
  unlockAudio();
  tone(784, 0.09, "triangle", 0.045);
  window.setTimeout(() => tone(1046, 0.12, "sine", 0.035), 50);
}

export function sfxCrash() {
  unlockAudio();
  tone(90, 0.28, "sawtooth", 0.06, 40);
  tone(160, 0.18, "square", 0.03, 70);
}

export function sfxStart() {
  unlockAudio();
  tone(392, 0.1, "triangle", 0.035, 523);
}
