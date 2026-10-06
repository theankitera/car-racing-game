import * as THREE from 'three'
import type { CarShape } from '../game/types'
import { TAU, clamp } from '../game/utils'

/** A keyframe as [position along the car 0..1, value]. Must be sorted by u. */
type Key = [number, number]

/**
 * Piecewise interpolation between keyframes with smoothstep easing. This keeps
 * the lofted surface free of the overshoot a Catmull-Rom would introduce, so the
 * body never develops a dent between two control points.
 */
export function sampleKeys(keys: Key[], u: number, smooth = true): number {
  if (u <= keys[0][0]) return keys[0][1]
  const last = keys[keys.length - 1]
  if (u >= last[0]) return last[1]
  for (let i = 0; i < keys.length - 1; i++) {
    const [u0, v0] = keys[i]
    const [u1, v1] = keys[i + 1]
    if (u >= u0 && u <= u1) {
      let t = u1 === u0 ? 0 : (u - u0) / (u1 - u0)
      if (smooth) t = t * t * (3 - 2 * t)
      return v0 + (v1 - v0) * t
    }
  }
  return last[1]
}

export interface LoftConfig {
  bottom: Key[]
  top: Key[]
  width: Key[]
  /** Tumblehome: how much the section pinches in as it rises. */
  taper: number
  /** Where along the car this loft spans, in 0..1 body coordinates. */
  from: number
  to: number
  sections: number
  around: number
  /** Total car length in metres, used to place sections in world Z. */
  length: number
  widthScale?: number
}

/**
 * Builds a closed, indexed, smooth-shaded tube from cross sections. Each section
 * is a superellipse whose floor is flatter than its roof, which reads
 * convincingly as car bodywork once the top and bottom lines are shaped.
 */
