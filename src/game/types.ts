/**
 * Shared type definitions for Apex Nitro.
 *
 * Coordinate system used everywhere in the game:
 *   +Z = forward for a car at yaw 0, +X = left/right, +Y = up.
 *   A car's world forward vector is (sin(yaw), 0, cos(yaw)) and its mesh uses
 *   `rotation.y = yaw`, so the two always agree.
 */

export type UpgradeKey = 'engine' | 'tires' | 'armor' | 'nitro' | 'chassis'

/** Geometry parameters that make each supercar look structurally different. */
export interface CarShape {
  /** Overall length in metres (bumper to bumper). */
  length: number
  /** Overall width in metres including wheels. */
  width: number
  /** Overall height in metres including the roof. */
  height: number
  /** Height of the beltline (where the glass starts). */
  belt: number
  /** Height of the nose tip. */
  noseTop: number
  /** Height of the rear deck. */
  tailTop: number
  /** Main body width as a fraction of `width`. */
  bodyDepth: number
  /** Greenhouse width as a fraction of `width`. */
  cabinDepth: number
  /** Front of the windscreen, as a fraction of length from the centre. */
  cabinFront: number
  /** Rear of the greenhouse, as a fraction of length from the centre. */
  cabinRear: number
  /** Roof height above the beltline, in metres. */
  cabinTop: number
  /** How much the body pinches in toward the roof (0 = slab sided). */
  taper: number
  wing: 'none' | 'duck' | 'low' | 'gt' | 'swan'
  wingHeight: number
  splitter: boolean
  diffuser: boolean
  sideSkirts: boolean
  flares: boolean
  roofScoop: boolean
  hoodVents: boolean
  exhausts: number
  wheelRadius: number
  wheelWidth: number
  /** Distance between left/right wheel centres at the front. */
  frontTrack: number
  rearTrack: number
}

export interface CarStatBars {
  speed: number
  accel: number
  handling: number
  braking: number
}

export interface CarSpec {
  id: string
  name: string
  brand: string
  tier: 'Sport' | 'Muscle' | 'Super' | 'Hyper' | 'Track' | 'Electric' | 'Rally'
  price: number
  blurb: string
  /** Kilograms. Lower mass accelerates faster and turns in harder. */
  mass: number
  /** Peak drive force in newtons (arcade units). */
  power: number
  /** Braking force in newtons. */
  brake: number
  /** Aerodynamic drag coefficient. */
  drag: number
  /** Rolling resistance coefficient. */
  roll: number
  /** Top speed in metres/second. */
  maxSpeed: number
  /** Peak lateral grip in m/s^2. */
  grip: number
  /** Maximum steering lock in radians. */
  steer: number
  wheelbase: number
  /** Nitro multiplier: capacity and regen scale with this. */
  nitroCapacity: number
  paint: string
  accent: string
  stripe: string | null
  shape: CarShape
  stats: CarStatBars
}

export interface WheelSpec {
  id: string
  name: string
  price: number
  blurb: string
  /** Multiplies the car's lateral grip. */
  gripBonus: number
  /** Multiplies the car's drive force. */
  accelBonus: number
  /** Added to the car's mass in kilograms. */
  massDelta: number
  /** Wheel radius in metres (overrides the car shape value). */
  radius: number
  /** Multiplies the car's wheel width. */
  widthFactor: number
  spokes: number
  rimColor: string
  lipColor: string
  tireColor: string
  style: 'spoke' | 'mesh' | 'disc' | 'deepdish' | 'slick'
}

export interface UpgradeDef {
  key: UpgradeKey
  name: string
  blurb: string
  icon: string
  /** Cost of level 1; each further level costs `baseCost * (level + 1)`. */
  baseCost: number
  maxLevel: number
  /** Short label describing what the upgrade improves. */
  effect: string
}

export interface TrackTheme {
  skyTop: string
  skyBottom: string
  fog: string
  fogNear: number
  fogFar: number
  ground: string
  groundAccent: string
  road: string
  edge: string
  line: string
  barrier: string
  barrierTop: string
  sunColor: string
  sunIntensity: number
  sunPosition: [number, number, number]
  ambient: number
  ambientColor: string
  hemiSky: string
  hemiGround: string
  scenery: 'city' | 'desert' | 'alpine' | 'neon'
  night: boolean
  sky: 'sunset' | 'day' | 'night' | 'overcast'
  /** Extra emissive glow along the barriers (neon tracks). */
  neon: string | null
}

export interface TrackPoint {
  x: number
  z: number
}

export interface TrackSpec {
  id: string
  name: string
  location: string
  blurb: string
  laps: number
  /** 1..5, drives rewards and AI pace. */
  difficulty: number
  /** Coins paid for finishing, before position bonuses. */
  reward: number
  roadWidth: number
  /** Number of AI opponents on the grid. */
  traffic: number
  theme: TrackTheme
  points: TrackPoint[]
}

export interface TrackRecord {
  finished: boolean
  bestPosition: number
  bestTime: number | null
  bestLap: number | null
  wins: number
}

export interface Settings {
  quality: 'low' | 'medium' | 'high'
  sound: boolean
  /** Master volume, 0..1. */
  volume: number
  shake: boolean
  units: 'kmh' | 'mph'
  camera: 'chase' | 'close' | 'hood'
}

export interface SaveData {
  version: number
  coins: number
  ownedCars: string[]
  ownedWheels: string[]
  equippedCar: string
  equippedWheel: string
  paint: string
  upgrades: Record<UpgradeKey, number>
  records: Record<string, TrackRecord>
  settings: Settings
  totalRaces: number
  totalWins: number
  totalDistance: number
  unlockedTracks: string[]
}

/** Raw driver inputs for a single frame. */
export interface DriveInput {
  throttle: number
  steer: number
  handbrake: boolean
  boost: boolean
}

export interface RaceResult {
  trackId: string
  position: number
  totalTime: number
  bestLap: number
  laps: number
  coins: number
  finished: boolean
  /** Metres covered during the race, used for lifetime stats. */
  distance: number
  /** True when the player set a new personal best for the circuit. */
  newRecord: boolean
}
