import { useState } from 'react'
import { useGame } from '../game/store'
import { audio } from '../game/audio'
import { formatCoins } from '../game/utils'

export function SettingsPanel() {
  const setScreen = useGame((s) => s.setScreen)
  const settings = useGame((s) => s.settings)
  const updateSettings = useGame((s) => s.updateSettings)
  const resetProgress = useGame((s) => s.resetProgress)
  const coins = useGame((s) => s.coins)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn ghost sm" onClick={() => setScreen('menu')}>
          ← Back
        </button>
        <div className="brand" style={{ fontSize: 16 }}>
          Settings
        </div>
        <div className="spacer" />
        <div className="coins">🪙 {formatCoins(coins)}</div>
      </div>

      <div className="screen-body scroll" style={{ maxWidth: 780, width: '100%', margin: '0 auto' }}>
        <div className="panel">
          <div className="panel-head">
            <h2>Display &amp; performance</h2>
          </div>
          <div className="panel-body">
            <Row
              title="Graphics quality"
              hint="Lower it if the frame rate dips. Affects scenery density and resolution."
            >
              <Seg
                options={['low', 'medium', 'high']}
                value={settings.quality}
                onChange={(v) => updateSettings({ quality: v as 'low' | 'medium' | 'high' })}
              />
            </Row>

            <Row title="Units" hint="Speed units shown on the HUD.">
              <Seg
                options={['kmh', 'mph']}
                labels={['km/h', 'mph']}
                value={settings.units}
                onChange={(v) => updateSettings({ units: v as 'kmh' | 'mph' })}
              />
            </Row>

            <Row title="Camera shake" hint="Impacts and kerb strikes rattle the camera.">
              <Seg
                options={['on', 'off']}
                value={settings.shake ? 'on' : 'off'}
                onChange={(v) => updateSettings({ shake: v === 'on' })}
              />
            </Row>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Audio</h2>
          </div>
          <div className="panel-body">
            <Row title="Engine & effects" hint="Fully synthesised engine, tyres and impacts.">
              <Seg
                options={['on', 'off']}
                value={settings.sound ? 'on' : 'off'}
                onChange={(v) => {
                  updateSettings({ sound: v === 'on' })
                  audio.setEnabled(v === 'on')
                }}
              />
            </Row>

            <Row title="Master volume" hint="Overall loudness. The engine note itself never changes.">
              <div className="volume">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  aria-label="Master volume"
                  value={Math.round(settings.volume * 100)}
                  onChange={(e) => {
                    const v = Number(e.target.value) / 100
                    updateSettings({ volume: v })
                    audio.setVolume(v)
                  }}
                />
                <span className="val mono">{Math.round(settings.volume * 100)}%</span>
              </div>
            </Row>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Driving camera</h2>
          </div>
          <div className="panel-body">
            <Row title="View" hint="Chase is the classic view, hood is the fastest to read.">
              <Seg
                options={['chase', 'close', 'hood']}
                value={settings.camera}
                onChange={(v) => updateSettings({ camera: v as 'chase' | 'close' | 'hood' })}
              />
            </Row>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Save data</h2>
          </div>
          <div className="panel-body">
            <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
              Your progress is stored in this browser. Resetting deletes every car, upgrade and
              record.
            </p>
            {confirming ? (
              <div className="result-actions">
                <button
                  className="btn danger"
                  onClick={() => {
                    resetProgress()
                    setConfirming(false)
                  }}
                >
                  Yes, wipe everything
                </button>
                <button className="btn ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="btn danger" onClick={() => setConfirming(true)}>
                Reset all progress
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <div className="settings-row">
      <div className="label">
        <strong>{title}</strong>
        <small>{hint}</small>
      </div>
      {children}
    </div>
  )
}

function Seg({
  options,
  labels,
  value,
  onChange,
}: {
  options: string[]
  labels?: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="seg">
      {options.map((o, i) => (
        <button key={o} className={value === o ? 'on' : ''} onClick={() => onChange(o)}>
          {labels?.[i] ?? o}
        </button>
      ))}
    </div>
  )
}
