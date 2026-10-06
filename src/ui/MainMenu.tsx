import { useMemo } from 'react'
import { CARS, getCar } from '../game/cars'
import { useGame } from '../game/store'
import { computeTuning } from '../game/tuning'
import { TRACKS } from '../game/tracks'
import { formatCoins, kmh } from '../game/utils'
import { getWheel } from '../game/wheels'
import { CarStage } from './CarStage'

export function MainMenu() {
  const setScreen = useGame((s) => s.setScreen)
  const coins = useGame((s) => s.coins)
  const equippedCar = useGame((s) => s.equippedCar)
  const equippedWheel = useGame((s) => s.equippedWheel)
  const paint = useGame((s) => s.paint)
  const upgrades = useGame((s) => s.upgrades)
  const totalRaces = useGame((s) => s.totalRaces)
  const totalWins = useGame((s) => s.totalWins)
  const unlockedTracks = useGame((s) => s.unlockedTracks)
  const records = useGame((s) => s.records)

  const tuning = useMemo(
    () => computeTuning(equippedCar, equippedWheel, upgrades),
    [equippedCar, equippedWheel, upgrades],
  )

  const ownedCount = useGame((s) => s.ownedCars.length)
  const completion = Math.round((unlockedTracks.length / TRACKS.length) * 100)
  const podium = Object.values(records).filter((r) => r.bestPosition > 0 && r.bestPosition <= 3).length

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          Apex<em>Nitro</em>
        </div>
        <span className="tagpill">v1.0</span>
        <div className="spacer" />
        <div className="coins">🪙 {formatCoins(coins)}</div>
      </div>

      <div className="menu">
        <div className="hero">
          <div className="hero-canvas">
            <CarStage tuning={tuning} paint={paint} />
          </div>
          <div className="hero-content">
            <h1>
              Get in.
              <span>Go flat out.</span>
            </h1>
            <p>
              Eight hand-built supercars, five circuits and a full upgrade path. Win races, bank
              the prize money and build a machine nobody can catch.
            </p>
            <div className="hero-actions">
              <button className="btn primary" onClick={() => setScreen('levels')}>
                🏁 Race now
              </button>
              <button className="btn" onClick={() => setScreen('garage')}>
                🔧 Garage
              </button>
            </div>
          </div>
        </div>

        <div className="menu-side scroll">
          <div className="panel">
            <div className="panel-head">
              <h2>Career</h2>
              <span className="tagpill">{completion}% complete</span>
            </div>
            <div className="panel-body">
              <div className="stat-grid">
                <div className="stat">
                  <div className="k">Races</div>
                  <div className="v mono">{totalRaces}</div>
                </div>
                <div className="stat">
                  <div className="k">Wins</div>
                  <div className="v mono">{totalWins}</div>
                </div>
                <div className="stat">
                  <div className="k">Podiums</div>
                  <div className="v mono">{podium}</div>
                </div>
                <div className="stat">
                  <div className="k">Cars</div>
                  <div className="v mono">
                    {ownedCount}/{CARS.length}
                  </div>
                </div>
                <div className="stat">
                  <div className="k">Top speed</div>
                  <div className="v mono" style={{ fontSize: 19 }}>
                    {Math.round(kmh(tuning.maxSpeed))}
                    <small style={{ fontSize: 11, color: 'var(--muted)' }}> km/h</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="k">Circuits</div>
                  <div className="v mono">
                    {unlockedTracks.length}/{TRACKS.length}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Current car</h2>
              <span className="tagpill good">{tuning.car.tier}</span>
            </div>
            <div className="panel-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{tuning.car.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {tuning.car.brand} · {getWheel(equippedWheel).name}
                  </div>
                </div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>
                  {Math.round(tuning.bars.speed * 100)}
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}> PWR</span>
                </div>
              </div>
            </div>
          </div>

          <div className="nav-list">
            <button className="nav-item" onClick={() => setScreen('levels')}>
              <span className="ico">🏁</span>
              <span className="txt">
                <strong>Race</strong>
                <small>{TRACKS.length} circuits · {unlockedTracks.length} unlocked</small>
              </span>
            </button>
            <button className="nav-item" onClick={() => setScreen('garage')}>
              <span className="ico">🔧</span>
              <span className="txt">
                <strong>Garage</strong>
                <small>Buy cars, wheels and performance upgrades</small>
              </span>
            </button>
            <button className="nav-item" onClick={() => setScreen('settings')}>
              <span className="ico">⚙️</span>
              <span className="txt">
                <strong>Settings</strong>
                <small>Graphics, audio, camera and units</small>
              </span>
            </button>
            <button className="nav-item" onClick={() => setScreen('howto')}>
              <span className="ico">🎮</span>
              <span className="txt">
                <strong>How to play</strong>
                <small>Controls, drifting and race rules</small>
              </span>
            </button>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Featured car</h2>
              <span className="tagpill gold">
                {formatCoins(getCar(CARS[CARS.length - 1].id).price)}
              </span>
            </div>
            <div className="panel-body" style={{ color: 'var(--muted)', fontSize: 13 }}>
              <b style={{ color: 'var(--text)' }}>{CARS[CARS.length - 1].name}</b> —{' '}
              {CARS[CARS.length - 1].blurb}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
