import * as THREE from 'three'

export type ColorFn = (segment: number, across: number) => [number, number, number]

/**
 * Lofts a flat strip along the track. Normals are forced to +Y because the road
 * is horizontal everywhere, which removes any chance of a winding mistake
 * producing a black unlit surface.
 */
export function flatRibbon(
  samples: THREE.Vector3[],
  rights: THREE.Vector3[],
  lateral: number[],
  y: number,
  vScale = 9,
  colorFn?: ColorFn,
): THREE.BufferGeometry {
  const n = samples.length
  const m = lateral.length
  const pos = new Float32Array(n * m * 3)
  const nor = new Float32Array(n * m * 3)
  const uv = new Float32Array(n * m * 2)
  const col = colorFn ? new Float32Array(n * m * 3) : null

  const dists = new Float32Array(n + 1)
  for (let i = 1; i <= n; i++) {
    dists[i] = dists[i - 1] + samples[(i - 1) % n].distanceTo(samples[i % n])
  }

  for (let i = 0; i < n; i++) {
    const c = samples[i]
    const r = rights[i]
    const v = dists[i] / vScale
    for (let j = 0; j < m; j++) {
      const l = lateral[j]
      const k = (i * m + j) * 3
      pos[k] = c.x + r.x * l
      pos[k + 1] = y
      pos[k + 2] = c.z + r.z * l
      nor[k] = 0
      nor[k + 1] = 1
      nor[k + 2] = 0
      const u = (i * m + j) * 2
      uv[u] = m === 1 ? 0 : j / (m - 1)
      uv[u + 1] = v
      if (col && colorFn) {
        const [cr, cg, cb] = colorFn(i, j)
        col[k] = cr
        col[k + 1] = cg
        col[k + 2] = cb
      }
    }
  }

  const idx: number[] = []
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j
      const b = i * m + j + 1
      const c = i2 * m + j
      const d = i2 * m + j + 1
      idx.push(a, b, c, b, d, c)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.setIndex(idx)
  geo.computeBoundingSphere()
  return geo
}

export interface WallProfilePoint {
  /** Lateral offset in metres from the centre line. */
  x: number
  /** Height above the road in metres. */
  y: number
}

/**
 * Lofts a closed profile (such as a barrier cross section) along the track to
 * create the side walls. Rendered double-sided, so winding cannot bite us.
 */
export function wallTube(
  samples: THREE.Vector3[],
  rights: THREE.Vector3[],
  profile: WallProfilePoint[],
  colorFn?: ColorFn,
  side: 'left' | 'right' = 'left',
): THREE.BufferGeometry {
  const n = samples.length
  const m = profile.length
  const pos = new Float32Array(n * m * 3)
  const col = colorFn ? new Float32Array(n * m * 3) : null

  for (let i = 0; i < n; i++) {
    const c = samples[i]
    const r = rights[i]
    for (let j = 0; j < m; j++) {
      const p = profile[j]
      const k = (i * m + j) * 3
      pos[k] = c.x + r.x * p.x
      pos[k + 1] = p.y
      pos[k + 2] = c.z + r.z * p.x
      if (col && colorFn) {
        const [cr, cg, cb] = colorFn(i, j)
        col[k] = cr
        col[k + 1] = cg
        col[k + 2] = cb
      }
    }
  }

  const idx: number[] = []
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n
    for (let j = 0; j < m; j++) {
      const j2 = (j + 1) % m
      const a = i * m + j
      const b = i * m + j2
      const c = i2 * m + j
      const d = i2 * m + j2
      if (side === 'left') {
        idx.push(a, b, c, b, d, c)
      } else {
        idx.push(a, c, b, b, c, d)
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

/** Convenience for turning a hex colour into the 0..1 triple vertex colours need. */
export function hexToRgb(hex: string): [number, number, number] {
  const c = new THREE.Color(hex)
  return [c.r, c.g, c.b]
}
