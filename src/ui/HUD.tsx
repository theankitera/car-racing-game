import { useEffect, useMemo, useRef, useState } from 'react'
import { getCachedCurve } from '../game/curve'
import {
  setTouchBoost,
  setTouchBrake,
  setTouchHandbrake,
  setTouchSteer,
  setTouchThrottle,
} from '../game/input'
import { telemetry, type MiniCar } from '../game/telemetry'
import { getTrack } from '../game/tracks'
import { formatLap, ordinal } from '../game/utils'
import type { Settings } from '../game/types'

interface Props {
  trackId: string
  settings: Settings
  onPause: () => void
}

const byPosition = (a: MiniCar, b: MiniCar) => a.position - b.position

export function HUD({ trackId, settings, onPause }: Props) {
  const speedRef = useRef<HTMLSpanElement>(null)
  const gearRef = useRef<HTMLSpanElement>(null)
  const lapRef = useRef<HTMLSpanElement>(null)
  const posRef = useRef<HTMLSpanElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const bestRef = useRef<HTMLSpanElement>(null)
  const lastRef = useRef<HTMLSpanElement>(null)
  const fovRef = useRef<HTMLSpanElement>(null)
  const healthRef = useRef<HTMLElement>(null)
  const healthTxtRef = useRef<HTMLSpanElement>(null)
  const nitroRef = useRef<HTMLElement>(null)
  const needleRef = useRef<SVGGElement>(null)
  const arcRef = useRef<SVGCircleElement>(null)
  const countRef = useRef<HTMLDivElement>(null)
  const countNumRef = useRef<HTMLDivElement>(null)
  const wrongRef = useRef<HTMLDivElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)
  const offRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rowsRef = useRef<Array<HTMLDivElement | null>>([])
  const [isTouch, setIsTouch] = useState(false)

  const curve = useMemo(() => getCachedCurve(getTrack(trackId)), [trackId])
  const totalCars = getTrack(trackId).traffic + 1

  useEffect(() => {
    // `pointer: coarse` is the honest test for "this device is driven by a
    // finger". Sniffing maxTouchPoints alone also matches touchscreen laptops
    // and 2-in-1s, which then had six permanent buttons drawn over the HUD.
    setIsTouch(
      typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches,
    )
  }, [])

  useEffect(() => {
    let raf = 0
    let goTimer = 0
    let lastState = telemetry.state
    const sorted: MiniCar[] = []

    // Minimap projection, prepared once.
    let maxR = 1
    for (const s of curve.samples) maxR = Math.max(maxR, Math.abs(s.x), Math.abs(s.z))
    const project = (x: number, z: number, size: number) => ({
      px: size / 2 + (x / maxR) * (size / 2 - 8),
      py: size / 2 + (z / maxR) * (size / 2 - 8),
    })

    const mapSize = 356
    const path = new Path2D()
    curve.samples.forEach((s, i) => {
      const p = project(s.x, s.z, mapSize)
      if (i === 0) path.moveTo(p.px, p.py)
      else path.lineTo(p.px, p.py)
    })
    path.closePath()

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const t = telemetry

      if (t.state !== lastState) {
        if (t.state === 'racing' && lastState === 'countdown') goTimer = 1
        lastState = t.state
      }
      if (goTimer > 0) goTimer -= 1 / 60

      const unitFactor = settings.units === 'mph' ? 2.2369 : 3.6
      const unitLabel = settings.units === 'mph' ? 'mph' : 'km/h'
      const shown = Math.round(t.speed * unitFactor)
      const speedMax = settings.units === 'mph' ? 220 : 360
      const ratio = Math.min(1, shown / speedMax)

      if (speedRef.current) speedRef.current.textContent = String(shown)
      if (fovRef.current) fovRef.current.textContent = unitLabel
      if (gearRef.current) gearRef.current.textContent = t.gear === 0 ? 'R' : String(t.gear)
      if (lapRef.current) lapRef.current.textContent = `${t.lap}/${t.totalLaps}`
      if (posRef.current) posRef.current.textContent = ordinal(t.position)
      if (timeRef.current) timeRef.current.textContent = formatLap(t.raceTime)
      if (bestRef.current) bestRef.current.textContent = t.bestLap ? formatLap(t.bestLap) : '--:--.--'
      if (lastRef.current) lastRef.current.textContent = t.lastLap ? formatLap(t.lastLap) : '--:--.--'

      const healthPct = Math.max(0, Math.min(100, (t.health / Math.max(t.maxHealth, 1)) * 100))
      if (healthRef.current) healthRef.current.style.width = `${healthPct}%`
      if (healthTxtRef.current) {
        healthTxtRef.current.textContent = `${Math.round(healthPct)}%`
      }
      const nitroPct = Math.max(0, Math.min(100, (t.nitro / Math.max(t.nitroMax, 0.001)) * 100))
      if (nitroRef.current) nitroRef.current.style.width = `${nitroPct}%`

      if (needleRef.current) {
        needleRef.current.style.transform = `rotate(${135 + ratio * 270}deg)`
      }
      if (arcRef.current) {
        const circumference = 2 * Math.PI * 42
        arcRef.current.style.strokeDasharray = `${(ratio * 0.75) * circumference} ${circumference}`
      }

      // countdown overlay
      if (countRef.current && countNumRef.current) {
        if (t.state === 'countdown') {
          countRef.current.style.display = 'flex'
          const n = Math.max(1, Math.ceil(t.countdown))
          countNumRef.current.textContent = String(n)
          countNumRef.current.className = 'num'
        } else if (goTimer > 0) {
          countRef.current.style.display = 'flex'
          countNumRef.current.textContent = 'GO!'
          countNumRef.current.className = 'num go'
        } else {
          countRef.current.style.display = 'none'
        }
      }

      if (wrongRef.current) {
        wrongRef.current.style.display = t.wrongWay ? 'block' : 'none'
      }
      if (flashRef.current) {
        flashRef.current.style.opacity = String(Math.min(0.9, t.damageFlash))
      }
      if (offRef.current) {
        offRef.current.style.opacity = t.offRoad ? '1' : '0'
      }

      // ------------------------------------------------------------ minimap
      const cv = canvasRef.current
      if (cv) {
        const ctx = cv.getContext('2d')
        const size = cv.width
        if (ctx) {
          ctx.clearRect(0, 0, size, size)
          ctx.lineJoin = 'round'
          ctx.lineWidth = 7
          ctx.strokeStyle = 'rgba(255,255,255,0.16)'
          ctx.stroke(path)
          ctx.lineWidth = 2.2
          ctx.strokeStyle = 'rgba(150,200,255,0.55)'
          ctx.stroke(path)

          for (const car of t.cars) {
            const p = project(car.x, car.z, size)
            ctx.beginPath()
            ctx.arc(p.px, p.py, car.isPlayer ? 5 : 3.4, 0, Math.PI * 2)
            ctx.fillStyle = car.isPlayer ? '#ffffff' : car.color
            ctx.fill()
            if (car.isPlayer) {
              ctx.lineWidth = 1.6
              ctx.strokeStyle = '#00e5ff'
              ctx.stroke()
            }
          }
        }
      }

      // --------------------------------------------------------- standings
      // Sorted into a reused buffer: a fresh array every frame is pointless
      // garbage at 60 fps.
      sorted.length = 0
      for (const car of t.cars) sorted.push(car)
      sorted.sort(byPosition)
      for (let i = 0; i < totalCars; i++) {
        const row = rowsRef.current[i]
        if (!row) continue
        const car = sorted[i]
        if (!car) {
          row.style.display = 'none'
          continue
        }
        row.style.display = 'flex'
        row.className = `row${car.isPlayer ? ' me' : ''}`
        const posEl = row.children[0] as HTMLElement
        const dotEl = row.children[1] as HTMLElement
        const nameEl = row.children[2] as HTMLElement
        posEl.textContent = `P${car.position}`
        dotEl.style.background = car.color
        nameEl.textContent = car.name
      }
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [curve, settings.units, totalCars])

  const circ = 2 * Math.PI * 42

  return (
    <div className="hud">
      {/* ---------------------------------------------------------- top bar */}
      <div className="hud-top">
        <div className="cell">
          <span className="k">Pos</span>
          <span className="v mono" ref={posRef}>
            1st
          </span>
        </div>
        <div className="divider" />
        <div className="cell">
          <span className="k">Lap</span>
          <span className="v mono" ref={lapRef}>
            1/3
          </span>
        </div>
        <div className="divider" />
        <div className="cell">
          <span className="k">Time</span>
          <span className="v mono" ref={timeRef}>
            0:00.00
          </span>
        </div>
        <div className="divider" />
        <div className="cell">
          <span className="k">Last</span>
          <span className="v mono" style={{ fontSize: 14 }} ref={lastRef}>
            --:--.--
          </span>
        </div>
        <div className="cell">
          <span className="k">Best</span>
          <span className="v mono" style={{ fontSize: 14 }} ref={bestRef}>
            --:--.--
          </span>
        </div>
        <div className="divider" />
        <button className="btn sm clickable" onClick={onPause} title="Pause (Esc)">
          ⏸
        </button>
      </div>

      {/* --------------------------------------------------------- standings */}
      <div className="lap-list">
        {Array.from({ length: totalCars }, (_, i) => (
          <div
            key={i}
            className="row"
            ref={(el) => {
              rowsRef.current[i] = el
            }}
          >
            <span className="p mono">P{i + 1}</span>
            <span className="dot" />
            <span className="t">RIVAL</span>
          </div>
        ))}
      </div>

      {/* ----------------------------------------------------------- minimap */}
      <div className="minimap">
        <canvas ref={canvasRef} width={356} height={356} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* ------------------------------------------------------------- left */}
      <div className="hud-left">
        <div className="meter health">
          <div className="row">
            <span>Hull</span>
            <span ref={healthTxtRef}>100%</span>
          </div>
          <div className="track">
            <i ref={healthRef} style={{ width: '100%' }} />
          </div>
        </div>
        <div className="meter nitro">
          <div className="row">
            <span>Nitro</span>
            <span>SHIFT</span>
          </div>
          <div className="track">
            <i ref={nitroRef} style={{ width: '50%' }} />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ speedo */}
      <div className="speedo">
        <div className="dial">
          <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="5"
              strokeDasharray={`${0.75 * circ} ${circ}`}
              transform="rotate(135 50 50)"
            />
            <circle
              ref={arcRef}
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="url(#speedGrad)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={`0 ${circ}`}
              transform="rotate(135 50 50)"
            />
            <defs>
              <linearGradient id="speedGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#00e5ff" />
                <stop offset="60%" stopColor="#7c5cff" />
                <stop offset="100%" stopColor="#ff2fd0" />
              </linearGradient>
            </defs>
            <g ref={needleRef} style={{ transformOrigin: '50px 50px' }}>
              <line x1="50" y1="50" x2="50" y2="16" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="50" cy="50" r="3.2" fill="#00e5ff" />
            </g>
          </svg>
          <div className="readout">
            <span className="num mono" ref={speedRef}>
              0
            </span>
            <span className="unit" ref={fovRef}>
              km/h
            </span>
          </div>
        </div>
        <div className="gearbox">
          <span className="g mono" ref={gearRef}>
            1
          </span>
          <span className="lbl">Gear</span>
        </div>
      </div>

      {/* ---------------------------------------------------------- overlays */}
      <div ref={offRef} className="offroad-tint" style={{ opacity: 0, transition: 'opacity 0.2s' }} />
      <div ref={flashRef} className="damage-flash" style={{ opacity: 0 }} />
      <div className="countdown" ref={countRef}>
        <div className="num" ref={countNumRef}>
          3
        </div>
      </div>
      <div className="warn-flag" ref={wrongRef} style={{ display: 'none' }}>
        Wrong way
      </div>

      {isTouch && <TouchControls />}
    </div>
  )
}

