import * as THREE from 'three'
import type { TrackCurve } from './curve'
import type { Tuning } from './tuning'
import { clamp, wrapAngle } from './utils'
import { gridSlot } from './vehicle'

const scratch = new THREE.Vector3()

/**
 * AI drivers follow the racing line analytically instead of using full physics.
 * That guarantees they can never get stuck on a wall or drive off the circuit,
 * while the corner-speed model keeps them believable and beatable.
 */
export interface AiCar {
  id: string
  carId: string
  wheelId: string
  tuning: Tuning
  x: number
  z: number
  yaw: number
  speed: number
  /** Position along the loop, 0..1. */
  t: number
  lane: number
  targetLane: number
  laneTimer: number
  progress: number
  lapMeter: number
  lapsDone: number
  lapStart: number
  bestLap: number
  finished: boolean
  finishTime: number
  position: number
  skill: number
  wheelSpin: number
  steer: number
  roll: number
  boosting: boolean
  nitro: number
  wobble: number
}

export function createAiCar(
  curve: TrackCurve,
  id: string,
  carId: string,
  wheelId: string,
  tuning: Tuning,
  slot: number,
  total: number,
  skill: number,
): AiCar {
  const { t, lateral } = gridSlot(curve, slot, total)
  const p = curve.positionAt(t, lateral, scratch)
  return {
    id,
    carId,
    wheelId,
    tuning,
    x: p.x,
    z: p.z,
    yaw: curve.headingAt(t),
    speed: 0,
    t: ((t % 1) + 1) % 1,
    lane: lateral,
    targetLane: lateral,
    laneTimer: 2 + (slot % 3),
    progress: t,
    lapMeter: t - 1,
    lapsDone: 0,
    lapStart: 0,
    bestLap: 0,
    finished: false,
    finishTime: 0,
    position: slot + 1,
    skill,
    wheelSpin: 0,
    steer: 0,
    roll: 0,
    boosting: false,
    nitro: 0.5,
    wobble: slot * 1.7,
  }
}

export interface AiStepContext {
  /** Rubber band factor around 1. */
  paceScale: number
  /** Meters of lateral room available. */
  halfWidth: number
}

