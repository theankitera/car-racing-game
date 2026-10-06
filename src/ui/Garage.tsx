import { useEffect, useMemo, useState } from 'react'
import { CARS, getCar } from '../game/cars'
import { useGame } from '../game/store'
import { computeTuning } from '../game/tuning'
import { UPGRADES } from '../game/upgrades'
import { formatCoins } from '../game/utils'
import { WHEELS } from '../game/wheels'
import { CarStage } from './CarStage'

const PAINTS = [
  '#e8443a', '#ff8a1f', '#ffd257', '#3ee27a', '#28d1c8',
  '#2f5fd0', '#7c5cff', '#ff2fd0', '#eef1f6', '#8b93a1',
  '#15161c', '#7b2ff7', '#00e5ff', '#c8a13a',
]

type Tab = 'wheels' | 'upgrades' | 'paint'

export function Garage() {
  const setScreen = useGame((s) => s.setScreen)
  const coins = useGame((s) => s.coins)
  const ownedCars = useGame((s) => s.ownedCars)
  const ownedWheels = useGame((s) => s.ownedWheels)
  const equippedCar = useGame((s) => s.equippedCar)
  const equippedWheel = useGame((s) => s.equippedWheel)
  const paint = useGame((s) => s.paint)
  const upgrades = useGame((s) => s.upgrades)
  const buyCar = useGame((s) => s.buyCar)
  const equipCar = useGame((s) => s.equipCar)
  const buyWheel = useGame((s) => s.buyWheel)
  const equipWheel = useGame((s) => s.equipWheel)
  const setPaint = useGame((s) => s.setPaint)
  const buyUpgrade = useGame((s) => s.buyUpgrade)

  const [preview, setPreview] = useState(equippedCar)
  const [tab, setTab] = useState<Tab>('upgrades')
  const [toast, setToast] = useState<{ msg: string; bad: boolean } | null>(null)

  useEffect(() => setPreview(equippedCar), [equippedCar])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2100)
    return () => window.clearTimeout(id)
  }, [toast])

  const previewTuning = useMemo(
    () => computeTuning(preview, equippedWheel, upgrades),
    [preview, equippedWheel, upgrades],
  )
  const installedTuning = useMemo(
    () => computeTuning(equippedCar, equippedWheel, upgrades),
    [equippedCar, equippedWheel, upgrades],
  )

  const shown = preview === equippedCar ? installedTuning : previewTuning
  const car = getCar(preview)
  const owned = ownedCars.includes(preview)

  const upgradeCostOf = (key: (typeof UPGRADES)[number]['key']) => {
    const def = UPGRADES.find((u) => u.key === key)!
    const level = upgrades[key] ?? 0
    if (level >= def.maxLevel) return Infinity
    return Math.round(def.baseCost * (1 + level * 0.75))
  }

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn ghost sm" onClick={() => setScreen('menu')}>
          ← Back
        </button>
        <div className="brand" style={{ fontSize: 16 }}>
          Garage<em />
        </div>
        <div className="spacer" />
        <span className="tagpill">
          🔧 {car.name} {owned ? '' : '· not owned'}
        </span>
        <div className="coins">🪙 {formatCoins(coins)}</div>
      </div>

      <div className="screen-body scroll garage-body">
        {/* ---------------------------------------------------------- car list */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="panel-head">
            <h2>Showroom</h2>
            <span className="tagpill">
              {ownedCars.length}/{CARS.length} owned
            </span>
          </div>
          <div className="panel-body scroll picker" style={{ maxHeight: '100%' }}>
            {CARS.map((c) => {
              const isOwned = ownedCars.includes(c.id)
              const isActive = equippedCar === c.id
              return (
                <button
                  key={c.id}
                  className={`pick${preview === c.id ? ' active' : ''}${isOwned ? '' : ' locked'}`}
                  onClick={() => setPreview(c.id)}
                >
                  <span
                    className="swatch"
                    style={{ background: `linear-gradient(135deg, ${c.paint}, ${c.accent})` }}
                  />
                  <span className="meta">
                    <b>{c.name}</b>
                    <small>
                      {c.tier} · {Math.round(c.stats.speed * 100)} SPD ·{' '}
                      {Math.round(c.stats.handling * 100)} HDL
                    </small>
                  </span>
                  {isActive ? (
                    <span className="tagpill good">Equipped</span>
                  ) : isOwned ? (
                    <span className="tagpill">Owned</span>
                  ) : (
                    <span className="price">🪙 {formatCoins(c.price)}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ------------------------------------------------------------- stage */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
          <div className="panel" style={{ overflow: 'hidden' }}>
            <div className="car-stage">
              <CarStage tuning={shown} paint={preview === equippedCar ? paint : car.paint} />
              <div className="stage-label">
                <strong>{car.name}</strong>
                <span>
                  {car.brand} · {car.tier}
                </span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Performance</h2>
              <span className="tagpill">
                {Math.round(shown.topSpeedKmh)} km/h · {shown.zeroToHundred.toFixed(1)}s 0-100
              </span>
            </div>
            <div className="panel-body">
              <div className="bars">
                <BarRow label="Top speed" value={shown.bars.speed} />
                <BarRow label="Acceleration" value={shown.bars.accel} />
                <BarRow label="Handling" value={shown.bars.handling} />
                <BarRow label="Braking" value={shown.bars.braking} />
                <div className="bar-row">
                  <div className="bar-label">
                    <span>Mass</span>
                    <span>{Math.round(shown.mass)} kg</span>
                  </div>
                  <div className="bar gold">
                    <i style={{ width: `${clampPct(1 - (shown.mass - 900) / 1000)}%` }} />
                  </div>
                </div>
              </div>
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 14, lineHeight: 1.5 }}>
                {car.blurb}
              </p>
            </div>
          </div>

          <div className="result-actions">
            {!owned ? (
              <>
                <button
                  className="btn primary"
                  disabled={coins < car.price}
                  onClick={() => {
                    if (buyCar(preview)) {
                      setToast({ msg: `${car.name} purchased and equipped!`, bad: false })
                    } else {
                      setToast({ msg: 'Not enough coins for this car.', bad: true })
                    }
                  }}
                >
                  Buy · 🪙 {formatCoins(car.price)}
                </button>
              </>
            ) : (
              <button
                className="btn primary"
                disabled={equippedCar === preview}
                onClick={() => {
                  equipCar(preview)
                  setToast({ msg: `${car.name} is now your race car.`, bad: false })
                }}
              >
                {equippedCar === preview ? 'Equipped' : 'Equip this car'}
              </button>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------- parts */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="panel-head">
            <div className="tabs">
              <button className={`tab${tab === 'upgrades' ? ' active' : ''}`} onClick={() => setTab('upgrades')}>
                Upgrades
              </button>
              <button className={`tab${tab === 'wheels' ? ' active' : ''}`} onClick={() => setTab('wheels')}>
                Wheels
              </button>
              <button className={`tab${tab === 'paint' ? ' active' : ''}`} onClick={() => setTab('paint')}>
                Paint
              </button>
            </div>
          </div>

          <div className="panel-body scroll">
            {tab === 'upgrades' && (
              <>
                {UPGRADES.map((u) => {
                  const level = upgrades[u.key] ?? 0
                  const cost = upgradeCostOf(u.key)
                  const maxed = level >= u.maxLevel
                  return (
                    <div className="upgrade" key={u.key}>
                      <span className="ico">{u.icon}</span>
                      <span className="meta">
                        <b>{u.name}</b>
                        <small>{u.effect}</small>
                        <span className="pips">
                          {Array.from({ length: u.maxLevel }, (_, i) => (
                            <i key={i} className={i < level ? 'on' : ''} />
                          ))}
                        </span>
                      </span>
                      <button
                        className="btn sm"
                        disabled={maxed || coins < cost}
                        onClick={() => {
                          if (buyUpgrade(u.key)) {
                            setToast({ msg: `${u.name} upgraded to level ${level + 1}.`, bad: false })
                          } else {
                            setToast({ msg: 'Not enough coins for that upgrade.', bad: true })
                          }
                        }}
                      >
                        {maxed ? 'MAX' : `🪙 ${formatCoins(cost)}`}
                      </button>
                    </div>
                  )
                })}
                <p style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>
                  Upgrades apply to every car you own, so they are always worth buying.
                </p>
              </>
            )}

            {tab === 'wheels' && (
              <div className="picker">
                {WHEELS.map((w) => {
                  const isOwned = ownedWheels.includes(w.id)
                  const isActive = equippedWheel === w.id
                  return (
                    <div key={w.id} className={`pick${isActive ? ' active' : ''}`}>
                      <span
                        className="swatch"
                        style={{ background: `radial-gradient(circle, ${w.lipColor} 30%, ${w.rimColor} 70%)` }}
                      />
                      <span className="meta">
                        <b>{w.name}</b>
                        <small>
                          {w.gripBonus >= 1 ? `+${Math.round((w.gripBonus - 1) * 100)}% grip` : `${Math.round((w.gripBonus - 1) * 100)}% grip`}
                          {' · '}
                          {w.accelBonus >= 1 ? `+${Math.round((w.accelBonus - 1) * 100)}% power` : `${Math.round((w.accelBonus - 1) * 100)}% power`}
                          {w.massDelta !== 0 ? ` · ${w.massDelta > 0 ? '+' : ''}${w.massDelta} kg` : ''}
                        </small>
                      </span>
                      {isOwned ? (
                        <button
                          className="btn sm"
                          disabled={isActive}
                          onClick={() => {
                            equipWheel(w.id)
                            setToast({ msg: `${w.name} fitted.`, bad: false })
                          }}
                        >
                          {isActive ? 'Fitted' : 'Fit'}
                        </button>
                      ) : (
                        <button
                          className="btn sm"
                          disabled={coins < w.price}
                          onClick={() => {
                            if (buyWheel(w.id)) setToast({ msg: `${w.name} purchased.`, bad: false })
                            else setToast({ msg: 'Not enough coins for these wheels.', bad: true })
                          }}
                        >
                          🪙 {formatCoins(w.price)}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {tab === 'paint' && (
              <>
                <div className="colors">
                  {PAINTS.map((c) => (
                    <button
                      key={c}
                      className={`color-dot${paint === c ? ' active' : ''}`}
                      style={{ background: c }}
                      title={c}
                      onClick={() => {
                        setPaint(c)
                        setToast({ msg: 'Livery updated.', bad: false })
                      }}
                    />
                  ))}
                </div>
                <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 16, lineHeight: 1.5 }}>
                  Paint is free and applies to your equipped car. Choosing a new car resets it to the
                  factory colour.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {toast && <div className={`toast${toast.bad ? ' bad' : ''}`}>{toast.msg}</div>}
    </div>
  )
}

function BarRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="bar-row">
      <div className="bar-label">
        <span>{label}</span>
        <span>{Math.round(value * 100)}</span>
      </div>
      <div className="bar">
        <i style={{ width: `${clampPct(value)}%` }} />
      </div>
    </div>
  )
}

const clampPct = (v: number) => Math.max(3, Math.min(100, v * 100))