function TouchControls() {
  const press = (
    fn: (v: boolean) => void,
    e: React.PointerEvent<HTMLButtonElement>,
  ) => {
    fn(true)
    const el = e.currentTarget
    el.classList.add('on')
    const release = () => {
      fn(false)
      el.classList.remove('on')
      el.removeEventListener('pointerup', release)
      el.removeEventListener('pointercancel', release)
      el.removeEventListener('pointerleave', release)
    }
    el.addEventListener('pointerup', release)
    el.addEventListener('pointercancel', release)
    el.addEventListener('pointerleave', release)
  }

  return (
    <div className="touch">
      <button className="touch-btn left" onPointerDown={(e) => { e.preventDefault(); setTouchSteer(-1) }} onPointerUp={() => setTouchSteer(0)} onPointerCancel={() => setTouchSteer(0)} onPointerLeave={() => setTouchSteer(0)}>
        ◀
      </button>
      <button className="touch-btn right" onPointerDown={(e) => { e.preventDefault(); setTouchSteer(1) }} onPointerUp={() => setTouchSteer(0)} onPointerCancel={() => setTouchSteer(0)} onPointerLeave={() => setTouchSteer(0)}>
        ▶
      </button>
      <button className="touch-btn gas" onPointerDown={(e) => press((v) => setTouchThrottle(v ? 1 : 0), e)}>
        GAS
      </button>
      <button className="touch-btn brake" onPointerDown={(e) => press((v) => setTouchBrake(v ? 1 : 0), e)}>
        BRK
      </button>
      <button className="touch-btn boost" onPointerDown={(e) => press(setTouchBoost, e)}>
        NITRO
      </button>
      <button className="touch-btn drift" onPointerDown={(e) => press(setTouchHandbrake, e)}>
        DRIFT
      </button>
    </div>
  )
}
