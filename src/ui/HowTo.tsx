import { useGame } from '../game/store'

export function HowTo() {
  const setScreen = useGame((s) => s.setScreen)

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn ghost sm" onClick={() => setScreen('menu')}>
          ← Back
        </button>
        <div className="brand" style={{ fontSize: 16 }}>
          How to play
        </div>
        <div className="spacer" />
      </div>

      <div className="screen-body scroll" style={{ maxWidth: 980, width: '100%', margin: '0 auto' }}>
        <div className="howto">
          <div className="card">
            <h4>Controls</h4>
            <ul>
              <li>
                <b>Accelerate</b> — <span className="kbd">W</span> or <span className="kbd">↑</span>
              </li>
              <li>
                <b>Brake / reverse</b> — <span className="kbd">S</span> or <span className="kbd">↓</span>
              </li>
              <li>
                <b>Steer</b> — <span className="kbd">A</span> / <span className="kbd">D</span> or{' '}
                <span className="kbd">←</span> <span className="kbd">→</span>
              </li>
              <li>
                <b>Handbrake / drift</b> — <span className="kbd">Space</span>
              </li>
              <li>
                <b>Nitro</b> — <span className="kbd">Shift</span>
              </li>
              <li>
                <b>Reset to track</b> — <span className="kbd">R</span>
              </li>
              <li>
                <b>Pause</b> — <span className="kbd">Esc</span>
              </li>
            </ul>
            <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
              A gamepad works too: left stick steers, triggers are throttle and brake. On phones and
              tablets on-screen controls appear automatically.
            </p>
          </div>

          <div className="card">
            <h4>Driving fast</h4>
            <ul>
              <li>
                <b>Brake before the corner</b>, not in it. The tyres only have so much grip, and
                asking them to turn and slow down at once will push you wide.
              </li>
              <li>
                <b>Drift the hairpins</b> with the handbrake, then get straight and back on the
                power. Sliding scrubs speed, so keep it short.
              </li>
              <li>
                <b>Use the kerbs.</b> The red and white strips are part of the circuit — clipping
                them is faster than going around.
              </li>
              <li>
                <b>Nitro refills</b> on its own. Save it for the straights where the extra top speed
                actually pays off.
              </li>
            </ul>
          </div>

          <div className="card">
            <h4>Race rules</h4>
            <ul>
              <li>You start at the back of the grid — overtake your way to the front.</li>
              <li>Finish in the top three to fill the podium, and win to take the biggest cheque.</li>
              <li>
                Hitting the barriers dents your hull. If it drops to zero the car is wrecked, but{' '}
                <span className="kbd">R</span> puts you back on the road.
              </li>
              <li>Finishing a circuit unlocks the next one.</li>
            </ul>
          </div>

          <div className="card">
            <h4>Building your car</h4>
            <ul>
              <li>
                <b>Cars</b> — eight models from a starter coupe to a 1,500 hp hypercar. Each has its
                own mass, power, grip and shape.
              </li>
              <li>
                <b>Wheels</b> — swap compounds and rim sizes for grip, power delivery and weight.
              </li>
              <li>
                <b>Upgrades</b> — engine, tyres, chassis armour, nitrous and weight reduction. Each
                one has five levels and applies to every car you own.
              </li>
              <li>
                <b>Paint</b> is free, so make it yours.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
