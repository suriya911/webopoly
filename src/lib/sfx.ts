// Tiny synthesized sound effects (no audio files needed).

let ctx: AudioContext | null = null
let enabled = true

function ac() {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.15, delay = 0, slideTo?: number) {
  if (!enabled) return
  const c = ac()
  const t = c.currentTime + delay
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(c.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function noise(dur: number, gain = 0.2, delay = 0) {
  if (!enabled) return
  const c = ac()
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = 2200
  const g = c.createGain()
  g.gain.value = gain
  src.connect(f).connect(g).connect(c.destination)
  src.start(c.currentTime + delay)
}

export const sfx = {
  setEnabled(v: boolean) {
    enabled = v
  },
  get enabled() {
    return enabled
  },
  unlock() {
    if (enabled) ac()
  },
  dice() {
    for (let i = 0; i < 7; i++) noise(0.05, 0.25, i * 0.09 + Math.random() * 0.03)
  },
  step() {
    tone(520, 0.06, 'triangle', 0.05)
  },
  coinIn() {
    tone(988, 0.08, 'square', 0.05)
    tone(1319, 0.25, 'square', 0.05, 0.08)
  },
  coinOut() {
    tone(660, 0.1, 'triangle', 0.08)
    tone(440, 0.2, 'triangle', 0.08, 0.1)
  },
  thwip() {
    tone(1800, 0.18, 'sawtooth', 0.04, 0, 300)
    noise(0.12, 0.08)
  },
  jail() {
    tone(160, 0.35, 'sawtooth', 0.08)
    tone(120, 0.5, 'sawtooth', 0.08, 0.3)
  },
  card() {
    tone(660, 0.1, 'sine', 0.08)
    tone(880, 0.1, 'sine', 0.08, 0.1)
    tone(1175, 0.25, 'sine', 0.08, 0.2)
  },
  yourTurn() {
    tone(523, 0.12, 'triangle', 0.1)
    tone(659, 0.12, 'triangle', 0.1, 0.12)
    tone(784, 0.3, 'triangle', 0.1, 0.24)
  },
  build() {
    tone(300, 0.08, 'square', 0.06)
    tone(450, 0.08, 'square', 0.06, 0.1)
    tone(600, 0.15, 'square', 0.06, 0.2)
  },
  win() {
    ;[523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, i * 0.15))
  },
}
