import { useMemo } from 'react'
import type { WheelSpec } from '../game/types'
import { TAU } from '../game/utils'

interface Props {
  spec: WheelSpec
  radius: number
  width: number
  /** Mirror the rim so a deep dish always faces outboard. */
  flip?: boolean
  /** AI cars use the cheap variant: fewer spokes, no shoulders, no hub. */
  detail?: 'high' | 'low'
  brakeColor?: string
}

/**
 * A wheel with its axle along X. Everything is built from primitives so there is
 * nothing to download and every car gets a correct-looking footprint.
 */
export function WheelMesh({ spec, radius, width, flip = false, detail = 'high', brakeColor = '#2b2d33' }: Props) {
  const rimR = radius * (spec.style === 'slick' ? 0.68 : 0.64)
  const low = detail === 'low'
  const spokeCount = low ? Math.min(spec.spokes, 6) : spec.spokes

  const angles = useMemo(() => {
    if (spokeCount <= 0) return []
    return Array.from({ length: spokeCount }, (_, i) => (i / spokeCount) * TAU)
  }, [spokeCount])

  const flipSign = flip ? -1 : 1
  const dishDepth =
    spec.style === 'deepdish' ? -width * 0.26 * flipSign : spec.style === 'slick' ? 0.012 * flipSign : 0

  const spokeThickness = spec.style === 'mesh' ? 0.032 : 0.05
  const spokeReach = radius * 0.62

  return (
    <group>
      {/* tyre */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow={!low}>
        <cylinderGeometry args={[radius, radius, width, low ? 12 : 22, 1, true]} />
        <meshStandardMaterial color={spec.tireColor} roughness={0.92} metalness={0.02} side={2} />
      </mesh>

      {/* rounded shoulders */}
      {!low &&
        [-1, 1].map((s) => (
          <mesh key={s} position={[(s * width) / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[radius - 0.035, 0.038, 6, 20]} />
            <meshStandardMaterial color={spec.tireColor} roughness={0.92} />
          </mesh>
        ))}

      {/* rim barrel */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[rimR, rimR, width * 0.9, low ? 12 : 22, 1, true]} />
        <meshStandardMaterial
          color={spec.rimColor}
          metalness={0.95}
          roughness={0.22}
          side={2}
        />
      </mesh>

      {/* face plate for disc-style rims */}
      {spokeCount === 0 ? (
        <>
          <mesh position={[dishDepth, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[rimR, rimR, 0.035, low ? 12 : 20]} />
            <meshStandardMaterial color={spec.rimColor} metalness={0.92} roughness={0.25} />
          </mesh>
          <mesh position={[dishDepth + 0.03 * flipSign, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[radius * 0.2, radius * 0.2, 0.06, 12]} />
            <meshStandardMaterial color={spec.lipColor} metalness={0.9} roughness={0.3} />
          </mesh>
        </>
      ) : (
        angles.map((a, i) => (
          <group key={i} rotation={[a, 0, 0]}>
            <mesh position={[dishDepth, radius * 0.38, 0]}>
              <boxGeometry args={[width * (spec.style === 'deepdish' ? 0.34 : 0.5), spokeReach, spokeThickness]} />
              <meshStandardMaterial color={spec.rimColor} metalness={0.95} roughness={0.22} />
            </mesh>
            {spec.style === 'mesh' && (
              <mesh position={[dishDepth, radius * 0.38, 0]} rotation={[0.5, 0, 0]}>
                <boxGeometry args={[width * 0.34, spokeReach, spokeThickness]} />
                <meshStandardMaterial color={spec.rimColor} metalness={0.95} roughness={0.22} />
              </mesh>
            )}
          </group>
        ))
      )}

      {/* hub + centre cap */}
      {!low && (
        <>
          <mesh rotation={[0, 0, Math.PI / 2]} position={[dishDepth, 0, 0]}>
            <cylinderGeometry args={[radius * 0.17, radius * 0.17, 0.05, 14]} />
            <meshStandardMaterial color={spec.lipColor} metalness={0.9} roughness={0.32} />
          </mesh>
          <mesh position={[dishDepth + 0.05 * flipSign, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[radius * 0.665, 0.017, 6, 26]} />
            <meshStandardMaterial color={spec.lipColor} metalness={0.95} roughness={0.18} />
          </mesh>
        </>
      )}

      {/* brake disc + caliper */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[-width * 0.12 * flipSign, 0, 0]}>
        <cylinderGeometry args={[radius * 0.56, radius * 0.56, 0.028, low ? 10 : 18]} />
        <meshStandardMaterial color={brakeColor} metalness={0.75} roughness={0.45} />
      </mesh>
      {!low && (
        <mesh position={[-width * 0.1 * flipSign, radius * 0.3, radius * 0.3]} rotation={[0.3, 0, 0]}>
          <boxGeometry args={[width * 0.25, radius * 0.5, 0.11]} />
          <meshStandardMaterial color="#c8442a" metalness={0.5} roughness={0.5} />
        </mesh>
      )}
    </group>
  )
}
