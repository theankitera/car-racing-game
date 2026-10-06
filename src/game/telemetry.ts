export interface MiniCar {
  x: number
  z: number
  isPlayer: boolean
  color: string
  position: number
  /** Driver label for the standings board. */
  name: string
}

export type RaceState = 'countdown' | 'racing' | 'finished'

/**
 * The scene writes here every frame and the HUD reads it in its own animation
 * loop. Keeping this out of React state means driving at 60 fps never triggers
 * a single re-render.
 */
export interface Telemetry {
  state: RaceState
  countdown: number
  raceTime: number
  speed: number
  gear: number
  rpm: number
  lap: number
  totalLaps: number
  position: number
  totalCars: number
  lastLap: number
  bestLap: number
  nitro: number
  nitroMax: number
  health: number
  maxHealth: number
  boosting: boolean
  offRoad: boolean
  wrongWay: boolean
  wrecked: boolean
  damageFlash: number
  progress: number
  distance: number
  fps: number
  /** Radius of the circuit in metres, used to scale the minimap. */
  mapRadius: number
  cars: MiniCar[]
}

export const telemetry: Telemetry = {
  state: 'countdown',
  countdown: 3.6,
  raceTime: 0,
  speed: 0,
  gear: 1,
  rpm: 0.1,
  lap: 1,
  totalLaps: 3,
  position: 1,
  totalCars: 8,
  lastLap: 0,
  bestLap: 0,
  nitro: 0.5,
  nitroMax: 1,
  health: 100,
  maxHealth: 100,
  boosting: false,
  offRoad: false,
  wrongWay: false,
  wrecked: false,
  damageFlash: 0,
  progress: 0,
  distance: 0,
  fps: 60,
  mapRadius: 300,
  cars: [],
}

export function resetTelemetry(totalLaps: number, totalCars: number): void {
  telemetry.state = 'countdown'
  telemetry.countdown = 3.6
  telemetry.raceTime = 0
  telemetry.speed = 0
  telemetry.gear = 1
  telemetry.rpm = 0.1
  telemetry.lap = 1
  telemetry.totalLaps = totalLaps
  telemetry.position = totalCars
  telemetry.totalCars = totalCars
  telemetry.lastLap = 0
  telemetry.bestLap = 0
  telemetry.nitro = 0.5
  telemetry.health = 100
  telemetry.maxHealth = 100
  telemetry.boosting = false
  telemetry.offRoad = false
  telemetry.wrongWay = false
  telemetry.wrecked = false
  telemetry.damageFlash = 0
  telemetry.progress = 0
  telemetry.distance = 0
  telemetry.cars = []
}
