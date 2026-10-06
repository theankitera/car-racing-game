/**
 * Fully synthesised game audio — no asset files, so nothing can fail to load.
 *
 * The engine is a pair of detuned sawtooths through a resonant low-pass whose
 * cutoff tracks throttle load, layered with induction noise. Tyre squeal and
 * wind are filtered noise. Everything is created lazily on the first user
 * gesture so browser autoplay policies are respected.
 */
export class GameAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private engineMix: GainNode | null = null
  private oscA: OscillatorNode | null = null
  private oscB: OscillatorNode | null = null
  private oscSub: OscillatorNode | null = null
  private engineFilter: BiquadFilterNode | null = null
  private screech: GainNode | null = null
  private wind: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private ready = false

  enabled = true
  private volume = 0.55

  /** Must be called from a user gesture (click / keydown / touch). */
  ensure(): void {
    if (this.ready || typeof window === 'undefined') return
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    try {
      const ctx = new Ctor()
      this.ctx = ctx

      const master = ctx.createGain()
      master.gain.value = this.enabled ? this.volume : 0
      master.connect(ctx.destination)
      this.master = master

      // ---- shared noise buffer -------------------------------------------
      const len = Math.floor(ctx.sampleRate * 2)
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
      this.noiseBuffer = buf

      // ---- engine ---------------------------------------------------------
      const engineMix = ctx.createGain()
      engineMix.gain.value = 0

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 900
      filter.Q.value = 6

      const shaper = ctx.createWaveShaper()
      shaper.curve = makeDistortionCurve(28)
      shaper.oversample = '2x'

      engineMix.connect(filter)
      filter.connect(shaper)
      shaper.connect(master)

      const oscA = ctx.createOscillator()
      oscA.type = 'sawtooth'
      oscA.frequency.value = 60
      const oscB = ctx.createOscillator()
      oscB.type = 'square'
      oscB.frequency.value = 60
      oscB.detune.value = 9
      const oscSub = ctx.createOscillator()
      oscSub.type = 'sine'
      oscSub.frequency.value = 30

      const gA = ctx.createGain()
      gA.gain.value = 0.5
      const gB = ctx.createGain()
      gB.gain.value = 0.22
      const gSub = ctx.createGain()
      gSub.gain.value = 0.55

      oscA.connect(gA).connect(engineMix)
      oscB.connect(gB).connect(engineMix)
      oscSub.connect(gSub).connect(engineMix)

      // induction / turbo whoosh
      const induct = ctx.createBufferSource()
      induct.buffer = buf
      induct.loop = true
      const inductFilter = ctx.createBiquadFilter()
      inductFilter.type = 'bandpass'
      inductFilter.frequency.value = 2200
      inductFilter.Q.value = 0.8
      const inductGain = ctx.createGain()
      inductGain.gain.value = 0.05
      induct.connect(inductFilter).connect(inductGain).connect(engineMix)
      induct.start()

      oscA.start()
      oscB.start()
      oscSub.start()

      // ---- tyre screech ---------------------------------------------------
      const screechSrc = ctx.createBufferSource()
      screechSrc.buffer = buf
      screechSrc.loop = true
      const screechFilter = ctx.createBiquadFilter()
      screechFilter.type = 'bandpass'
      screechFilter.frequency.value = 2600
      screechFilter.Q.value = 7
      const screech = ctx.createGain()
      screech.gain.value = 0
      screechSrc.connect(screechFilter).connect(screech).connect(master)
      screechSrc.start()

      // ---- wind -----------------------------------------------------------
      const windSrc = ctx.createBufferSource()
      windSrc.buffer = buf
      windSrc.loop = true
      const windFilter = ctx.createBiquadFilter()
      windFilter.type = 'highpass'
      windFilter.frequency.value = 700
      const wind = ctx.createGain()
      wind.gain.value = 0
      windSrc.connect(windFilter).connect(wind).connect(master)
      windSrc.start()

      this.engineMix = engineMix
      this.oscA = oscA
      this.oscB = oscB
      this.oscSub = oscSub
      this.engineFilter = filter
      this.screech = screech
      this.wind = wind
      this.ready = true
    } catch {
      this.ready = false
    }
  }

  resume(): void {
    this.ensure()
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume()
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.05)
    }
  }

  /** 0..1 master volume. */
  setVolume(v: number): void {
    if (!Number.isFinite(v)) return
    this.volume = Math.max(0, Math.min(1, v))
    if (this.master && this.ctx && this.enabled) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05)
    }
  }

  /**
   * Fades the continuous layers to silence. The engine, tyre and wind gains
   * hold their last value forever unless something rewrites them, and
   * `update()` is not called while the race is frozen — so pause, results and
   * a hidden tab would otherwise leave a permanent engine drone behind the
   * menu. Resuming simply calls `update()` again.
   */
  quiet(): void {
    if (!this.ready || !this.ctx) return
    const t = this.ctx.currentTime
    if (!Number.isFinite(t)) return
    this.engineMix?.gain.setTargetAtTime(0, t, 0.05)
    this.screech?.gain.setTargetAtTime(0, t, 0.05)
    this.wind?.gain.setTargetAtTime(0, t, 0.05)
  }

  /**
   * @param rpm       0..1 engine speed
   * @param load      0..1 throttle load
   * @param speed     0..1 fraction of top speed
   * @param slip      0..1 how much the tyres are sliding
   * @param boosting  nitro engaged
   * @param offRoad   reduced engine sound, more rumble
   */
  update(rpm: number, load: number, speed: number, slip: number, boosting: boolean, offRoad: boolean): void {
    if (!this.ready || !this.ctx) return
    // Web Audio throws on NaN, so never feed it a broken telemetry frame.
    if (!Number.isFinite(rpm + load + speed + slip)) return
    const t = this.ctx.currentTime
    if (!Number.isFinite(t)) return
    const smooth = 0.06

    const base = 42 + rpm * 205
    const boostMul = boosting ? 1.08 : 1
    this.oscA?.frequency.setTargetAtTime(base * boostMul, t, smooth)
    this.oscB?.frequency.setTargetAtTime(base * 0.5 * boostMul, t, smooth)
    this.oscSub?.frequency.setTargetAtTime(base * 0.25, t, smooth)

    const vol = (0.16 + load * 0.3 + speed * 0.16) * (offRoad ? 0.85 : 1)
    this.engineMix?.gain.setTargetAtTime(Math.min(vol, 0.52), t, smooth)

    this.engineFilter?.frequency.setTargetAtTime(420 + rpm * 2600 + load * 900, t, 0.08)

    this.screech?.gain.setTargetAtTime(Math.min(slip * 0.34, 0.34), t, 0.05)
    this.wind?.gain.setTargetAtTime(speed * speed * 0.22, t, 0.1)
  }

  /** One-shot impact noise. `strength` 0..1 */
  impact(strength: number): void {
    if (!this.ready || !this.ctx || !this.master || !this.noiseBuffer) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 320 + strength * 1800
    const gain = ctx.createGain()
    const peak = Math.min(0.55, 0.14 + strength * 0.5)
    gain.gain.setValueAtTime(peak, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22 + strength * 0.2)
    src.connect(filter).connect(gain).connect(this.master)
    src.start(t)
    src.stop(t + 0.5)

    const thump = ctx.createOscillator()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(120 + strength * 60, t)
    thump.frequency.exponentialRampToValueAtTime(38, t + 0.24)
    const tGain = ctx.createGain()
    tGain.gain.setValueAtTime(Math.min(0.5, 0.12 + strength * 0.4), t)
    tGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
    thump.connect(tGain).connect(this.master)
    thump.start(t)
    thump.stop(t + 0.35)
  }

  /** Short UI blip. */
  ui(kind: 'click' | 'back' | 'buy' | 'deny' | 'go' | 'count' = 'click'): void {
    if (!this.ready || !this.ctx || !this.master) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const freqs: Record<string, [number, number]> = {
      click: [520, 720],
      back: [420, 260],
      buy: [600, 1180],
      deny: [220, 150],
      count: [440, 440],
      go: [880, 1320],
    }
    const [f0, f1] = freqs[kind] ?? freqs.click
    osc.type = kind === 'deny' ? 'square' : 'triangle'
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 40), t + 0.13)
    const peak = kind === 'deny' ? 0.1 : 0.16
    gain.gain.setValueAtTime(peak, t)
    gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.2)
    osc.connect(gain).connect(this.master)
    osc.start(t)
    osc.stop(t + 0.25)
  }

  dispose(): void {
    try {
      this.oscA?.stop()
      this.oscB?.stop()
      this.oscSub?.stop()
      void this.ctx?.close()
    } catch {
      /* ignore */
    }
    this.ready = false
    this.ctx = null
  }
}

function makeDistortionCurve(amount: number): Float32Array {
  const n = 1024
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = ((3 + amount) * x * 20 * Math.PI) / (Math.PI + amount * Math.abs(x) * 20)
  }
  return curve
}

export const audio = new GameAudio()
