/**
 * Headless smoke test. Everything that can break without a browser is exercised
 * here: track construction, car geometry, the physics step, AI laps and the
 * upgrade economy. Run with `npm run smoke`.
 */
import * as THREE from 'three'
import { autopilot } from './autopilot'
import { createAiCar, resolveAiSpacing, stepAi } from '../src/game/ai'
import { CARS, STARTER_CAR, getCar } from '../src/game/cars'
import { buildTrackCurve } from '../src/game/curve'
import { TRACKS, getTrack } from '../src/game/tracks'
import { computeReward, computeTuning } from '../src/game/tuning'
import { UPGRADES, UPGRADE_MAP, emptyUpgrades, upgradeCost } from '../src/game/upgrades'
import { createVehicle, rankRace, resetToTrack, stepVehicle } from '../src/game/vehicle'
import { sanitizeSave } from '../src/game/store'
import type { SaveData } from '../src/game/types'
import { WHEELS } from '../src/game/wheels'
import { buildCarGeometries } from '../src/three/carGeometry'

let failures = 0

function ok(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function section(title: string): void {
  console.log(`\n${title}`)
}

const finite = (...values: number[]) => values.every((v) => Number.isFinite(v))

// ---------------------------------------------------------------- geometry
section('Car geometry')
for (const car of CARS) {
  const geo = buildCarGeometries(car.shape)
  const pos = geo.body.getAttribute('position')
  const canopy = geo.canopy.getAttribute('position')
  const roof = geo.roof.getAttribute('position')
  let maxAbs = 0
  let allFinite = true
  for (let i = 0; i < pos.count * 3; i++) {
    const v = pos.array[i] as number
    if (!Number.isFinite(v)) allFinite = false
    maxAbs = Math.max(maxAbs, Math.abs(v))
  }
  // The three shells together make up the whole car.
  const bounds = new THREE.Box3()
  for (const g of [geo.body, geo.canopy, geo.roof]) {
    g.computeBoundingBox()
    bounds.union(g.boundingBox!)
  }
  const length = bounds.max.z - bounds.min.z
  const width = bounds.max.x - bounds.min.x
  const roofTop = bounds.max.y
  const floor = bounds.min.y

  ok(`${car.id}: body has vertices`, pos.count > 600, `${pos.count}`)
  ok(`${car.id}: canopy and roof exist`, canopy.count > 100 && roof.count > 100)
  ok(`${car.id}: all vertices finite`, allFinite)
  ok(`${car.id}: sane scale`, maxAbs < 8, `maxAbs=${maxAbs.toFixed(2)}`)
  ok(
    `${car.id}: length ≈ ${car.shape.length}`,
    Math.abs(length - car.shape.length) < 0.35,
    `got ${length.toFixed(2)}`,
  )
  ok(
    `${car.id}: width ≈ ${car.shape.width}`,
    width > car.shape.width * 0.7 && width < car.shape.width * 1.1,
    `got ${width.toFixed(2)}`,
  )
  ok(
    `${car.id}: roof reaches ~${car.shape.height}m`,
    Math.abs(roofTop - car.shape.height) < 0.22,
    `got ${roofTop.toFixed(2)}`,
  )
  ok(
    `${car.id}: bodywork clears the ground`,
    floor > 0.06 && floor < 0.5,
    `floor at ${floor.toFixed(2)}`,
  )
}

// ------------------------------------------------------------------- tracks
section('Tracks')
type CurveInfo = { id: string; curve: ReturnType<typeof buildTrackCurve> }
const curves: CurveInfo[] = []

for (const spec of TRACKS) {
  const curve = buildTrackCurve(spec)
  curves.push({ id: spec.id, curve })

  ok(`${spec.id}: has samples`, curve.count >= 500, `${curve.count}`)
  ok(`${spec.id}: length is plausible`, curve.length > 500 && curve.length < 4000, `${curve.length.toFixed(0)}m`)

  // Every sample must be resolvable back to its own index.
  let worst = 0
  let worstIndexErr = 0
  for (let i = 0; i < curve.count; i += 7) {
    const s = curve.samples[i]
    const n = curve.nearest(s.x, s.z, i)
    const idxErr = Math.min(Math.abs(n.index - i), curve.count - Math.abs(n.index - i))
    worstIndexErr = Math.max(worstIndexErr, idxErr)
    worst = Math.max(worst, n.distance)
  }
  ok(`${spec.id}: nearest() finds the right sample`, worstIndexErr <= 2, `err=${worstIndexErr}`)
  ok(`${spec.id}: nearest() distance is ~0 on the line`, worst < 1.5, `${worst.toFixed(3)}m`)

  // Report the tightest corner so track difficulty stays honest.
  let tightest = Infinity
  let tightestIdx = 0
  for (let i = 0; i < curve.count; i++) {
    const r = 1 / Math.max(curve.curvature[i], 1e-6)
    if (r < tightest) {
      tightest = r
      tightestIdx = i
    }
  }
  const minSpeed = Math.sqrt(12.4 * Math.max(tightest, 5))
  console.log(
    `       ${spec.id}: tightest corner ${tightest.toFixed(0)}m at sample ${tightestIdx}, ` +
      `≈${minSpeed.toFixed(0)} m/s (${(minSpeed * 3.6).toFixed(0)} km/h) at base grip`,
  )
  // Hairpins are a deliberate part of the design; this only guards against the
  // curve generator folding a corner tighter than the tyres can ever handle.
  ok(
    `${spec.id}: tightest corner is drivable`,
    tightest > 18 && minSpeed > 15,
    `${tightest.toFixed(1)}m`,
  )

  // The grid sits on control point 0, so the start must not be mid-corner.
  const startRadius = 1 / Math.max(curve.curvature[0], 1e-6)
  ok(
    `${spec.id}: start line is on a straight`,
    startRadius > 150,
    `${startRadius.toFixed(0)}m radius`,
  )

  // Lateral offsets must measure the true distance from the centre line.
  let lateralErr = 0
  for (let i = 0; i < curve.count; i += 11) {
    const p = curve.positionAt(i / curve.count, curve.halfWidth * 0.5, new THREE.Vector3())
    const n = curve.nearest(p.x, p.z, i)
    lateralErr = Math.max(lateralErr, Math.abs(Math.abs(n.lateral) - curve.halfWidth * 0.5))
  }
  ok(`${spec.id}: lateral offset is accurate`, lateralErr < 0.35, `${lateralErr.toFixed(3)}m`)

  const startYaw = curve.headingAt(0)
  const ahead = curve.positionAt(0.01, 0, new THREE.Vector3())
  const start = curve.positionAt(0, 0, new THREE.Vector3())
  const dot =
    Math.sin(startYaw) * (ahead.x - start.x) + Math.cos(startYaw) * (ahead.z - start.z)
  ok(`${spec.id}: headingAt() points along the track`, dot > 0, `dot=${dot.toFixed(2)}`)
}

// ------------------------------------------------------------------ tuning
section('Tuning and economy')
for (const car of CARS) {
  for (const wheel of WHEELS) {
    for (const level of [0, 5]) {
      const upgrades = emptyUpgrades()
      for (const key of Object.keys(upgrades) as Array<keyof typeof upgrades>) upgrades[key] = level
      const t = computeTuning(car.id, wheel.id, upgrades)
      const label = `${car.id}/${wheel.id}/L${level}`
      ok(
        `${label}: tuning is finite`,
        finite(t.mass, t.power, t.brake, t.maxSpeed, t.grip, t.steer, t.maxHealth, t.nitroRegen, t.nitroCapacity, t.wheelRadius, t.wheelWidth),
      )
      ok(
        `${label}: tuning is positive`,
        t.mass > 400 && t.power > 1000 && t.maxSpeed > 40 && t.grip > 8 && t.maxHealth > 50,
      )
      ok(
        `${label}: bars within 0..1`,
        [t.bars.speed, t.bars.accel, t.bars.handling, t.bars.braking].every((b) => b > 0 && b <= 1),
      )
    }
  }
}

for (const def of UPGRADES) {
  let last = 0
  let monotonic = true
  for (let level = 0; level < def.maxLevel; level++) {
    const cost = upgradeCost(def.key, level)
    if (cost <= last) monotonic = false
    last = cost
  }
  ok(`${def.key}: costs rise with level`, monotonic, `last=${last}`)
  ok(`${def.key}: max level is terminal`, !Number.isFinite(upgradeCost(def.key, def.maxLevel)))
}

const rewards = [1, 2, 3, 4, 5, 6, 7].map((p) => computeReward(getTrack('sunset-bay'), p, 3, true))
ok(
  'rewards fall off with finishing position',
  rewards.every((r, i) => i === 0 || r <= rewards[i - 1]),
  rewards.join(','),
)
ok('winner earns the full prize', rewards[0] >= getTrack('sunset-bay').reward)
ok('a DNF still pays something', computeReward(getTrack('sunset-bay'), 8, 1, false) > 0)

// --------------------------------------------------------- physics autopilot
section('Physics: driving the full lap')

function runLapTest(trackId: string, carId: string, seconds: number) {
  const spec = getTrack(trackId)
  const curve = buildTrackCurve(spec)
  const tuning = computeTuning(carId, 'stock', emptyUpgrades())
  const v = createVehicle(curve, tuning, 0, 4, true)
  const dt = 1 / 60
  let time = 0
  let offRoadFrames = 0
  let invalid = false
  let maxLateral = 0
  let topSpeed = 0

  while (time < seconds) {
    const input = autopilot(v, curve, tuning)
    stepVehicle(v, tuning, input, curve, dt, time, spec.laps)
    time += dt
    if (!finite(v.x, v.z, v.yaw, v.vLong, v.vLat, v.lapMeter, v.health)) invalid = true
    const near = curve.nearest(v.x, v.z, v.nearestIndex)
    maxLateral = Math.max(maxLateral, Math.abs(near.lateral))
    topSpeed = Math.max(topSpeed, Math.abs(v.vLong))
    if (near.distance > curve.halfWidth) offRoadFrames++
  }

  const offRoadPct = (offRoadFrames / (time / dt)) * 100
  return { v, time, invalid, offRoadPct, maxLateral, topSpeed, curve, spec }
}

for (const spec of TRACKS) {
  const result = runLapTest(spec.id, 'kestrel', spec.laps * 30 + 30)
  const v = result.v
  ok(`${spec.id}: no NaN while driving`, !result.invalid)
  ok(
    `${spec.id}: stays on the tarmac`,
    result.offRoadPct < 8,
    `${result.offRoadPct.toFixed(1)}% off`,
  )
  ok(
    `${spec.id}: does not tunnel through the barriers`,
    result.maxLateral < result.curve.wallHalf + 0.6,
    `max ${result.maxLateral.toFixed(2)} vs ${result.curve.wallHalf.toFixed(2)}`,
  )
  ok(`${spec.id}: autopilot completes laps`, v.lapsDone >= 1, `laps=${v.lapsDone}`)
  ok(`${spec.id}: lap time is believable`, v.bestLap > 8 && v.bestLap < 180, `${v.bestLap.toFixed(1)}s`)
  ok(
    `${spec.id}: reaches a decent top speed`,
    result.topSpeed > 26,
    `${result.topSpeed.toFixed(1)} m/s reached`,
  )
}

// ------------------------------------------------------------- every car laps
section('Every car can lap the easiest circuit')
for (const car of CARS) {
  const result = runLapTest('sunset-bay', car.id, 120)
  ok(
    `${car.id}: completes a lap`,
    !result.invalid && result.v.lapsDone >= 1,
    `laps=${result.v.lapsDone}`,
  )
  ok(
    `${car.id}: comparable pace`,
    result.v.bestLap > 8 && result.v.bestLap < 150,
    `${result.v.bestLap.toFixed(1)}s best lap`,
  )
}

// ----------------------------------------------------------------- collision
section('Barrier collisions')
{
  const spec = getTrack('redline')
  const curve = buildTrackCurve(spec)
  const tuning = computeTuning('kestrel', 'stock', emptyUpgrades())
  const v = createVehicle(curve, tuning, 0, 4, true)
  // Aim straight at the wall at full throttle.
  v.yaw = curve.headingAt(0) + Math.PI / 2
  v.vLong = 40
  const healthBefore = v.health
  for (let i = 0; i < 180; i++) {
    stepVehicle(v, tuning, { throttle: 1, steer: 0, handbrake: false, boost: false }, curve, 1 / 60, i / 60, spec.laps)
  }
  ok('impact damages the car', v.health < healthBefore, `${healthBefore} -> ${v.health}`)
  ok('car is still finite after the crash', finite(v.x, v.z, v.vLong, v.vLat, v.health))
  ok(
    'car is pushed back inside the barriers',
    Math.abs(curve.nearest(v.x, v.z, v.nearestIndex).lateral) <= curve.wallHalf + 0.01,
  )
}

section('Degenerate frames')
{
  const spec = getTrack('sunset-bay')
  const curve = buildTrackCurve(spec)
  const tuning = computeTuning('kestrel', 'stock', emptyUpgrades())
  const v = createVehicle(curve, tuning, 0, 4, true)

  // The first animation frame a browser delivers has a delta of zero, which used
  // to divide by zero and turn the entire car state into NaN.
  stepVehicle(
    v,
    tuning,
    { throttle: 1, steer: 0.4, handbrake: false, boost: true },
    curve,
    0,
    0,
    spec.laps,
  )
  ok(
    'a zero-length frame is ignored',
    finite(v.x, v.z, v.yaw, v.vLong, v.vLat, v.lapMeter, v.health),
    `vLat=${v.vLat}`,
  )

  stepVehicle(
    v,
    tuning,
    { throttle: 1, steer: 0, handbrake: false, boost: false },
    curve,
    Number.NaN,
    0,
    spec.laps,
  )
  ok('a NaN frame is ignored', finite(v.x, v.z, v.yaw, v.vLong, v.vLat, v.health))

  for (let i = 0; i < 900; i++) {
    stepVehicle(v, tuning, autopilot(v, curve, tuning), curve, 1 / 60, i / 60, spec.laps)
  }
  ok(
    'the car still drives after a degenerate frame',
    Math.abs(v.vLong) > 10 && finite(v.x, v.z, v.yaw, v.vLat),
    `vLong=${v.vLong.toFixed(1)}`,
  )
}

section('Wreck and recover')
{
  const spec = getTrack('sunset-bay')
  const curve = buildTrackCurve(spec)
  const tuning = computeTuning('kestrel', 'stock', emptyUpgrades())
  const v = createVehicle(curve, tuning, 0, 4, true)
  v.health = 0.4
  v.nearestIndex = 0
  v.yaw = curve.headingAt(0) + Math.PI / 2
  v.vLong = 45
  for (let i = 0; i < 240; i++) {
    stepVehicle(v, tuning, { throttle: 1, steer: 0, handbrake: false, boost: false }, curve, 1 / 60, i / 60, spec.laps)
  }
  ok('health reaching zero wrecks the car', v.wrecked)
  resetToTrack(v, curve, true, tuning)
  ok('reset clears the wreck', !v.wrecked && v.health > 10)
  ok('reset is back on the racing line', curve.nearest(v.x, v.z, v.nearestIndex).distance < 8)
}

// ------------------------------------------------------------------------ AI
section('AI opponents')
{
  const spec = getTrack('neon')
  const curve = buildTrackCurve(spec)
  const cars = []
  for (let i = 0; i < spec.traffic; i++) {
    const car = CARS[i % CARS.length]
    const tuning = computeTuning(car.id, 'striker', emptyUpgrades())
    cars.push(createAiCar(curve, `ai-${i}`, car.id, 'striker', tuning, i, spec.traffic, 0.88))
  }

  const dt = 1 / 60
  let time = 0
  let offTrack = 0
  let invalid = false
  while (time < 200) {
    for (const ai of cars) {
      stepAi(ai, curve, dt, time, spec.laps, { paceScale: 1, halfWidth: curve.halfWidth })
      if (!finite(ai.x, ai.z, ai.yaw, ai.speed, ai.t, ai.lapMeter)) invalid = true
      if (curve.nearest(ai.x, ai.z, -1).distance > curve.wallHalf) offTrack++
    }
    resolveAiSpacing(cars)
    time += dt
  }

  ok('AI never produces NaN', !invalid)
  ok('AI stays inside the barriers', offTrack === 0, `${offTrack} excursions`)
  ok(
    'AI completes multiple laps',
    cars.every((ai) => ai.lapsDone >= 2),
    cars.map((ai) => ai.lapsDone).join(','),
  )
  ok(
    'AI lap times are believable',
    cars.every((ai) => ai.bestLap === 0 || (ai.bestLap > 8 && ai.bestLap < 200)),
    cars.map((ai) => ai.bestLap.toFixed(1)).join(','),
  )
  ok(
    'AI speeds stay under the car limit',
    cars.every((ai) => ai.speed <= ai.tuning.maxSpeed * 1.2 + 1),
  )
  ok('AI spreads out rather than stacking', new Set(cars.map((ai) => Math.round(ai.lane))).size > 1)
}

// ---------------------------------------------------------- lap timing
section('Lap timing integrity')
{
  // Reversing back over the start line used to re-arm the lap timer: the next
  // forward crossing wrote a lap of a few seconds into lastLap and, worse,
  // into the permanent bestLap record.
  const spec = getTrack('sunset-bay')
  const curve = buildTrackCurve(spec)
  const tuning = computeTuning('kestrel', 'stock', emptyUpgrades())
  const v = createVehicle(curve, tuning, 0, 4, true)

  const place = (t: number) => {
    const wrapped = ((t % 1) + 1) % 1
    const p = curve.positionAt(wrapped, 0, new THREE.Vector3())
    v.x = p.x
    v.z = p.z
    v.yaw = curve.headingAt(wrapped)
    v.vLong = 0
    v.vLat = 0
    v.nearestIndex = Math.floor(wrapped * curve.count)
  }

  // Mid-race: one lap already recorded with a believable best, and the last
  // lap completed right now — so a re-armed timer would produce a lap of a
  // fraction of a second instead of the 30 s on the books.
  const dt = 0.1
  let time = 40
  place(0.004)
  v.progress = 0.004
  v.lapMeter = 1.004
  v.lapsDone = 1
  v.lapStart = time
  v.lastLapTime = 30
  v.bestLap = 30

  const step = () => {
    stepVehicle(v, tuning, { throttle: 0, steer: 0, handbrake: false, boost: false }, curve, dt, time, spec.laps)
    time += dt
  }

  // Back up across the line, then drive through it again.
  for (let t = 0.999; t > 0.985; t -= 0.004) {
    place(t)
    step()
  }
  ok('reversing drops the lap counter reading', Math.floor(v.lapMeter) < 1, `lapMeter=${v.lapMeter}`)
  ok('reversing does not lose a completed lap', v.lapsDone === 1, `laps=${v.lapsDone}`)

  for (let t = 0.99; t < 1.02; t += 0.004) {
    place(t)
    step()
  }
  ok('crossing the line again does not add a lap', v.lapsDone === 1, `laps=${v.lapsDone}`)
  ok('the best lap survives a backwards crossing', v.bestLap === 30, `bestLap=${v.bestLap}`)
  ok('no bogus short lap is recorded', v.lastLapTime === 30, `lastLap=${v.lastLapTime}`)

  // A genuine full lap afterwards must still be counted and timed. The loop
  // runs past the line on purpose: a lap must never depend on landing on
  // exactly 2.000000.
  place(0.004)
  v.progress = 0.004
  v.lapMeter = 1.004
  v.lapStart = time
  for (let i = 1; i <= 110; i++) {
    place(i / 100)
    step()
  }
  ok('a real second lap is still counted', v.lapsDone === 2, `laps=${v.lapsDone} meter=${v.lapMeter}`)
  ok('the real lap is timed from the previous line', v.lastLapTime > 0, `lastLap=${v.lastLapTime}`)
}

section('Standings')
{
  const field = [
    { finished: false, finishTime: 0, lapMeter: 3.2, position: 0 },
    { finished: false, finishTime: 0, lapMeter: 1.1, position: 0 },
    { finished: true, finishTime: 95, lapMeter: 0, position: 0 },
    { finished: false, finishTime: 0, lapMeter: 5.5, position: 0 },
  ]
  rankRace(field)
  const places = field.map((c) => c.position).join(',')
  ok('every place is assigned exactly once', places.split(',').sort().join(',') === '1,2,3,4', places)
  ok('the car that finished is leading', field[2].position === 1)
  ok(
    'distance decides the rest',
    field[3].position === 2 && field[0].position === 3 && field[1].position === 4,
    places,
  )
}

section('Save repair')
{
  const dirty = {
    version: 1,
    coins: -500,
    ownedCars: [STARTER_CAR, 'no-such-car'],
    ownedWheels: ['stock'],
    equippedCar: 'nebula',
    equippedWheel: 'stock',
    paint: '#ff0000',
    upgrades: { engine: 99, tires: -3, armor: 'x', nitro: 2, chassis: 1 },
    records: {
      'sunset-bay': { finished: true, bestPosition: 2, bestTime: 100, bestLap: 30, wins: 1 },
      bogus: { finished: 'yes', bestPosition: 'first', bestTime: -5, bestLap: null, wins: 2 },
    },
    settings: { quality: 'potato', sound: false, volume: 9, shake: true, units: 'mph', camera: 'hood' },
    totalRaces: -4,
    totalWins: 1.5,
    totalDistance: NaN,
    unlockedTracks: ['sunset-bay', 'nope'],
  } as unknown as Partial<SaveData>

  const clean = sanitizeSave(dirty)
  ok('coins are never negative', clean.coins >= 0, `${clean.coins}`)
  ok('unknown cars are dropped', !clean.ownedCars.includes('no-such-car'))
  ok('the starter car is always owned', clean.ownedCars.includes(STARTER_CAR))
  ok('equipping an unowned car falls back to the starter', clean.equippedCar === STARTER_CAR)
  ok(
    'upgrade levels are clamped to the cap',
    clean.upgrades.engine === UPGRADE_MAP.engine.maxLevel,
    `${clean.upgrades.engine}`,
  )
  ok('a non-numeric upgrade level is discarded', clean.upgrades.armor === 0, `${clean.upgrades.armor}`)
  ok('negative upgrade levels are clamped', clean.upgrades.tires === 0, `${clean.upgrades.tires}`)
  ok('unknown records are dropped', !('bogus' in clean.records))
  ok('a broken record is rebuilt', clean.records['sunset-bay']?.bestTime === 100)
  ok('volume is clamped to 0..1', clean.settings.volume >= 0 && clean.settings.volume <= 1, `${clean.settings.volume}`)
  ok('an unknown quality falls back to high', clean.settings.quality === 'high')
  ok('stats are non-negative integers', clean.totalRaces >= 0 && Number.isInteger(clean.totalWins))
  ok('an unknown track is not unlocked', !clean.unlockedTracks.includes('nope'))
}

// --------------------------------------------------------------- save shape
section('Catalog integrity')
ok('every car has a unique id', new Set(CARS.map((c) => c.id)).size === CARS.length)
ok('every wheel has a unique id', new Set(WHEELS.map((w) => w.id)).size === WHEELS.length)
ok('every track has a unique id', new Set(TRACKS.map((t) => t.id)).size === TRACKS.length)
ok('exactly one starter car is free', CARS.filter((c) => c.price === 0).length === 1)
ok('exactly one starter wheel is free', WHEELS.filter((w) => w.price === 0).length === 1)
ok(
  'car prices increase',
  CARS.every((c, i) => i === 0 || c.price > CARS[i - 1].price),
  CARS.map((c) => c.price).join(','),
)
ok(
  'track rewards increase',
  TRACKS.every((t, i) => i === 0 || t.reward > TRACKS[i - 1].reward),
)
ok(
  'every theme has readable fog',
  TRACKS.every((t) => t.theme.fogFar > t.theme.fogNear + 100),
)
ok('starter car exists', getCar(CARS[0].id).price === 0)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`)
process.exit(failures === 0 ? 0 : 1)
