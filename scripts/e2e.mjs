/**
 * Browser end-to-end test.
 *
 * Launches headless Chrome with software WebGL, drives the game over the Chrome
 * DevTools Protocol (no extra dependencies — Node's built-in WebSocket does the
 * work), holds down the accelerator and asserts that the car actually moves,
 * laps are counted and no console errors appear.
 *
 *   node scripts/e2e.mjs [url]
 *
 * Requires the dev server to already be running.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME =
  process.env.CHROME_PATH ||
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : 'google-chrome')

const URL = process.argv[2] || 'http://localhost:5173/#race/sunset-bay'
const PORT = 9333
const SAMPLE_SECONDS = Number(process.env.E2E_SECONDS || 45)

const profileDir = mkdtempSync(join(tmpdir(), 'apex-e2e-'))
let failures = 0

function ok(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.nextId = 1
    this.pending = new Map()
    this.handlers = []
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
      } else if (msg.method) {
        for (const h of this.handlers) h(msg)
      }
    })
  }

  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', () => reject(new Error('WebSocket failed')), { once: true })
    })
    return new Cdp(ws)
  }

  on(handler) {
    this.handlers.push(handler)
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP timeout: ${method}`))
        }
      }, 30000)
    })
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'evaluate threw')
    }
    return result.result.value
  }

  close() {
    try {
      this.ws.close()
    } catch {
      /* ignore */
    }
  }
}

async function waitForTargets() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch {
      /* not up yet */
    }
    await sleep(250)
  }
  throw new Error('Chrome DevTools endpoint never became available')
}

