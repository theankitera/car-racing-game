import * as THREE from 'three'
import type { TrackCurve } from './curve'
import type { Tuning } from './tuning'
import type { DriveInput } from './types'
import { clamp } from './utils'

const scratch = new THREE.Vector3()

/**
 * Local axes for a car at `yaw`:
 *   forward (+Z) = ( sin(yaw), 0,  cos(yaw))
 *   left    (+X) = ( cos(yaw), 0, -sin(yaw))
 * `vLat` is measured along the car's LEFT axis, so a positive vLat means the
 * nose is pointing to the right of the direction of travel.
 *
 * Meshes use `rotation.y = yaw`, so the physics and the render always agree.
 */
export interface Vehicle {
  isPlayer: boolean
  x: number
  z: number
  yaw: number
  /** Forward speed, m/s. Negative while reversing. */
  vLong: number
  /** Lateral speed along the car's left axis, m/s. */
  vLat: number
  steerAngle: number
  health: number
  nitro: number
  boosting: boolean
  /** 0..1 tyre sliding amount, used for screech audio and skid marks. */
  slip: number
  offRoad: boolean
  nearestIndex: number
  /** Continuous position along the loop, 0..1. */
  progress: number
  /** Unwrapped lap counter; fractional part is progress within the lap. */
  lapMeter: number
  lapsDone: number
  lapStart: number
  lastLapTime: number
  bestLap: number
  finished: boolean
  finishTime: number
  distance: number
  wrongWay: boolean
  /** Rises on impact, decays back to zero. Drives the HUD damage flash. */
  damageFlash: number
  /** Visual body roll and pitch, radians. */
  roll: number
  pitch: number
  /** Set while the car is a wreck after running out of health. */
  wrecked: boolean
  resetCooldown: number
  position: number
}

const FALLOFF = 0.72
const COAST_FRICTION = 1.15
const BOOST_POWER = 1.55
const BOOST_SPEED = 1.14

/** Grid slot for the Nth car: two abreast, staggered backwards from the line. */
export function gridSlot(curve: TrackCurve, index: number, total: number) {
  const row = Math.floor(index / 2)
  const col = index % 2
  const t = 1 - 0.0045 - row * 0.0075
  const laneWidth = Math.min(curve.halfWidth * 0.42, 3.1)
  const lateral = (col === 0 ? -1 : 1) * laneWidth
  void total
  return { t: ((t % 1) + 1) % 1, lateral }
}

export function createVehicle(
  curve: TrackCurve,
  tuning: Tuning,
  slot: number,
  total: number,
  isPlayer: boolean,
): Vehicle {
  const { t, lateral } = gridSlot(curve, slot, total)
  const p = curve.positionAt(t, lateral, scratch)
  const yaw = curve.headingAt(t)
  const progress = t
  return {
    isPlayer,
    x: p.x,
    z: p.z,
    yaw,
    vLong: 0,
    vLat: 0,
    steerAngle: 0,
    health: tuning.maxHealth,
    nitro: tuning.nitroCapacity * 0.5,
    boosting: false,
    slip: 0,
    offRoad: false,
    nearestIndex: Math.floor(t * curve.count),
    progress,
    lapMeter: progress - 1,
    lapsDone: 0,
    lapStart: 0,
    lastLapTime: 0,
    bestLap: 0,
    finished: false,
    finishTime: 0,
    distance: 0,
    wrongWay: false,
    damageFlash: 0,
    roll: 0,
    pitch: 0,
    wrecked: false,
    resetCooldown: 0,
    position: slot + 1,
  }
}

export interface StepOptions {
  /** Multiplies the drive force while the AI is catching up. */
  powerScale?: number
  /** Frozen input for the countdown period. */
  frozen?: boolean
}

/**
 * Advances one car by `dt` seconds. This is the single place where driving feel
 * is defined: a torque curve with speed falloff, quadratic aero drag, a grip
 * limit on cornering, and slip-based drifting.
 */
