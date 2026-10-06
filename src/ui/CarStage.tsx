import { Suspense, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Tuning } from '../game/tuning'
import { CarModel } from '../three/CarModel'

interface Props {
  tuning: Tuning
  paint: string
  className?: string
  /** Extra degrees per second applied on top of the user's drag. */
  autoSpin?: number
  cameraPosition?: [number, number, number]
  fov?: number
}

export function CarStage({
  tuning,
  paint,
  className,
  autoSpin = 9,
  cameraPosition = [4.6, 2.35, 5.4],
  fov = 32,
}: Props) {
  const spin = useRef(0)
  const velocity = useRef(0)
  const dragging = useRef(false)
  const lastX = useRef(0)

  return (
    <div
      className={className}
      style={{ cursor: 'grab', touchAction: 'none' }}
      onPointerDown={(e) => {
        dragging.current = true
        lastX.current = e.clientX
        ;(e.target as HTMLElement).style.cursor = 'grabbing'
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return
        const dx = e.clientX - lastX.current
        lastX.current = e.clientX
        spin.current += dx * 0.011
        velocity.current = dx * 0.011
      }}
      onPointerUp={(e) => {
        dragging.current = false
        ;(e.target as HTMLElement).style.cursor = 'grab'
      }}
      onPointerLeave={(e) => {
        dragging.current = false
        ;(e.target as HTMLElement).style.cursor = 'grab'
      }}
    >
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'default' }}
        camera={{ position: cameraPosition, fov }}
      >
        <color attach="background" args={['#070a13']} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[6, 9, 7]} intensity={2.1} />
        <directionalLight position={[-7, 4, -6]} intensity={1.35} color="#6fb6ff" />
        <directionalLight position={[0, 3, -9]} intensity={0.8} color="#ff6ad5" />
        <Suspense fallback={null}>
          <Turntable spin={spin} velocity={velocity} dragging={dragging} autoSpin={autoSpin}>
            <CarModel tuning={tuning} paint={paint} showShadow={false} />
          </Turntable>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]}>
            <circleGeometry args={[6.5, 48]} />
            <meshStandardMaterial color="#0b1120" roughness={0.35} metalness={0.5} />
          </mesh>
          <gridHelper args={[26, 26, '#123047', '#0d2033']} position={[0, 0.002, 0]} />
        </Suspense>
      </Canvas>
    </div>
  )
}

function Turntable({
  spin,
  velocity,
  dragging,
  autoSpin,
  children,
}: {
  spin: React.MutableRefObject<number>
  velocity: React.MutableRefObject<number>
  dragging: React.MutableRefObject<boolean>
  autoSpin: number
  children: React.ReactNode
}) {
  const group = useRef<THREE.Group>(null)
  const bob = useRef(0)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    if (!group.current) return
    if (!dragging.current) {
      velocity.current *= 0.94
      spin.current += (autoSpin * Math.PI) / 180 * dt + velocity.current * 0.12
    }
    group.current.rotation.y = spin.current + Math.PI
    bob.current += dt
    group.current.position.y = Math.sin(bob.current * 1.4) * 0.02
  })

  return <group ref={group}>{children}</group>
}
