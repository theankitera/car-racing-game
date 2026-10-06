/**
 * A deterministic driver used only by the development scripts. It is not part of
 * the game — it exists so the physics can be exercised headlessly.
 */
import * as THREE from 'three'
import type { TrackCurve } from '../src/game/curve'
import type { Tuning } from '../src/game/tuning'
import type { TrackSpec } from '../src/game/types'
import { computeTuning } from '../src/game/tuning'
import { getTrack } from '../src/game/tracks'
import { emptyUpgrades } from '../src/game/upgrades'
import { clamp, wrapAngle } from '../src/game/utils'
import { buildTrackCurve } from '../src/game/curve'
import { createVehicle, stepVehicle, type Vehicle } from '../src/game/vehicle'

export function autopilot(v: Vehicle, curve: TrackCurve, tuning: Tuning) {
  const speed = Math.abs(v.vLong)

  // Racing-line speed profile: every corner ahead caps the speed, and the cap
  // relaxes by however much braking distance is still available.
  const decel = Math.max((tuning.brake / tuning.mass) * 0.5, 3)
  const brakeDist = (speed * speed) / (2 * decel)
  const scanDist = clamp(brakeDist + 25, 30, 220)
  let targetSpeed = tuning.maxSpeed
  for (let i = 0; i <= 20; i++) {
    const dist = (i / 20) * scanDist
    const idx = Math.floor((v.progress + dist / curve.length) * curve.count) % curve.count
    const radius = Math.max(1 / Math.max(curve.curvature[idx], 1e-5), 14)
    const corner = Math.sqrt(tuning.grip * radius) * 0.86
    targetSpeed = Math.min(targetSpeed, Math.sqrt(corner * corner + 2 * decel * dist))
  }

  // Pure pursuit toward the centre of the road plus a cross-track correction.
  const near = curve.nearest(v.x, v.z, v.nearestIndex)
  const look = clamp(speed * 0.55 + 9, 9, 42)
  const target = curve.positionAt(v.progress + look / curve.length, 0, new THREE.Vector3())
  const desired = Math.atan2(target.x - v.x, target.z - v.z)
  const err = wrapAngle(desired - v.yaw)

  // A positive steer input turns the car right, while a positive heading error
  // means it must yaw left — hence the negation.
  const steer = clamp(-err * 2.1 - near.lateral * 0.035 - v.vLat * 0.045, -1, 1)

  let throttle = 0
  if (speed < targetSpeed - 1.2) throttle = 1
  else if (speed > targetSpeed + 1.2) throttle = -1

  return {
    throttle,
    steer,
    handbrake: speed > 28 && Math.abs(err) > 1,
    boost: speed > 34 && targetSpeed > tuning.maxSpeed * 0.85,
  }
}

export interface LapRun {
  vehicle: Vehicle
  track: TrackSpec
  curve: TrackCurve
  tuning: Tuning
  seconds: number
  offRoadPct: number
  maxLateral: number
  topSpeed: number
  invalid: boolean
  /** Time of each completed lap, in seconds. */
  lapTimes: number[]
}

/** Drives a car around a circuit with the test autopilot. */
export function runLaps(
  trackId: string,
  carId: string,
  options: { seconds?: number; wheelId?: string; upgrades?: number } = {},
): LapRun {
  const spec = getTrack(trackId)
  const curve = buildTrackCurve(spec)
  const levels = emptyUpgrades()
  if (options.upgrades) {
    for (const key of Object.keys(levels) as Array<keyof typeof levels>) {
      levels[key] = options.upgrades
    }
  }
  const tuning = computeTuning(carId, options.wheelId ?? 'stock', levels)
  const v = createVehicle(curve, tuning, 0, 4, true)
  const dt = 1 / 60
  const seconds = options.seconds ?? spec.laps * 30 + 30

  let time = 0
  let offRoadFrames = 0
  let frames = 0
  let invalid = false
  let maxLateral = 0
  let topSpeed = 0
  let lastLaps = 0
  const lapTimes: number[] = []
  let lapStart = 0

  while (time < seconds) {
    stepVehicle(v, tuning, autopilot(v, curve, tuning), curve, dt, time, spec.laps)
    time += dt
    frames++
    if (!Number.isFinite(v.x + v.z + v.yaw + v.vLong + v.vLat + v.lapMeter + v.health)) invalid = true
    const near = curve.nearest(v.x, v.z, v.nearestIndex)
    maxLateral = Math.max(maxLateral, Math.abs(near.lateral))
    topSpeed = Math.max(topSpeed, Math.abs(v.vLong))
    if (near.distance > curve.halfWidth) offRoadFrames++
    if (v.lapsDone > lastLaps) {
      lastLaps = v.lapsDone
      lapTimes.push(time - lapStart)
      lapStart = time
    }
  }

  return {
    vehicle: v,
    track: spec,
    curve,
    tuning,
    seconds: time,
    offRoadPct: (offRoadFrames / frames) * 100,
    maxLateral,
    topSpeed,
    invalid,
    lapTimes,
  }
}
