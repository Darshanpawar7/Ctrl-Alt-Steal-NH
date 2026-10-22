// Every sound is synthesised with Web Audio, so there are no audio files to
// load and nothing to break when the venue Wi-Fi is slow.

let ctx: AudioContext | null = null;
let enabled = false;

export function enableSound(): void {
  ctx ??= new AudioContext();
  void ctx.resume();
  enabled = true;
}

export function soundEnabled(): boolean {
  return enabled && ctx?.state === "running";
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = "sine", gain = 0.2, slideTo?: number): void {
  if (!ctx || !enabled) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  const t = ctx.currentTime + start;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

function noise(start: number, duration: number, gain = 0.15, filterFreq = 1200): void {
  if (!ctx || !enabled) return;
  const length = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  const t = ctx.currentTime + start;
  src.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(filter).connect(amp).connect(ctx.destination);
  src.start(t);
}

export const sfx = {
  tick: () => tone(1400, 0, 0.05, "square", 0.06),
  tock: () => tone(900, 0, 0.06, "square", 0.08),
  buzzer: () => {
    tone(160, 0, 0.9, "sawtooth", 0.22);
    tone(163, 0, 0.9, "sawtooth", 0.18);
  },
  go: () => {
    tone(523, 0, 0.12, "triangle", 0.2);
    tone(784, 0.1, 0.25, "triangle", 0.22);
  },
  success: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.08, 0.3, "triangle", 0.16)),
  fail: () => {
    tone(330, 0, 0.25, "sawtooth", 0.14, 220);
    tone(220, 0.22, 0.45, "sawtooth", 0.14, 140);
  },
  alarm: () => {
    for (let i = 0; i < 4; i++) {
      tone(880, i * 0.3, 0.15, "square", 0.12);
      tone(660, i * 0.3 + 0.15, 0.15, "square", 0.12);
    }
  },
  drumroll: (seconds = 2.2) => {
    for (let t = 0; t < seconds; t += 0.045) noise(t, 0.05, 0.05 + (t / seconds) * 0.12, 220);
    noise(seconds, 0.6, 0.35, 160);
    tone(98, seconds, 0.6, "sine", 0.4);
  },
  whoosh: () => noise(0, 0.5, 0.18, 2400),
  coin: () => {
    tone(988, 0, 0.08, "square", 0.1);
    tone(1319, 0.07, 0.3, "square", 0.1);
  },
  fanfare: () => {
    const notes = [523, 523, 523, 698, 880, 784, 698, 1046];
    notes.forEach((f, i) => tone(f, i * 0.14, i === notes.length - 1 ? 0.9 : 0.16, "triangle", 0.18));
  },
};
