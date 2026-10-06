import { useMemo } from 'react'
import { useGame } from '../game/store'
import { TRACKS } from '../game/tracks'
import { computeTuning } from '../game/tuning'
import { formatCoins, formatTime } from '../game/utils'
import { TrackMap } from './TrackMap'

export function LevelSelect() {
  const setScreen = useGame((s) => s.setScreen)
  const startRace = useGame((s) => s.startRace)
  const coins = useGame((s) => s.coins)
  const unlocked = useGame((s) => s.unlockedTracks)
  const records = useGame((s) => s.records)
  const equippedCar = useGame((s) => s.equippedCar)
  const equippedWheel = useGame((s) => s.equippedWheel)
  const upgrades = useGame((s) => s.upgrades)

  const tuning = useMemo(
    () => computeTuning(equippedCar, equippedWheel, upgrades),
    [equippedCar, equippedWheel, upgrades],
  )

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn ghost sm" onClick={() => setScreen('menu')}>
          ← Back
        </button>
        <div className="brand" style={{ fontSize: 16 }}>
          Select<em>Circuit</em>
        </div>
        <div className="spacer" />
        <span className="tagpill">
          🏎 {tuning.car.name} · {Math.round(tuning.topSpeedKmh)} km/h
        </span>
        <div className="coins">🪙 {formatCoins(coins)}</div>
      </div>

      <div className="screen-body scroll">
        <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6 }}>
          Finish a circuit to unlock the next one. Prize money depends on where you finish and how
          much of the race you complete — the tougher the circuit, the bigger the payout.
        </p>

        <div className="level-grid">
          {TRACKS.map((track) => {
            const isUnlocked = unlocked.includes(track.id)
            const record = records[track.id]
            return (
              <div
                key={track.id}
                className={`level-card${isUnlocked ? '' : ' locked'}`}
                onClick={() => {
                  if (isUnlocked) startRace(track.id)
                }}
              >
                <div className="head">
                  <div>
                    <h3>{track.name}</h3>
                    <div className="loc">{track.location}</div>
                  </div>
                  {record?.finished ? (
                    <span className="tagpill good">
                      {record.bestPosition > 0 ? `P${record.bestPosition}` : 'Done'}
                    </span>
                  ) : (
                    <span className="tagpill">{isUnlocked ? 'Open' : '🔒 Locked'}</span>
                  )}
                </div>

                <div className="map-wrap">
                  <TrackMap trackId={track.id} size={150} />
                </div>

                <div className="blurb">{track.blurb}</div>

                <div className="foot">
                  <span style={{ color: 'var(--muted)' }}>
                    {track.laps} laps · {track.traffic} rivals
                  </span>
                  <div className="diff" title={`Difficulty ${track.difficulty}/5`}>
                    {[1, 2, 3, 4, 5].map((d) => (
                      <i key={d} className={d <= track.difficulty ? 'on' : ''} />
                    ))}
                  </div>
                </div>

                <div className="foot">
                  <span className="tagpill gold">🪙 {formatCoins(track.reward)}</span>
                  <span className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {record?.bestTime ? `Best ${formatTime(record.bestTime)}` : 'No record'}
                  </span>
                </div>

                {isUnlocked ? (
                  <button className="btn primary block">Race →</button>
                ) : (
                  <button className="btn block" disabled>
                    🔒 Finish the previous circuit
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