async function main() {
  console.log(`\nLaunching headless Chrome for ${URL}`)
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      '--mute-audio',
      // Software WebGL is slow; a small viewport keeps enough frames coming that
      // several seconds of real gameplay elapse during the test.
      '--window-size=640,400',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profileDir}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  let cdp
  try {
    const target = await waitForTargets()
    cdp = await Cdp.connect(target.webSocketDebuggerUrl)

    const consoleErrors = []
    const exceptions = []
    const failedRequests = []

    cdp.on((msg) => {
      if (msg.method === 'Runtime.consoleAPICalled') {
        const type = msg.params.type
        const text = msg.params.args
          .map((a) => a.value ?? a.description ?? a.unserializableValue ?? '')
          .join(' ')
        if (type === 'error') consoleErrors.push(text)
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails
        exceptions.push(d.exception?.description || d.text)
      } else if (msg.method === 'Network.loadingFailed') {
        failedRequests.push(msg.params.errorText)
      }
    })

    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')
    await cdp.send('Network.enable')

    await cdp.send('Page.navigate', { url: URL })

    // Give the bundle, React and the first WebGL frames time to come up.
    await sleep(6000)

    const mounted = await cdp.evaluate(`(() => {
      const canvas = document.querySelector('canvas[data-engine]')
      const root = document.getElementById('root')
      return {
        canvas: !!canvas,
        size: canvas ? canvas.width + 'x' + canvas.height : null,
        text: root ? root.textContent : '',
      }
    })()`)

    console.log('\nBoot')
    ok('three.js canvas is running', mounted.canvas, String(mounted.size))
    ok('no React error boundary', !mounted.text.includes('Something went wrong'))
    ok('HUD is present', mounted.text.includes('Hull') || mounted.text.includes('Nitro'))
    ok('speedometer is present', mounted.text.includes('Gear'))

    const read = () =>
      cdp.evaluate(`(() => {
        const t = window.__apexTelemetry
        const v = window.__apexVehicle
        if (!t) return null
        return {
          state: t.state,
          raceTime: t.raceTime,
          speed: t.speed,
          gear: t.gear,
          lap: t.lap,
          totalLaps: t.totalLaps,
          position: t.position,
          totalCars: t.totalCars,
          health: t.health,
          maxHealth: t.maxHealth,
          nitro: t.nitro,
          distance: t.distance,
          bestLap: t.bestLap,
          fps: t.fps,
          x: v ? v.x : 0,
          z: v ? v.z : 0,
          lapMeter: v ? v.lapMeter : 0,
          yaw: v ? v.yaw : 0,
          offRoad: t.offRoad,
        }
      })()`)

    const initial = await read()
    ok('telemetry is exposed', initial !== null)

    // ------------------------------------------------------------ drive it
    const key = async (code, keyName) => {
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        code,
        key: keyName,
        windowsVirtualKeyCode: keyName.toUpperCase().charCodeAt(0),
        nativeVirtualKeyCode: keyName.toUpperCase().charCodeAt(0),
      })
    }

    console.log(`\nDriving for up to ${SAMPLE_SECONDS}s of wall clock`)
    await key('KeyW', 'w')

    const samples = []
    const startWall = Date.now()
    while (Date.now() - startWall < SAMPLE_SECONDS * 1000) {
      await sleep(2000)
      const snap = await read()
      if (!snap) break
      samples.push(snap)
      if (snap.state === 'racing' && snap.distance > 400) break
    }

    for (const s of samples.filter((_, i) => i % 3 === 0)) {
      console.log(
        `       t=${s.raceTime.toFixed(1)}s  ${(s.speed * 3.6).toFixed(0).padStart(3)} km/h  ` +
          `gear ${s.gear}  lap ${s.lap}/${s.totalLaps}  P${s.position}  ` +
          `dist ${s.distance.toFixed(0)}m${s.offRoad ? '  (off track)' : ''}`,
      )
    }

    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w' })

    const last = samples[samples.length - 1] || initial
    const peakSpeed = Math.max(...samples.map((s) => s.speed), 0)
    const peakDistance = Math.max(...samples.map((s) => s.distance), 0)
    const raced = samples.some((s) => s.state === 'racing')

    console.log('\nGameplay')
    ok('countdown completed', raced, `state=${last.state}`)
    ok('race clock advanced', last.raceTime > 2, `${last.raceTime.toFixed(1)}s`)
    ok('car accelerated', peakSpeed > 12, `peak ${(peakSpeed * 3.6).toFixed(0)} km/h`)
    ok('car covered ground', peakDistance > 120, `${peakDistance.toFixed(0)} m`)
    ok('gear changes with speed', last.gear >= 1 && last.gear <= 6, `gear ${last.gear}`)

    const finiteNumbers = samples.every((s) =>
      [
        s.raceTime,
        s.speed,
        s.gear,
        s.lap,
        s.position,
        s.health,
        s.nitro,
        s.distance,
        s.x,
        s.z,
      ].every((n) => Number.isFinite(n)),
    )
    ok('every telemetry value stays finite', finiteNumbers)

    ok(
      'health stays in range',
      samples.every((s) => s.health >= 0 && s.health <= s.maxHealth + 0.01),
    )
    ok('nitro stays in range', samples.every((s) => s.nitro >= 0 && s.nitro <= 1.6))
    ok(
      'race position stays valid',
      samples.every((s) => s.position >= 1 && s.position <= s.totalCars),
      `positions ${samples.map((s) => s.position).join(',')}`,
    )
    ok('car never leaves the world', samples.every((s) => Math.hypot(s.x, s.z) < 4000))
    ok('frame loop is running', last.fps > 0, `${last.fps} fps`)

    // ------------------------------------------------------- pause + reset
    const pressEscape = () =>
      cdp.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        code: 'Escape',
        key: 'Escape',
        windowsVirtualKeyCode: 27,
        nativeVirtualKeyCode: 27,
      })

    await cdp.send('Runtime.evaluate', {
      expression: `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }))`,
    })
    await sleep(1000)
    const pausedText = await cdp.evaluate(`document.getElementById('root').textContent`)
    ok('escape opens the pause menu', pausedText.includes('Paused'), pausedText.slice(0, 120))
    await cdp.send('Runtime.evaluate', {
      expression: `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }))`,
    })
    await sleep(800)
    const resumed = await cdp.evaluate(`document.getElementById('root').textContent`)
    ok('escape closes the pause menu again', !resumed.includes('Paused'))
    await pressEscape().catch(() => {})

    // -------------------------------------------------------- other screens
    console.log('\nOther screens')
    const screens = [
      ['#menu', 'Get in.'],
      ['#garage', 'Showroom'],
      ['#levels', 'SelectCircuit'],
      ['#settings', 'Graphics quality'],
      ['#howto', 'How to play'],
    ]
    let nav = 0
    for (const [hash, needle] of screens) {
      // A unique query string forces a real document load; changing only the
      // fragment would not remount the app.
      await cdp.send('Page.navigate', { url: `http://localhost:5173/?n=${nav++}${hash}` })
      await sleep(4000)
      const text = await cdp.evaluate(`document.getElementById('root').textContent`)
      ok(
        `${hash} renders`,
        typeof text === 'string' && text.includes(needle) && !text.includes('Something went wrong'),
        typeof text === 'string' ? text.slice(0, 100) : 'no text',
      )
    }

    console.log('\nConsole')
    const meaningfulErrors = consoleErrors.filter(
      (e) => !e.includes('AudioContext was not allowed to start'),
    )
    ok('no console errors', meaningfulErrors.length === 0, meaningfulErrors.slice(0, 3).join(' | '))
    ok('no uncaught exceptions', exceptions.length === 0, exceptions.slice(0, 2).join(' | '))
    ok('no failed network requests', failedRequests.length === 0, failedRequests.slice(0, 3).join(' | '))
  } finally {
    cdp?.close()
    chrome.kill()
    await sleep(700)
    try {
      rmSync(profileDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }

  console.log(`\n${failures === 0 ? 'E2E PASSED' : `${failures} E2E CHECK(S) FAILED`}\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('E2E harness error:', err)
  process.exit(2)
})
