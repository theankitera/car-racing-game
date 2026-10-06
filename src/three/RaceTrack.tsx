import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { TrackCurve } from '../game/curve'
import { mulberry32 } from '../game/utils'
import { checkerTexture, noiseTexture } from './textures'
import { flatRibbon, hexToRgb, wallTube } from './trackMesh'

interface Props {
  curve: TrackCurve
  quality: 'low' | 'medium' | 'high'
}

export const WALL_H = 0.98
export const WALL_T = 0.16

export function RaceTrack({ curve, quality }: Props) {
  const theme = curve.spec.theme
  const hw = curve.halfWidth
  const wallHalf = curve.wallHalf
  const detail = quality === 'low' ? 0.5 : quality === 'medium' ? 0.75 : 1

  const bounds = useMemo(() => {
    let r = 0
    for (const s of curve.samples) r = Math.max(r, Math.hypot(s.x, s.z))
    return r
  }, [curve])

  // ---------------------------------------------------------------- surfaces
  const roadGeo = useMemo(
    () => flatRibbon(curve.samples, curve.rights, [-hw, hw], 0.02, 9),
    [curve, hw],
  )

  const shoulderGeo = useMemo(
    () => flatRibbon(curve.samples, curve.rights, [-hw - 2.6, hw + 2.6], 0.011, 14),
    [curve, hw],
  )

  const edgeColor = hexToRgb(theme.edge)
  const kerbColor = hexToRgb('#c0392b')

  const kerbGeos = useMemo(() => {
    const make = (sign: number) =>
      flatRibbon(
        curve.samples,
        curve.rights,
        [sign * (hw - 0.6), sign * hw],
        0.031,
        6,
        (segment) =>
          curve.curvature[segment] > 0.014 && Math.floor(segment / 4) % 2 === 0
            ? kerbColor
            : edgeColor,
      )
    return [make(-1), make(1)]
  }, [curve, hw, edgeColor, kerbColor])

  const wallGeos = useMemo(() => {
    const barrier = hexToRgb(theme.barrier)
    const top = hexToRgb(theme.barrierTop)
    const alt = hexToRgb(theme.edge)
    const colorFn = (segment: number, j: number): [number, number, number] =>
      j === 1 || j === 2 ? (Math.floor(segment / 6) % 2 === 0 ? top : alt) : barrier

    const left = [
      { x: -wallHalf, y: 0.02 },
      { x: -wallHalf, y: WALL_H },
      { x: -wallHalf - WALL_T, y: WALL_H },
      { x: -wallHalf - WALL_T, y: 0.02 },
    ]
    const right = [
      { x: wallHalf, y: 0.02 },
      { x: wallHalf, y: WALL_H },
      { x: wallHalf + WALL_T, y: WALL_H },
      { x: wallHalf + WALL_T, y: 0.02 },
    ]
    return [
      wallTube(curve.samples, curve.rights, left, colorFn, 'left'),
      wallTube(curve.samples, curve.rights, right, colorFn, 'right'),
    ]
  }, [curve, wallHalf, theme.barrier, theme.barrierTop, theme.edge])

  // ------------------------------------------------------------------ ground
  const groundTex = useMemo(() => {
    const t = noiseTexture(`ground-${theme.ground}`, theme.ground, { grain: 0.11, blobs: 2800 }).clone()
    t.needsUpdate = true
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.RepeatWrapping
    t.repeat.set(Math.max(4, Math.round(bounds / 20)), Math.max(4, Math.round(bounds / 20)))
    return t
  }, [theme.ground, bounds])

  const roadTex = useMemo(() => {
    const t = noiseTexture(`road-${theme.road}`, theme.road, { grain: 0.13, blobs: 3400 }).clone()
    t.needsUpdate = true
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.RepeatWrapping
    return t
  }, [theme.road])

  const neonStrips = useMemo(() => {
    if (!theme.neon) return []
    return [
      flatRibbon(
        curve.samples,
        curve.rights,
        [-(wallHalf + WALL_T) - 0.03, -(wallHalf + WALL_T) - 0.36],
        WALL_H + 0.03,
        8,
      ),
      flatRibbon(
        curve.samples,
        curve.rights,
        [wallHalf + WALL_T + 0.36, wallHalf + WALL_T + 0.03],
        WALL_H + 0.03,
        8,
      ),
    ]
  }, [curve, theme.neon, wallHalf])

  const checkerLine = useMemo(() => {
    const t = checkerTexture('checker').clone()
    t.needsUpdate = true
    t.repeat.set(Math.max(3, Math.round(hw * 1.6)), 2)
    return t
  }, [hw])

  // ------------------------------------------------------------ start / grid
  const startPos = curve.samples[0]
  const startYaw = curve.headingAt(0)
  const pillarSpan = wallHalf + 1.2
  const startRight = curve.rights[0]
  const pillars = [
    new THREE.Vector3(startPos.x - startRight.x * pillarSpan, 0, startPos.z - startRight.z * pillarSpan),
    new THREE.Vector3(startPos.x + startRight.x * pillarSpan, 0, startPos.z + startRight.z * pillarSpan),
  ]

  const scenery = useMemo(() => buildScenery(curve, bounds, detail), [curve, bounds, detail])

  // R3F only disposes objects it created as JSX children. Everything built by
  // hand above — ribbons, walls, cloned textures, the instanced scenery — is
  // attached as a prop or a primitive and would otherwise survive every restart
  // and circuit switch, growing GPU memory for the whole session.
  useEffect(
    () => () => {
      roadGeo.dispose()
      shoulderGeo.dispose()
      for (const g of kerbGeos) g.dispose()
      for (const g of wallGeos) g.dispose()
      for (const g of neonStrips) g.dispose()
      groundTex.dispose()
      roadTex.dispose()
      checkerLine.dispose()
      for (const obj of scenery) disposeObject(obj)
    },
    [roadGeo, shoulderGeo, kerbGeos, wallGeos, neonStrips, groundTex, roadTex, checkerLine, scenery],
  )

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[bounds * 3.4, bounds * 3.4]} />
        <meshStandardMaterial map={groundTex} color={theme.ground} roughness={0.98} metalness={0} />
      </mesh>

      <mesh geometry={shoulderGeo}>
        <meshStandardMaterial color={theme.groundAccent} roughness={0.95} metalness={0} />
      </mesh>

      <mesh geometry={roadGeo}>
        <meshStandardMaterial map={roadTex} color={theme.road} roughness={0.82} metalness={0.05} />
      </mesh>

      {kerbGeos.map((g, i) => (
        <mesh key={`kerb${i}`} geometry={g}>
          <meshStandardMaterial vertexColors roughness={0.7} metalness={0} />
        </mesh>
      ))}

      {wallGeos.map((g, i) => (
        <mesh key={`wall${i}`} geometry={g}>
          <meshStandardMaterial
            vertexColors
            roughness={0.62}
            metalness={0.12}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {neonStrips.map((g, i) => (
        <mesh key={`neon${i}`} geometry={g}>
          <meshBasicMaterial color={theme.neon ?? '#ffffff'} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}

      <mesh position={[startPos.x, 0.036, startPos.z]} rotation={[-Math.PI / 2, 0, -startYaw]}>
        <planeGeometry args={[hw * 2, 2.6]} />
        <meshStandardMaterial map={checkerLine} roughness={0.8} />
      </mesh>

      {pillars.map((p, i) => (
        <mesh key={`gp${i}`} position={[p.x, 3.6, p.z]}>
          <boxGeometry args={[0.42, 7.2, 0.42]} />
          <meshStandardMaterial color="#2b2f38" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[startPos.x, 7.0, startPos.z]} rotation={[0, startYaw, 0]}>
        <boxGeometry args={[pillarSpan * 2 + 0.6, 0.5, 0.6]} />
        <meshStandardMaterial color="#2b2f38" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[startPos.x, 6.1, startPos.z]} rotation={[0, startYaw, 0]}>
        <planeGeometry args={[pillarSpan * 1.7, 1.3]} />
        <meshStandardMaterial
          map={checkerTexture('checker-banner', 12)}
          side={THREE.DoubleSide}
          roughness={0.8}
        />
      </mesh>
      <mesh position={[startPos.x, 6.1, startPos.z]} rotation={[0, startYaw, 0]}>
        <boxGeometry args={[pillarSpan * 2, 0.16, 0.2]} />
        <meshBasicMaterial color="#ff2b2b" toneMapped={false} />
      </mesh>

      {scenery.map((obj, i) => (
        <primitive key={`sc${i}`} object={obj} />
      ))}
    </group>
  )
}

/** Releases a hand-built mesh's GPU resources. */
function disposeObject(obj: THREE.Object3D): void {
  const mesh = obj as THREE.Mesh
  mesh.geometry?.dispose()
  const mat = mesh.material
  if (Array.isArray(mat)) for (const m of mat) m.dispose()
  else mat?.dispose()
}

/** Fills an instanced mesh using a placement callback. */
function instanceBlock(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  total: number,
  pick: () => { x: number; z: number } | null,
  fill: (mesh: THREE.InstancedMesh, i: number, at: { x: number; z: number }) => void,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(total, 1))
  mesh.frustumCulled = false
  let n = 0
  for (let tries = 0; tries < total * 4 && n < total; tries++) {
    const at = pick()
    if (!at) continue
    fill(mesh, n, at)
    n++
  }
  mesh.count = n
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  return mesh
}

/** Builds every instanced scenery mesh for a circuit. Deterministic per track. */
function buildScenery(curve: TrackCurve, bounds: number, detail: number): THREE.Object3D[] {
  const theme = curve.spec.theme
  const seed = 0x51ed270b ^ (curve.spec.id.length * 7919) ^ (curve.count * 31)
  const rnd = mulberry32(seed >>> 0)
  const cell = 12
  const keepOut = curve.wallHalf + 6

  // Occupancy grid: nothing is ever dropped on the racing surface.
  const blocked = new Set<string>()
  const radius = Math.ceil(keepOut / cell) + 1
  for (const s of curve.samples) {
    const cx = Math.floor(s.x / cell)
    const cz = Math.floor(s.z / cell)
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        blocked.add(`${cx + dx},${cz + dz}`)
      }
    }
  }
  const isFree = (x: number, z: number) =>
    !blocked.has(`${Math.floor(x / cell)},${Math.floor(z / cell)}`)

  const maxR = bounds + 170
  const pick = (): { x: number; z: number } | null => {
    for (let i = 0; i < 10; i++) {
      const a = rnd() * Math.PI * 2
      const r = Math.sqrt(rnd()) * maxR
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      if (isFree(x, z)) return { x, z }
    }
    return null
  }

  const objects: THREE.Object3D[] = []
  const matrix = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const euler = new THREE.Euler()

  // ---- trackside advertising boards follow the barriers exactly -------------
  {
    const total = Math.max(8, Math.round(80 * detail))
    const palette = [theme.barrierTop, theme.edge, theme.line, '#ffffff', theme.groundAccent]
    const boards = new THREE.InstancedMesh(
      new THREE.BoxGeometry(3.4, 1.1, 0.16),
      new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.15 }),
      total,
    )
    boards.frustumCulled = false
    for (let i = 0; i < total; i++) {
      const idx = Math.floor(((i + 0.5) / total) * curve.count) % curve.count
      const p = curve.samples[idx]
      const right = curve.rights[idx]
      const tangent = curve.tangents[idx]
      const side = i % 2 === 0 ? 1 : -1
      const off = (curve.wallHalf + WALL_T + 0.75) * side
      pos.set(p.x + right.x * off, 0.95, p.z + right.z * off)
      euler.set(0, Math.atan2(-tangent.z, tangent.x), 0)
      quat.setFromEuler(euler)
      scale.set(1, 1, 1)
      matrix.compose(pos, quat, scale)
      boards.setMatrixAt(i, matrix)
      boards.setColorAt(i, new THREE.Color(palette[i % palette.length]))
    }
    boards.instanceMatrix.needsUpdate = true
    if (boards.instanceColor) boards.instanceColor.needsUpdate = true
    objects.push(boards)
  }

  const count = Math.round((theme.scenery === 'neon' ? 260 : 200) * detail)

  if (theme.scenery === 'city' || theme.scenery === 'neon') {
    const palette = theme.night
      ? ['#161a26', '#1c2233', '#111722', '#232a3d']
      : ['#c8c2bb', '#b4ada6', '#a89e96', '#d2ccc4', '#8f9aa6']
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.72,
      metalness: 0.22,
      emissive: theme.night ? new THREE.Color(theme.neon ?? '#ffffff') : new THREE.Color('#000000'),
      emissiveIntensity: theme.night ? 0.2 : 0,
    })

    objects.push(
      instanceBlock(new THREE.BoxGeometry(1, 1, 1), mat, count, pick, (mesh, i, at) => {
        const w = 7 + rnd() * 14
        const d = 7 + rnd() * 14
        const h = 9 + Math.pow(rnd(), 1.8) * (theme.night ? 95 : 58)
        pos.set(at.x, h / 2, at.z)
        euler.set(0, rnd() * Math.PI, 0)
        quat.setFromEuler(euler)
        scale.set(w, h, d)
        matrix.compose(pos, quat, scale)
        mesh.setMatrixAt(i, matrix)
        mesh.setColorAt(i, new THREE.Color(palette[Math.floor(rnd() * palette.length)]))
      }),
    )

    if (theme.night) {
      const signs = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide }),
        Math.max(6, Math.round(140 * detail)),
      )
      signs.frustumCulled = false
      const neonPalette = ['#ff2fd0', '#00e5ff', '#ffe45e', '#7cff6b', '#ff6b3d', '#a86bff']
      let s = 0
      for (let tries = 0; tries < signs.count * 5 && s < signs.count; tries++) {
        const at = pick()
        if (!at) continue
        pos.set(at.x, 12 + rnd() * 72, at.z)
        euler.set(0, rnd() * Math.PI * 2, 0)
        quat.setFromEuler(euler)
        scale.set(4 + rnd() * 11, 2 + rnd() * 5, 1)
        matrix.compose(pos, quat, scale)
        signs.setMatrixAt(s, matrix)
        signs.setColorAt(s, new THREE.Color(neonPalette[Math.floor(rnd() * neonPalette.length)]))
        s++
      }
      signs.count = s
      signs.instanceMatrix.needsUpdate = true
      if (signs.instanceColor) signs.instanceColor.needsUpdate = true
      objects.push(signs)
    }
  } else if (theme.scenery === 'desert') {
    const rockMat = new THREE.MeshStandardMaterial({
      color: '#a8895c',
      roughness: 0.95,
      flatShading: true,
    })
    objects.push(
      instanceBlock(new THREE.IcosahedronGeometry(1, 0), rockMat, count, pick, (mesh, i, at) => {
        const s = 1.6 + rnd() * 7
        pos.set(at.x, s * 0.34, at.z)
        euler.set(rnd(), rnd() * Math.PI, rnd() * 0.3)
        quat.setFromEuler(euler)
        scale.set(s, s * (0.5 + rnd() * 0.5), s * (0.8 + rnd() * 0.5))
        matrix.compose(pos, quat, scale)
        mesh.setMatrixAt(i, matrix)
      }),
    )
  } else {
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#4a3a2a', roughness: 0.95 })
    const leafMat = new THREE.MeshStandardMaterial({
      color: theme.night ? '#1d2b33' : '#22402c',
      roughness: 0.9,
      flatShading: true,
    })
    const trees = Math.max(6, Math.round(count * 1.4))
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.16, 0.24, 1, 6),
      trunkMat,
      trees,
    )
    const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), leafMat, trees * 2)
    trunks.frustumCulled = false
    leaves.frustumCulled = false
    let tn = 0
    let ln = 0
    for (let tries = 0; tries < trees * 4 && tn < trees; tries++) {
      const at = pick()
      if (!at) continue
      const h = 4 + rnd() * 8
      const yaw = rnd() * Math.PI
      euler.set(0, yaw, 0)
      quat.setFromEuler(euler)

      pos.set(at.x, h * 0.16, at.z)
      scale.set(1, h * 0.32, 1)
      matrix.compose(pos, quat, scale)
      trunks.setMatrixAt(tn++, matrix)

      for (let k = 0; k < 2; k++) {
        const ch = h * (k === 0 ? 0.62 : 0.44)
        const cw = h * 0.26 * (k === 0 ? 1 : 0.7)
        pos.set(at.x, h * (k === 0 ? 0.42 : 0.76), at.z)
        scale.set(cw, ch, cw)
        matrix.compose(pos, quat, scale)
        leaves.setMatrixAt(ln++, matrix)
      }
    }
    trunks.count = tn
    leaves.count = ln
    trunks.instanceMatrix.needsUpdate = true
    leaves.instanceMatrix.needsUpdate = true
    objects.push(trunks, leaves)
  }

  return objects
}
