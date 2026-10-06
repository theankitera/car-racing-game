import { getCar } from './cars'
import type { CarSpec, TrackSpec, UpgradeKey, WheelSpec } from './types'
import { getWheel } from './wheels'
import { clamp } from './utils'

export interface Tuning {
  car: CarSpec
  wheel: WheelSpec
  mass: number
  power: number
  brake: number
  drag: number
  roll: number
  maxSpeed: number
  grip: number
  steer: number
  wheelbase: number
  maxHealth: number
  damageTaken: number
  nitroCapacity: number
  nitroRegen: number
  wheelRadius: number
  wheelWidth: number
  /** 0..1 bars for the UI, after upgrades and wheels. */
  bars: { speed: number; accel: number; handling: number; braking: number }
  topSpeedKmh: number
  zeroToHundred: number
}

export type UpgradeLevels = Record<UpgradeKey, number>

/**
 * Combines a car, a set of wheels and the player's upgrade levels into the final
 * numbers the physics uses. This is the single source of truth for performance.
 */
export function computeTuning(
  carId: string,
  wheelId: string,
  upgrades: UpgradeLevels,
  boost = 0,
): Tuning {
  const car = getCar(carId)
  const wheel = getWheel(wheelId)

  const engine = upgrades.engine ?? 0
  const tires = upgrades.tires ?? 0
  const armor = upgrades.armor ?? 0
  const nitro = upgrades.nitro ?? 0
  const chassis = upgrades.chassis ?? 0

  const mass = Math.max(650, (car.mass + wheel.massDelta) * (1 - 0.045 * chassis))
  const power = car.power * (1 + 0.09 * engine) * wheel.accelBonus
  const maxSpeed = car.maxSpeed * (1 + 0.04 * engine) * (1 + (wheel.gripBonus - 1) * -0.15)
  const grip = car.grip * (1 + 0.07 * tires) * wheel.gripBonus
  const brake = car.brake * (1 + 0.045 * (tires + chassis) * 0.5)
  const steer = car.steer * (1 + 0.04 * chassis)
  const maxHealth = 100 * (1 + 0.22 * armor)
  const damageTaken = Math.max(0.5, 1 - 0.09 * armor)
  const nitroCapacity = car.nitroCapacity * (1 + 0.16 * nitro)
  const nitroRegen = 0.052 * (1 + 0.16 * nitro)

  const wheelRadius = car.shape.wheelRadius * (wheel.radius / 0.34)
  const wheelWidth = car.shape.wheelWidth * wheel.widthFactor

  const bars = {
    speed: clamp(car.stats.speed * (1 + 0.06 * engine), 0.04, 1),
    accel: clamp(car.stats.accel * (1 + 0.06 * engine) * wheel.accelBonus, 0.04, 1),
    handling: clamp(car.stats.handling * (1 + 0.07 * tires) * (0.985 + wheel.gripBonus * 0.015), 0.04, 1),
    braking: clamp(car.stats.braking * (1 + 0.03 * (armor + chassis)), 0.04, 1),
  }

  const boostMul = 1 + boost
  // Rough straight-line estimates, only used for garage flavour text.
  const zeroToHundred = clamp(2.9 / Math.max(0.4, power / mass / 7) / boostMul, 1.4, 12)
  const topSpeedKmh = maxSpeed * boostMul * 3.6

  return {
    car,
    wheel,
    mass,
    power,
    brake,
    drag: car.drag,
    roll: car.roll,
    maxSpeed,
    grip,
    steer,
    wheelbase: car.wheelbase,
    maxHealth,
    damageTaken,
    nitroCapacity,
    nitroRegen,
    wheelRadius,
    wheelWidth,
    bars,
    topSpeedKmh,
    zeroToHundred,
  }
}

/** Coins awarded for a race. */
export function computeReward(
  track: TrackSpec,
  position: number,
  laps: number,
  finished: boolean,
): number {
  const positionMul = [0, 1, 0.5, 0.28, 0.12, 0.06, 0.03][Math.min(position, 6)] ?? 0.02
  const base = track.reward * (0.35 + 0.65 * positionMul)
  const lapBonus = finished ? track.reward * 0.05 * Math.max(0, laps) : 0
  return Math.round(base + lapBonus)
}
