import { getTrack, TRACKS, trackIndex } from '../game/tracks'
import type { RaceResult } from '../game/types'
import { formatCoins, formatTime, ordinal } from '../game/utils'

interface Props {
  result: RaceResult
  onRestart: () => void
  onNext: (trackId: string) => void
  onGarage: () => void
  onMenu: () => void
}

export function Results({ result, onRestart, onNext, onGarage, onMenu }: Props) {
  const track = getTrack(result.trackId)
  const idx = trackIndex(result.trackId)
  const next = idx + 1 < TRACKS.length ? TRACKS[idx + 1] : null

  const won = result.finished && result.position === 1
  const podium = result.finished && result.position <= 3

  return (
    <div className="results">
      <div className="panel results-card">
        <div className={`place${result.finished ? '' : ' fail'}`}>
          {result.finished ? ordinal(result.position) : 'DNF'}
        </div>
        <div className="subtitle">
          {track.name} · {won ? 'Victory' : podium ? 'Podium finish' : result.finished ? 'Race complete' : 'Retired'}
        </div>

        <div className="result-grid">
          <div className="cell">
            <div className="k">Total time</div>
            <div className="v mono">{result.finished ? formatTime(result.totalTime) : '—'}</div>
          </div>
          <div className="cell">
            <div className="k">Best lap</div>
            <div className="v mono">{result.bestLap > 0 ? formatTime(result.bestLap) : '—'}</div>
          </div>
          <div className="cell">
            <div className="k">Laps</div>
            <div className="v mono">
              {result.laps}/{track.laps}
            </div>
          </div>
        </div>

        <div className="award">🪙 Prize money +{formatCoins(result.coins)}</div>

        {result.newRecord && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <span className="tagpill gold">🏆 New personal best</span>
          </div>
        )}

        <div className="result-actions" style={{ marginTop: 22 }}>
          <button className="btn primary" onClick={onRestart}>
            ↻ Race again
          </button>
          {next && (
            <button className="btn gold" onClick={() => onNext(next.id)}>
              {next.name} →
            </button>
          )}
        </div>
        <div className="result-actions" style={{ marginTop: 10 }}>
          <button className="btn" onClick={onGarage}>
            🔧 Spend coins
          </button>
          <button className="btn ghost" onClick={onMenu}>
            Main menu
          </button>
        </div>
      </div>
    </div>
  )
}
