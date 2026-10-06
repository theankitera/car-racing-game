import { useCallback, useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { audio } from '../game/audio'
import { getCachedCurve } from '../game/curve'
import { clearInputs, setInputEnabled } from '../game/input'
import { useGame } from '../game/store'
import { getTrack } from '../game/tracks'
import { computeTuning } from '../game/tuning'
import type { RaceResult } from '../game/types'
import { RaceScene } from '../three/RaceScene'
import { HUD } from '../ui/HUD'
import { Results } from '../ui/Results'

export function Race() {
  const activeTrack = useGame((s) => s.activeTrack)
  const equippedCar = useGame((s) => s.equippedCar)
  const equippedWheel = useGame((s) => s.equippedWheel)
  const paint = useGame((s) => s.paint)
  const upgrades = useGame((s) => s.upgrades)
  const settings = useGame((s) => s.settings)
  const finishRace = useGame((s) => s.finishRace)
  const startRace = useGame((s) => s.startRace)
  const setScreen = useGame((s) => s.setScreen)
  const isUnlocked = useGame((s) => s.isTrackUnlocked)

  const [paused, setPaused] = useState(false)
  const [result, setResult] = useState<RaceResult | null>(null)
  const [runId, setRunId] = useState(0)

  const spec = useMemo(() => getTrack(activeTrack), [activeTrack])
  const curve = useMemo(() => getCachedCurve(spec), [spec])
  const tuning = useMemo(
    () => computeTuning(equippedCar, equippedWheel, upgrades),
    [equippedCar, equippedWheel, upgrades],
  )
  const frozen = paused || result !== null

  useEffect(() => {
    audio.resume()
    clearInputs()
    return () => {
      clearInputs()
      audio.quiet()
    }
  }, [runId, activeTrack])

  // Pause the moment the tab is hidden. Without this the AI and the race clock
  // keep running while the player cannot see or touch the game.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPaused(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Frozen means the sim is not stepping: swallow the driving input so keys
  // pressed over the pause menu (R especially) do not fire on the first frame
  // after resume, and so held keys cannot leave the car accelerating.
  useEffect(() => {
    setInputEnabled(!frozen)
    if (frozen) {
      clearInputs()
      audio.quiet()
    }
  }, [frozen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        // Auto-repeat would flicker the menu open and shut while Esc is held.
        if (e.repeat) return
        e.preventDefault()
        setPaused((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleComplete = useCallback(
    (r: RaceResult) => {
      const full = finishRace(r.trackId, r)
      setResult(full)
      clearInputs()
    },
    [finishRace],
  )

  const restart = useCallback(() => {
    setResult(null)
    setPaused(false)
    setRunId((n) => n + 1)
  }, [])

  return (
    <div className="app">
      <div className="race-canvas">
        <Canvas
          key={spec.id}
          dpr={settings.quality === 'high' ? [1, 1.75] : settings.quality === 'medium' ? [1, 1.35] : 1}
          gl={{
            antialias: settings.quality !== 'low',
            powerPreference: 'high-performance',
            stencil: false,
          }}
          camera={{ fov: 62, near: 0.25, far: 2400, position: [0, 3.2, -9] }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1.08
          }}
        >
          <RaceScene
            key={`${spec.id}-${runId}`}
            spec={spec}
            curve={curve}
            playerTuning={tuning}
            paint={paint}
            settings={settings}
            paused={frozen}
            onComplete={handleComplete}
          />
        </Canvas>
      </div>

      <HUD trackId={spec.id} settings={settings} onPause={() => setPaused(true)} />

      {paused && !result && (
        <div className="pause-menu">
          <div className="panel">
            <h2>Paused</h2>
            <button className="btn primary block" onClick={() => setPaused(false)}>
              Resume
            </button>
            <button className="btn block" onClick={restart}>
              Restart race
            </button>
            <button
              className="btn block"
              onClick={() => {
                setPaused(false)
                setScreen('garage')
              }}
            >
              Garage
            </button>
            <button
              className="btn ghost block"
              onClick={() => {
                setPaused(false)
                setScreen('levels')
              }}
            >
              Quit to circuits
            </button>
          </div>
        </div>
      )}

      {result && (
        <Results
          result={result}
          onRestart={restart}
          onNext={(trackId) => {
            if (isUnlocked(trackId)) {
              setResult(null)
              setRunId((n) => n + 1)
              startRace(trackId)
            } else {
              setScreen('levels')
            }
          }}
          onGarage={() => {
            setResult(null)
            setScreen('garage')
          }}
          onMenu={() => {
            setResult(null)
            setScreen('menu')
          }}
        />
      )}
    </div>
  )
}
