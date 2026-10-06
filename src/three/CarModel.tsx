import { useMemo } from 'react'
import * as THREE from 'three'
import type { Tuning } from '../game/tuning'
import { TAU, clamp } from '../game/utils'
import { getCarGeometries } from './carGeometry'
import { WheelMesh } from './WheelModel'

/**
 * Mutable handle into a rendered car. The physics loop writes straight into
 * these Object3Ds, so animation never triggers a React re-render.
 */
export interface CarRig {
  body?: THREE.Group
  wheels?: THREE.Object3D[]
  steer?: THREE.Object3D[]
  brakeMat?: THREE.MeshStandardMaterial
  boost?: THREE.Object3D
  headlightMat?: THREE.MeshStandardMaterial
}

interface Props {
  tuning: Tuning
  paint: string
  rig?: CarRig
  detail?: 'high' | 'low'
  showShadow?: boolean
}

export function CarModel({ tuning, paint, rig, detail = 'high', showShadow = true }: Props) {
  const { car, wheel, wheelRadius: r, wheelWidth: ww } = tuning
  const shape = car.shape
  const low = detail === 'low'

  const geo = useMemo(() => getCarGeometries(car.id, shape), [car.id, shape])

  const L = shape.length
  const half = L / 2
  const W = shape.width
  const bodyHalf = (W * shape.bodyDepth) / 2
  const belt = shape.belt
  const tail = shape.tailTop
  const nose = shape.noseTop

  const uRear = clamp((shape.cabinRear + 1) / 2, 0.24, 0.46)
  const uFront = clamp((shape.cabinFront + 1) / 2, 0.5, 0.72)
  const cabinFrontZ = (uFront - 0.5) * L
  const cabinRearZ = (uRear - 0.5) * L
  const cabinMidZ = (cabinFrontZ + cabinRearZ) / 2

  const frontZ = shape.length === 0 ? 0 : tuning.wheelbase / 2
  const rearZ = -tuning.wheelbase / 2
  const frontX = shape.frontTrack / 2
  const rearX = shape.rearTrack / 2

  const accent = car.accent
  const wingY = tail + shape.wingHeight

  const exhaustPositions = useMemo(() => {
    const n = shape.exhausts
    if (n <= 0) return []
    if (n === 1) return [0.34]
    if (n === 2) return [-0.3, 0.3]
    if (n === 3) return [-0.36, 0, 0.36]
    return [-0.42, -0.16, 0.16, 0.42]
  }, [shape.exhausts])

  const wheelSets: Array<{ x: number; z: number; front: boolean; flip: boolean }> = [
    { x: -frontX, z: frontZ, front: true, flip: true },
    { x: frontX, z: frontZ, front: true, flip: false },
    { x: -rearX, z: rearZ, front: false, flip: true },
    { x: rearX, z: rearZ, front: false, flip: false },
  ]

  return (
    <group>
      {/* ---------- bodywork ---------- */}
      <group ref={(o) => { if (o && rig) rig.body = o }}>
        <mesh geometry={geo.body} castShadow={!low} receiveShadow={false}>
          <meshPhysicalMaterial
            color={paint}
            metalness={0.62}
            roughness={0.26}
            clearcoat={1}
            clearcoatRoughness={0.07}
            envMapIntensity={0.9}
          />
        </mesh>

        <mesh geometry={geo.canopy}>
          <meshPhysicalMaterial
            color="#0a0c12"
            metalness={0.35}
            roughness={0.08}
            transparent
            opacity={0.86}
            clearcoat={1}
            clearcoatRoughness={0.03}
            envMapIntensity={1.4}
          />
        </mesh>

        <mesh geometry={geo.roof} castShadow={false}>
          <meshPhysicalMaterial
            color={paint}
            metalness={0.62}
            roughness={0.26}
            clearcoat={1}
            clearcoatRoughness={0.07}
          />
        </mesh>

        {/* front splitter */}
        {shape.splitter && (
          <mesh position={[0, 0.075, half - 0.3]} castShadow={false}>
            <boxGeometry args={[W * shape.bodyDepth * 0.94, 0.05, 0.52]} />
            <meshStandardMaterial color={accent} metalness={0.35} roughness={0.55} />
          </mesh>
        )}

        {/* side skirts */}
        {shape.sideSkirts &&
          [-1, 1].map((s) => (
            <mesh key={s} position={[s * bodyHalf * 0.99, 0.135, -0.05]}>
              <boxGeometry args={[0.1, 0.13, L * 0.4]} />
              <meshStandardMaterial color={accent} metalness={0.3} roughness={0.6} />
            </mesh>
          ))}

        {/* rear diffuser + fins */}
        {shape.diffuser && (
          <group position={[0, 0.185, -half + 0.16]}>
            <mesh>
              <boxGeometry args={[W * 0.76, 0.24, 0.34]} />
              <meshStandardMaterial color={accent} metalness={0.35} roughness={0.6} />
            </mesh>
            {[-0.3, -0.15, 0, 0.15, 0.3].map((x) => (
              <mesh key={x} position={[x * W * 0.6, -0.02, 0.05]}>
                <boxGeometry args={[0.025, 0.3, 0.3]} />
                <meshStandardMaterial color="#101216" metalness={0.4} roughness={0.5} />
              </mesh>
            ))}
          </group>
        )}

        {/* rear wing */}
        {shape.wing !== 'none' && <RearWing shape={shape} width={W} bodyHalf={bodyHalf} tail={tail} rearZ={-half} accent={accent} paint={paint} />}

        {/* headlights */}
        {[-1, 1].map((s) => (
          <group key={`hl${s}`}>
            <mesh position={[s * bodyHalf * 0.66, nose * 0.74, half - 0.14]} rotation={[0.12, 0, 0]}>
              <boxGeometry args={[0.4, 0.1, 0.12]} />
              <meshStandardMaterial
                ref={s === -1 ? (o) => { if (o && rig) rig.headlightMat = o } : undefined}
                color="#eaf4ff"
                emissive="#dceaff"
                emissiveIntensity={1.6}
                roughness={0.25}
                metalness={0.1}
              />
            </mesh>
            <mesh position={[s * bodyHalf * 0.42, nose * 0.66, half - 0.1]}>
              <boxGeometry args={[0.16, 0.06, 0.1]} />
              <meshStandardMaterial color="#ffb648" emissive="#ff9a1f" emissiveIntensity={1.2} />
            </mesh>
          </group>
        ))}

        {/* tail lights */}
        <mesh position={[0, tail * 0.82, -half + 0.06]}>
          <boxGeometry args={[W * 0.62, 0.07, 0.06]} />
          <meshStandardMaterial
            ref={(o) => { if (o && rig) rig.brakeMat = o }}
            color="#7a0d12"
            emissive="#ff1a22"
            emissiveIntensity={0.8}
            toneMapped={false}
          />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={`tl${s}`} position={[s * bodyHalf * 0.72, tail * 0.74, -half + 0.07]}>
            <boxGeometry args={[0.22, 0.09, 0.06]} />
            <meshStandardMaterial color="#5f0a0e" emissive="#ff2a30" emissiveIntensity={0.7} toneMapped={false} />
          </mesh>
        ))}

        {/* exhausts */}
        {exhaustPositions.map((x) => (
          <mesh key={`ex${x}`} position={[x, 0.3, -half + 0.04]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.062, 0.07, 0.16, 14, 1, true]} />
            <meshStandardMaterial color="#8e939c" metalness={1} roughness={0.28} side={2} />
          </mesh>
        ))}

        {/* mirrors */}
        {[-1, 1].map((s) => (
          <group key={`mir${s}`} position={[s * bodyHalf * 0.98, belt + 0.03, cabinFrontZ - 0.12]}>
            <mesh position={[s * 0.07, 0.03, 0]}>
              <boxGeometry args={[0.14, 0.03, 0.05]} />
              <meshStandardMaterial color={accent} metalness={0.5} roughness={0.4} />
            </mesh>
            <mesh position={[s * 0.16, 0.06, 0.02]}>
              <boxGeometry args={[0.06, 0.09, 0.19]} />
              <meshStandardMaterial color={paint} metalness={0.7} roughness={0.25} />
            </mesh>
          </group>
        ))}

        {/* bonnet vents */}
        {shape.hoodVents &&
          [-1, 1].map((s) => (
            <mesh key={`hv${s}`} position={[s * 0.26, belt * 0.79, half * 0.72]} rotation={[0.1, 0, 0]}>
              <boxGeometry args={[0.32, 0.03, 0.26]} />
              <meshStandardMaterial color="#0d0f13" metalness={0.4} roughness={0.7} />
            </mesh>
          ))}

        {/* roof scoop */}
        {shape.roofScoop && (
          <mesh position={[0, belt + shape.cabinTop + 0.035, cabinMidZ + 0.05]}>
            <boxGeometry args={[0.42, 0.1, 0.62]} />
            <meshStandardMaterial color={accent} metalness={0.4} roughness={0.5} />
          </mesh>
        )}

        {/* fender arches */}
        {shape.flares &&
          wheelSets.map((w, i) => (
            <mesh
              key={`ar${i}`}
              position={[w.x, r, w.z]}
              rotation={[0, Math.PI / 2, 0]}
              scale={[1, 1, 1]}
            >
              <torusGeometry args={[r * 1.12, 0.05, 6, low ? 10 : 18, Math.PI]} />
              <meshStandardMaterial color={accent} metalness={0.5} roughness={0.45} />
            </mesh>
          ))}
      </group>

      {/* ---------- wheels ---------- */}
      {wheelSets.map((w, i) => (
        <group key={`ws${i}`} position={[w.x, r, w.z]}>
          <group
            ref={(o) => {
              if (o && rig) {
                rig.steer = rig.steer ?? []
                rig.steer[i] = o
              }
            }}
          >
            <group
              ref={(o) => {
                if (o && rig) {
                  rig.wheels = rig.wheels ?? []
                  rig.wheels[i] = o
                }
              }}
            >
              <WheelMesh
                spec={wheel}
                radius={r}
                width={ww}
                flip={w.flip}
                detail={low ? 'low' : 'high'}
              />
            </group>
          </group>
        </group>
      ))}

      {/* ---------- nitro flames ---------- */}
      <group
        ref={(o) => { if (o && rig) rig.boost = o }}
        visible={false}
      >
        {(exhaustPositions.length ? exhaustPositions : [0]).map((x) => (
          <group key={`fl${x}`} position={[x, 0.3, -half - 0.42]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.135, 0.95, 12, 1, true]} />
              <meshBasicMaterial
                color="#59c7ff"
                transparent
                opacity={0.72}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.06, 0.6, 10, 1, true]} />
              <meshBasicMaterial
                color="#ffffff"
                transparent
                opacity={0.85}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          </group>
        ))}
      </group>

      {/* ---------- soft ground shadow ---------- */}
      {showShadow && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[Math.max(L, W) * 0.62, 20]} />
          <meshBasicMaterial
            color="#000000"
            transparent
            opacity={0.33}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  )
}

