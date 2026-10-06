import * as THREE from 'three'
import type { TrackSpec } from './types'
import { TAU, clamp } from './utils'

export interface NearestResult {
  index: number
  /** Continuous position along the loop in [0, 1). */
  progress: number
  /** Signed metres from the centre line. Positive is to the right of travel. */
  lateral: number
  /** Metres from the centre line, always positive. */
  distance: number
}

export interface TrackCurve {
  spec: TrackSpec
  curve: THREE.CatmullRomCurve3
  samples: THREE.Vector3[]
  rights: THREE.Vector3[]
  /** Unit forward direction at each sample. */
  tangents: THREE.Vector3[]
  count: number
  length: number
  halfWidth: number
  /** Distance from the centre line to the barriers. */
  wallHalf: number
  /** Precomputed signed curvature (1/m) at each sample. */
  curvature: Float32Array
  nearest(x: number, z: number, hint: number): NearestResult
  /** World position at loop parameter `t`, offset sideways by `lateral` metres. */
  positionAt(t: number, lateral: number, out: THREE.Vector3): THREE.Vector3
  /** Yaw angle for a car travelling forward at parameter `t`. */
  headingAt(t: number): number
}

const SAMPLE_COUNT = 720

export function buildTrackCurve(spec: TrackSpec): TrackCurve {
  const control = spec.points.map((p) => new THREE.Vector3(p.x, 0, p.z))
  // Centripetal parameterisation: the control points are unevenly spaced around
  // a radius profile, and the uniform variant overshoots into hairpin kinks.
  const curve = new THREE.CatmullRomCurve3(control, true, 'centripetal')

  // getSpacedPoints returns count+1 points for a closed curve, last == first.
  const raw = curve.getSpacedPoints(SAMPLE_COUNT)
  const samples = raw.slice(0, SAMPLE_COUNT)
  const count = samples.length

  const tangents: THREE.Vector3[] = new Array(count)
  const rights: THREE.Vector3[] = new Array(count)
  for (let i = 0; i < count; i++) {
    const a = samples[(i - 1 + count) % count]
    const b = samples[(i + 1) % count]
    const t = new THREE.Vector3().subVectors(b, a).normalize()
    tangents[i] = t
    // right = normalize(cross(forward, up)) for a Y-up world
    rights[i] = new THREE.Vector3(-t.z, 0, t.x).normalize()
  }

  let length = 0
  for (let i = 0; i < count; i++) length += samples[i].distanceTo(samples[(i + 1) % count])

  const curvature = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const a = tangents[(i - 1 + count) % count]
    const b = tangents[(i + 1) % count]
    const dot = clamp(a.dot(b), -1, 1)
    const angle = Math.acos(dot)
    const arc = length / count * 2
    curvature[i] = angle / Math.max(arc, 0.001)
  }

  const halfWidth = spec.roadWidth / 2
  const wallHalf = halfWidth + 1.7

  function nearest(x: number, z: number, hint: number): NearestResult {
    const searchAt = (centre: number, half: number) => {
      let best = -1
      let bestSq = Infinity
      for (let k = -half; k <= half; k++) {
        const i = ((centre + k) % count + count) % count
        const s = samples[i]
        const dx = x - s.x
        const dz = z - s.z
        const sq = dx * dx + dz * dz
        if (sq < bestSq) {
          bestSq = sq
          best = i
        }
      }
      return { best, bestSq }
    }

    let { best, bestSq } = searchAt(hint >= 0 ? hint : 0, hint >= 0 ? 42 : count)
    // Lost the car (respawn, big crash): fall back to a full sweep.
    if (hint >= 0 && bestSq > 900) {
      const full = searchAt(0, count)
      best = full.best
      bestSq = full.bestSq
    }
    if (best < 0) best = 0

    // Refine along the local segment so progress moves smoothly.
    const i = best
    const a = samples[i]
    const b = samples[(i + 1) % count]
    const abx = b.x - a.x
    const abz = b.z - a.z
    const abLenSq = abx * abx + abz * abz
    const seg = abLenSq > 1e-6 ? clamp(((x - a.x) * abx + (z - a.z) * abz) / abLenSq, 0, 1) : 0

    const px = a.x + abx * seg
    const pz = a.z + abz * seg
    const dx = x - px
    const dz = z - pz
    const r = rights[i]
    const lateral = dx * r.x + dz * r.z

    const progress = (((i + seg) % count) + count) % count / count
    return { index: i, progress, lateral, distance: Math.hypot(dx, dz) }
  }

  const tmp = new THREE.Vector3()

  function positionAt(t: number, lateral: number, out: THREE.Vector3): THREE.Vector3 {
    const wrapped = ((t % 1) + 1) % 1
    const f = wrapped * count
    const i = Math.floor(f) % count
    const frac = f - Math.floor(f)
    const a = samples[i]
    const b = samples[(i + 1) % count]
    tmp.set(a.x + (b.x - a.x) * frac, 0, a.z + (b.z - a.z) * frac)
    const r = rights[i]
    return out.set(tmp.x + r.x * lateral, 0, tmp.z + r.z * lateral)
  }

  function headingAt(t: number): number {
    const wrapped = ((t % 1) + 1) % 1
    const i = Math.floor(wrapped * count) % count
    const tan = tangents[i]
    return Math.atan2(tan.x, tan.z)
  }

  return {
    spec,
    curve,
    samples,
    rights,
    tangents,
    count,
    length,
    halfWidth,
    wallHalf,
    curvature,
    nearest,
    positionAt,
    headingAt,
  }
}

/**
 * Circuits are immutable, so they are built once and shared by the race scene,
 * the minimap and every menu preview.
 */
const curveCache = new Map<string, TrackCurve>()

export function getCachedCurve(spec: TrackSpec): TrackCurve {
  let cached = curveCache.get(spec.id)
  if (!cached) {
    cached = buildTrackCurve(spec)
    curveCache.set(spec.id, cached)
  }
  return cached
}

/** Corner speed limit for the AI, in m/s. */
export function cornerSpeed(radius: number, grip: number, safety = 1): number {
  const r = Math.max(radius, 12)
  return Math.sqrt(Math.max(grip, 1) * r) * safety
}

export const FULL_TURN = TAU