export function stepAi(
  ai: AiCar,
  curve: TrackCurve,
  dt: number,
  raceTime: number,
  totalLaps: number,
  ctx: AiStepContext,
): void {
  const step = Math.min(dt, 1 / 30)
  if (!(step > 1e-6) || !Number.isFinite(step)) return
  const T = ai.tuning
  const grip = T.grip * 1.02
  const topSpeed = T.maxSpeed * ai.skill * ctx.paceScale

  // ------------------------------------------------- look ahead & cornering
  const lookAhead = clamp(ai.speed * 1.15 + 10, 12, 72)
  const aheadT = ai.t + lookAhead / curve.length

  // Scan the braking zone: the slowest corner in the next ~2 seconds wins.
  let cornerLimit = Infinity
  const scanSpan = clamp(ai.speed * 2.2, 25, 140)
  const samples = 12
  for (let i = 0; i < samples; i++) {
    const dist = (i / samples) * scanSpan
    const idx = Math.floor((ai.t + dist / curve.length) * curve.count) % curve.count
    const k = Math.max(curve.curvature[idx], 1e-5)
    const radius = Math.max(1 / k, 18)
    const v = Math.sqrt(grip * radius) * 0.94
    cornerLimit = Math.min(cornerLimit, v)
  }
  const targetSpeed = Math.min(topSpeed, cornerLimit, T.maxSpeed * 1.05)

  // ------------------------------------------------------------ accelerate
  const basePM = T.power / T.mass
  const falloff = 1 - 0.7 * clamp(ai.speed / Math.max(T.maxSpeed, 1), 0, 1)
  if (ai.speed < targetSpeed) {
    const accel = basePM * Math.max(falloff, 0.05) * (ai.finished ? 0.7 : 1)
    ai.speed += accel * step
  } else {
    const over = ai.speed - targetSpeed
    const brake = (T.brake / T.mass) * clamp(over / 8, 0.12, 1)
    ai.speed -= brake * step
  }
  ai.speed = clamp(ai.speed, 0, T.maxSpeed * 1.15)

  // Nitro on the straights makes the leaders feel alive.
  const straight = cornerLimit > T.maxSpeed * 0.75
  if (straight && ai.nitro > 0.25 && !ai.finished) {
    ai.nitro = Math.max(0, ai.nitro - step / 5)
    ai.boosting = true
    ai.speed += basePM * 0.5 * step
  } else {
    ai.boosting = false
    ai.nitro = Math.min(1, ai.nitro + step * 0.05)
  }

  // ---------------------------------------------------------------- lanes
  ai.laneTimer -= step
  ai.wobble += step * 0.6
  if (ai.laneTimer <= 0) {
    ai.laneTimer = 3 + (ai.id.length % 4)
    const room = Math.min(ctx.halfWidth * 0.62, 5.2)
    ai.targetLane = clamp(ai.lane + (Math.sin(ai.wobble * 2.3) * room), -room, room)
  }
  ai.lane += (ai.targetLane - ai.lane) * Math.min(1, step * 0.9)
  const room = Math.min(ctx.halfWidth * 0.66, 5.4)
  ai.lane = clamp(ai.lane, -room, room)

  // ---------------------------------------------------------------- steering
  const target = curve.positionAt(aheadT, ai.lane, scratch)
  const desiredYaw = Math.atan2(target.x - ai.x, target.z - ai.z)
  const err = wrapAngle(desiredYaw - ai.yaw)
  const maxYawRate = (grip / Math.max(ai.speed, 6)) * 1.5
  const yawRate = clamp(err * 3.4, -maxYawRate, maxYawRate)
  ai.yaw = wrapAngle(ai.yaw + yawRate * step)
  ai.steer = clamp(err * 1.8, -1, 1)
  ai.roll += (clamp(-ai.speed * yawRate * 0.011, -0.14, 0.14) - ai.roll) * Math.min(1, step * 5)

  // -------------------------------------------------------------- integrate
  const nx = ai.x + Math.sin(ai.yaw) * ai.speed * step
  const nz = ai.z + Math.cos(ai.yaw) * ai.speed * step
  ai.x = nx
  ai.z = nz

  ai.t = ((ai.t + (ai.speed * step) / curve.length) % 1 + 1) % 1
  ai.wheelSpin += (ai.speed * step) / Math.max(T.wheelRadius, 0.1)

  // Snap softly back to the line so the pack never wanders off the road.
  const onLine = curve.positionAt(ai.t, ai.lane, scratch)
  const drift = Math.hypot(ai.x - onLine.x, ai.z - onLine.z)
  if (drift > 1.2) {
    const k = Math.min(1, (drift - 1.2) * 0.25 + step * 1.6)
    ai.x += (onLine.x - ai.x) * k
    ai.z += (onLine.z - ai.z) * k
  }

  // ------------------------------------------------------------- lap logic
  let d = ai.t - ai.progress
  if (d < -0.5) d += 1
  else if (d > 0.5) d -= 1
  ai.progress = ai.t
  const before = Math.floor(ai.lapMeter)
  ai.lapMeter += d
  const after = Math.floor(ai.lapMeter)
  // Monotonic, exactly as in vehicle.ts: reversing over the line must never
  // re-time a lap. lapStart is armed at creation (lapMeter starts below zero).
  if (after > before && after > ai.lapsDone) {
    ai.lapsDone = after
    const lapTime = raceTime - ai.lapStart
    if (ai.bestLap === 0 || lapTime < ai.bestLap) ai.bestLap = lapTime
    ai.lapStart = raceTime
    if (!ai.finished && ai.lapsDone >= totalLaps) {
      ai.finished = true
      ai.finishTime = raceTime
    }
  }
}

/** Keeps AI cars from occupying the same patch of tarmac. */
export function resolveAiSpacing(cars: AiCar[]): void {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i]
      const b = cars[j]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const distSq = dx * dx + dz * dz
      const min = 2.9
      if (distSq > min * min || distSq < 1e-6) continue
      const dist = Math.sqrt(distSq)
      const push = (min - dist) * 0.5
      const ux = dx / dist
      const uz = dz / dist
      a.x -= ux * push
      a.z -= uz * push
      b.x += ux * push
      b.z += uz * push
      const slower = Math.min(a.speed, b.speed)
      a.speed = Math.min(a.speed, slower + 1.5)
      b.speed = Math.min(b.speed, slower + 1.5)
    }
  }
}