export function stepVehicle(
  v: Vehicle,
  T: Tuning,
  input: DriveInput,
  curve: TrackCurve,
  dt: number,
  raceTime: number,
  totalLaps: number,
  options: StepOptions = {},
): void {
  const step = Math.min(dt, 1 / 30)
  // A zero-length frame (which is what the very first animation frame of the
  // page is) would divide by zero and poison the whole state with NaN.
  if (!(step > 1e-6) || !Number.isFinite(step)) return
  const powerScale = options.powerScale ?? 1
  const frozen = options.frozen ?? false

  const throttle = frozen ? 0 : input.throttle
  const steer = frozen ? 0 : input.steer
  const handbrake = frozen ? true : input.handbrake
  const wantBoost = frozen ? false : input.boost

  const speed = Math.hypot(v.vLong, v.vLat)
  const speedRatio = clamp(Math.abs(v.vLong) / Math.max(T.maxSpeed, 1), 0, 1.3)
  const wreckMul = v.wrecked ? 0.35 : 1

  // ---------------------------------------------------------------- nitro
  let boosting = false
  if (wantBoost && v.nitro > 0.002 && !v.wrecked) {
    boosting = true
    v.nitro = Math.max(0, v.nitro - step / 2.6)
  } else {
    v.nitro = Math.min(T.nitroCapacity, v.nitro + T.nitroRegen * step)
  }
  v.boosting = boosting
  const boostP = boosting ? BOOST_POWER : 1
  const boostS = boosting ? BOOST_SPEED : 1

  // ------------------------------------------------------------- steering
  const steerAuthority = 1 / (1 + speed * 0.055)
  const steerTarget = steer * T.steer * (0.3 + 0.7 * steerAuthority)
  v.steerAngle += (steerTarget - v.steerAngle) * Math.min(1, step * 11)

  // -------------------------------------------------------- longitudinal
  const basePowerToMass = (T.power * powerScale) / T.mass
  const powerToMass = (T.power * boostP * powerScale) / T.mass
  const dragCoef = (basePowerToMass * (1 - FALLOFF)) / Math.max(T.maxSpeed * T.maxSpeed, 1)
  const falloff = 1 - FALLOFF * clamp(Math.abs(v.vLong) / (T.maxSpeed * boostS), 0, 1)

  let accel = 0
  if (throttle > 0) {
    accel = powerToMass * throttle * Math.max(falloff, 0.05) * wreckMul
  } else if (throttle < 0) {
    accel =
      v.vLong > 0.7
        ? -(T.brake / T.mass) * -throttle * wreckMul
        : -basePowerToMass * 0.45 * -throttle
  }

  const rolling = -T.roll * 0.0016 * v.vLong
  const dragAccel = -dragCoef * v.vLong * Math.abs(v.vLong)
  const coast =
    Math.abs(throttle) < 0.02 && Math.abs(v.vLong) > 0.05
      ? -Math.sign(v.vLong) * COAST_FRICTION
      : 0

  v.vLong += (accel + rolling + dragAccel + coast) * step

  const reverseCap = -T.maxSpeed * 0.3
  const forwardCap = T.maxSpeed * boostS * 1.24
  if (Math.abs(v.vLong) < 0.35 && throttle === 0) v.vLong = 0
  v.vLong = clamp(v.vLong, reverseCap, forwardCap)

  // ------------------------------------------------------- grip and yaw
  const offRoadGrip = v.offRoad ? 0.58 : 1
  const aeroGrip = (0.35 + T.car.drag) * speed * speed * 0.00035
  let latLimit = (T.grip * offRoadGrip + aeroGrip) * wreckMul
  latLimit *= 1 - 0.18 * Math.max(0, throttle) * (1 - speedRatio)
  if (handbrake) latLimit *= 0.45

  const desiredYaw = -(v.vLong / T.wheelbase) * Math.tan(v.steerAngle)
  // Slide feedback: the car naturally rotates back into its velocity.
  const yawDemand = desiredYaw + v.vLat * 1.45 * (handbrake ? 0.35 : 1)
  const maxYaw = latLimit / Math.max(Math.abs(v.vLong), 4.5)
  const yawCap = maxYaw * (handbrake ? 2.2 : 1.35)
  const yawRate = clamp(yawDemand, -yawCap, yawCap)

  // Over-rotating beyond the grip limit scrubs off lateral grip.
  const over = Math.max(0, Math.abs(yawDemand) - maxYaw)
  const gripScrub = 1 / (1 + over * 1.6)

  v.yaw += yawRate * step

  // Rotate the velocity into the new body frame.
  const c = Math.cos(yawRate * step)
  const s = Math.sin(yawRate * step)
  const nl = v.vLat * c - v.vLong * s
  const nf = v.vLat * s + v.vLong * c
  v.vLat = nl
  v.vLong = nf

  const effLimit = latLimit * gripScrub
  const needed = -v.vLat / step
  const applied = clamp(needed, -effLimit, effLimit)
  v.vLat += applied * step

  v.slip = clamp(Math.abs(v.vLat) / 11 + (handbrake ? 0.28 : 0), 0, 1)

  // ------------------------------------------------------------ integrate
  const sinY = Math.sin(v.yaw)
  const cosY = Math.cos(v.yaw)
  const vx = sinY * v.vLong + cosY * v.vLat
  const vz = cosY * v.vLong - sinY * v.vLat
  const nx = v.x + vx * step
  const nz = v.z + vz * step
  v.distance += Math.hypot(nx - v.x, nz - v.z)
  v.x = nx
  v.z = nz

  // --------------------------------------------------- track interaction
  const near = curve.nearest(v.x, v.z, v.nearestIndex)
  v.nearestIndex = near.index
  v.offRoad = near.distance > curve.halfWidth && near.distance < curve.wallHalf + 0.4

  // Barriers: slide along the wall, lose speed, take damage.
  const limit = curve.wallHalf
  if (Math.abs(near.lateral) > limit) {
    const side = Math.sign(near.lateral)
    const right = curve.rights[near.index]
    const outX = right.x * side
    const outZ = right.z * side
    const push = Math.abs(near.lateral) - limit
    v.x -= outX * push
    v.z -= outZ * push

    const wvx = sinY * v.vLong + cosY * v.vLat
    const wvz = cosY * v.vLong - sinY * v.vLat
    const vn = wvx * outX + wvz * outZ
    if (vn > 0.4) {
      const impact = Math.abs(vn)
      v.health = Math.max(0, v.health - clamp(impact * 1.9 - 1, 0, 60) * T.damageTaken)
      v.damageFlash = Math.min(1, v.damageFlash + impact * 0.06)
      const restX = wvx - 1.35 * vn * outX
      const restZ = wvz - 1.35 * vn * outZ
      const fx = restX * 0.82
      const fz = restZ * 0.82
      v.vLong = fx * sinY + fz * cosY
      v.vLat = fx * cosY - fz * sinY
    } else {
      const fx = wvx * 0.94
      const fz = wvz * 0.94
      v.vLong = fx * sinY + fz * cosY
      v.vLat = fx * cosY - fz * sinY
    }
  }

  if (!v.wrecked && v.health <= 0) {
    v.wrecked = true
    v.health = 0
  }

  // ----------------------------------------------------------- lap timing
  let d = near.progress - v.progress
  if (d < -0.5) d += 1
  else if (d > 0.5) d -= 1
  v.progress = near.progress
  const before = Math.floor(v.lapMeter)
  v.lapMeter += d
  const after = Math.floor(v.lapMeter)
  // `lapsDone` only ever grows, so a car that reverses back over the start
  // line and drives through again cannot re-count or re-time a lap. The very
  // first crossing (lapMeter starts below zero, off the grid) lands on
  // after === 0 === lapsDone and is ignored: lapStart is armed at creation.
  if (after > before && after > v.lapsDone) {
    v.lapsDone = after
    const lapTime = raceTime - v.lapStart
    v.lastLapTime = lapTime
    if (v.bestLap === 0 || lapTime < v.bestLap) v.bestLap = lapTime
    v.lapStart = raceTime
    if (!v.finished && v.lapsDone >= totalLaps) {
      v.finished = true
      v.finishTime = raceTime
    }
  }

  // ------------------------------------------------------------- visuals
  const tangent = curve.tangents[near.index]
  const forwardDot = sinY * tangent.x + cosY * tangent.z
  v.wrongWay = forwardDot < -0.25 && speed > 3

  const latAccel = v.vLong * yawRate
  v.roll += (clamp(-latAccel * 0.011, -0.13, 0.13) - v.roll) * Math.min(1, step * 6)
  const longAccel = (accel + dragAccel) * 0.0016
  v.pitch += (clamp(longAccel, -0.06, 0.06) - v.pitch) * Math.min(1, step * 5)

  v.damageFlash = Math.max(0, v.damageFlash - step * 0.9)
  v.resetCooldown = Math.max(0, v.resetCooldown - step)
}