export function loftTube(cfg: LoftConfig): THREE.BufferGeometry {
  const S = Math.max(3, cfg.sections)
  const R = Math.max(6, cfg.around)
  const { from, to, taper, length } = cfg
  const widthScale = cfg.widthScale ?? 1

  const positions: number[] = []
  const indices: number[] = []
  const rings: number[][] = []

  for (let i = 0; i < S; i++) {
    const f = S === 1 ? 0 : i / (S - 1)
    const u = from + (to - from) * f
    const bottom = sampleKeys(cfg.bottom, u)
    const top = sampleKeys(cfg.top, u)
    const halfW = sampleKeys(cfg.width, u) * widthScale
    const mid = (top + bottom) / 2
    const halfH = Math.max((top - bottom) / 2, 0.006)

    const ring: number[] = []
    for (let j = 0; j < R; j++) {
      const a = (j / R) * TAU
      const c = Math.cos(a)
      const s = Math.sin(a)
      // Squarer exponent on the lower half so the floor stays flat.
      const n = s >= 0 ? 2.85 : 6.2
      const e = 2 / n
      const sx = Math.sign(c) * Math.pow(Math.abs(c), e)
      const sy = Math.sign(s) * Math.pow(Math.abs(s), e)

      const y = mid + halfH * sy
      const hf = clamp((y - bottom) / Math.max(top - bottom, 0.001), 0, 1)
      const x = halfW * sx * (1 - taper * hf)
      ring.push(positions.length / 3)
      positions.push(x, y, (u - 0.5) * length)
    }
    rings.push(ring)
  }

  for (let i = 0; i < S - 1; i++) {
    for (let j = 0; j < R; j++) {
      const j2 = (j + 1) % R
      const a = rings[i][j]
      const b = rings[i][j2]
      const c = rings[i + 1][j]
      const d = rings[i + 1][j2]
      indices.push(a, b, c)
      indices.push(b, d, c)
    }
  }

  const cap = (ring: number[], front: boolean) => {
    let cx = 0
    let cy = 0
    let cz = 0
    for (const vi of ring) {
      cx += positions[vi * 3]
      cy += positions[vi * 3 + 1]
      cz += positions[vi * 3 + 2]
    }
    cx /= ring.length
    cy /= ring.length
    cz /= ring.length
    const centre = positions.length / 3
    positions.push(cx, cy, cz)
    for (let j = 0; j < ring.length; j++) {
      const a = ring[j]
      const b = ring[(j + 1) % ring.length]
      if (front) indices.push(centre, a, b)
      else indices.push(centre, b, a)
    }
  }
  cap(rings[rings.length - 1], true)
  cap(rings[0], false)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

export interface CarGeometries {
  body: THREE.BufferGeometry
  canopy: THREE.BufferGeometry
  roof: THREE.BufferGeometry
}

/**
 * Turns a `CarShape` into the three lofted shells that make up the car:
 * the painted body, the glass greenhouse, and a painted roof panel that is
 * deliberately narrower than the glass so it emerges through the top of the
 * canopy and leaves the windows visible.
 */
export function buildCarGeometries(shape: CarShape): CarGeometries {
  const L = shape.length
  const W = shape.width
  const bodyHalf = (W * shape.bodyDepth) / 2
  const canopyHalf = (W * shape.cabinDepth) / 2
  const belt = shape.belt
  const tail = shape.tailTop
  const nose = shape.noseTop

  const uRear = clamp((shape.cabinRear + 1) / 2, 0.24, 0.46)
  const uFront = clamp((shape.cabinFront + 1) / 2, 0.5, 0.72)
  const span = Math.max(uFront - uRear, 0.08)

  const body = loftTube({
    length: L,
    sections: 44,
    around: 26,
    taper: shape.taper * 0.55,
    from: 0,
    to: 1,
    bottom: [
      [0, 0.44],
      [0.02, 0.24],
      [0.06, 0.115],
      [0.5, 0.1],
      [0.9, 0.115],
      [0.97, 0.2],
      [1, 0.3],
    ],
    top: [
      [0, tail * 0.7],
      [0.018, tail * 0.94],
      [0.05, tail * 0.995],
      [0.18, tail],
      [Math.max(uRear - 0.11, 0.2), belt * 1.03],
      [uRear, belt],
      [uFront, belt],
      [uFront + 0.1, belt * 0.88],
      [0.87, belt * 0.775],
      [0.95, nose],
      [0.98, nose * 0.93],
      [1, nose * 0.68],
    ],
    width: [
      [0, bodyHalf * 0.58],
      [0.03, bodyHalf * 0.85],
      [0.08, bodyHalf * 0.99],
      [0.24, bodyHalf * 0.95],
      [0.4, bodyHalf * 0.88],
      [0.52, bodyHalf * 0.86],
      [0.65, bodyHalf * 0.87],
      [0.78, bodyHalf * 0.96],
      [0.88, bodyHalf * 1],
      [0.94, bodyHalf * 0.94],
      [0.98, bodyHalf * 0.76],
      [1, bodyHalf * 0.46],
    ],
  })

  const canopyBase = belt - 0.04
  const canopyTopKeys: Key[] = [
    [uRear, belt - 0.005],
    [uRear + span * 0.2, belt + shape.cabinTop * 0.82],
    [uRear + span * 0.44, belt + shape.cabinTop],
    [uFront - span * 0.2, belt + shape.cabinTop * 0.78],
    [uFront, belt - 0.005],
  ]
  const canopyWidthKeys: Key[] = [
    [uRear, canopyHalf * 0.7],
    [uRear + span * 0.28, canopyHalf * 0.97],
    [uRear + span * 0.6, canopyHalf],
    [uFront - span * 0.1, canopyHalf * 0.95],
    [uFront, canopyHalf * 0.8],
  ]

  const canopy = loftTube({
    length: L,
    sections: 24,
    around: 22,
    taper: shape.taper,
    from: uRear,
    to: uFront,
    bottom: [
      [uRear, canopyBase],
      [uFront, canopyBase],
    ],
    top: canopyTopKeys,
    width: canopyWidthKeys,
  })

  // Narrower than the glass, so it only breaks the surface near the very top.
  const roofFrom = uRear + span * 0.05
  const roofTo = uFront - span * 0.05
  const roof = loftTube({
    length: L,
    sections: 20,
    around: 20,
    taper: shape.taper,
    from: roofFrom,
    to: roofTo,
    bottom: canopyTopKeys.map(([u, v]) => [u, v - shape.cabinTop * 0.6] as Key),
    top: canopyTopKeys.map(([u, v]) => [u, v + 0.012] as Key),
    width: canopyWidthKeys.map(([u, v]) => [u, v * 0.7] as Key),
  })

  return { body, canopy, roof }
}

/** World-space X offset for a left/right wheel pair. */
export const wheelOffset = (track: number) => track / 2

/**
 * Cars are never rebuilt twice: the lofted meshes are cached per car id for the
 * lifetime of the page. The cache is tiny (eight cars) and this avoids every
 * use-after-dispose footgun when the player swaps cars in the garage.
 */
const geometryCache = new Map<string, CarGeometries>()

export function getCarGeometries(id: string, shape: CarShape): CarGeometries {
  let cached = geometryCache.get(id)
  if (!cached) {
    cached = buildCarGeometries(shape)
    geometryCache.set(id, cached)
  }
  return cached
}