/** Rear aero, from a subtle ducktail up to a swan-neck GT wing. */
function RearWing({
  shape,
  width,
  bodyHalf,
  tail,
  rearZ,
  accent,
  paint,
}: {
  shape: Tuning['car']['shape']
  width: number
  bodyHalf: number
  tail: number
  rearZ: number
  accent: string
  paint: string
}) {
  const { wing, wingHeight } = shape
  const du = wing === 'duck'
  const planeY = du ? tail + 0.035 : tail + wingHeight
  const planeW = wing === 'gt' || wing === 'swan' ? width * 0.94 : width * 0.84
  const chord = du ? 0.26 : wing === 'gt' ? 0.42 : 0.34
  const z = rearZ + (du ? 0.26 : 0.16)
  const strutH = Math.max(planeY - tail, 0.05)

  return (
    <group>
      <mesh position={[0, planeY, z]} rotation={[du ? -0.24 : -0.14, 0, 0]} castShadow={false}>
        <boxGeometry args={[planeW, du ? 0.045 : 0.055, chord]} />
        <meshStandardMaterial color={du ? paint : accent} metalness={0.45} roughness={0.42} />
      </mesh>

      {!du && (
        <>
          {[-1, 1].map((s) => (
            <mesh key={`ep${s}`} position={[s * (planeW / 2), planeY + 0.03, z]}>
              <boxGeometry args={[0.022, 0.24, chord * 1.16]} />
              <meshStandardMaterial color={accent} metalness={0.45} roughness={0.42} />
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={`st${s}`} position={[s * bodyHalf * 0.5, (planeY + tail) / 2, z + 0.06]} rotation={[wing === 'swan' ? 0.22 : 0, 0, 0]}>
              <boxGeometry args={[0.055, strutH, 0.11]} />
              <meshStandardMaterial color={accent} metalness={0.5} roughness={0.4} />
            </mesh>
          ))}
        </>
      )}
    </group>
  )
}

/** Small helper so wheels can be laid out from anywhere. */
export function wheelAngles(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i / count) * TAU)
}