/** Puts a car back on the racing line facing forward. */
export function resetToTrack(v: Vehicle, curve: TrackCurve, restoreHealth: boolean, T: Tuning): void {
  const t = v.progress
  const lane = clamp(curve.halfWidth * 0.35, -4, 4)
  const p = curve.positionAt(t, lane, scratch)
  v.x = p.x
  v.z = p.z
  v.yaw = curve.headingAt(t)
  v.vLong = 0
  v.vLat = 0
  v.steerAngle = 0
  v.slip = 0
  v.wrecked = false
  v.resetCooldown = 1.6
  if (restoreHealth) v.health = Math.max(v.health, T.maxHealth * 0.42)
  v.nearestIndex = Math.floor(t * curve.count)
}

/** Anything the standings can rank: the player and every opponent. */
export interface Rankable {
  finished: boolean
  finishTime: number
  lapMeter: number
  position: number
}

/**
 * Standings key. A car that has crossed the finish line is ranked by who got
 * there first; everyone still racing is ranked by distance around the circuit.
 * Finished times are offset so they always beat an unfinished lap counter.
 */
export function raceKey(c: Rankable): number {
  return c.finished ? 1e6 - c.finishTime : c.lapMeter
}

/**
 * Writes `position` on every car in `field` in place. Deliberately allocation
 * free — it runs once per frame — and a single implementation, so the scene
 * and the HUD can never disagree about who is leading.
 */
export function rankRace(field: Rankable[]): void {
  for (const car of field) {
    const key = raceKey(car)
    let place = 1
    for (const other of field) if (raceKey(other) > key) place++
    car.position = place
  }
}
