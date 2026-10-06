import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { createAiCar, resolveAiSpacing, stepAi, type AiCar } from '../game/ai'
import { CARS } from '../game/cars'
import type { TrackCurve } from '../game/curve'
import { consumeAction, createRawInput, readInput } from '../game/input'
import { telemetry, resetTelemetry, type MiniCar } from '../game/telemetry'
import { computeReward, computeTuning, type Tuning } from '../game/tuning'
import type { RaceResult, Settings, TrackSpec } from '../game/types'
import { emptyUpgrades } from '../game/upgrades'
import { WHEELS } from '../game/wheels'
import { clamp } from '../game/utils'
import { createVehicle, rankRace, resetToTrack, stepVehicle, type Rankable, type Vehicle } from '../game/vehicle'
import { CarModel, type CarRig } from './CarModel'
import { RaceTrack } from './RaceTrack'
import { audio } from '../game/audio'

interface Props {
  spec: TrackSpec
  curve: TrackCurve
  playerTuning: Tuning
  paint: string
  settings: Settings
  paused: boolean
  onComplete: (result: RaceResult) => void
}

const COUNTDOWN = 3
const FORCE_END_AFTER = 1.9
const MAX_RACE_TIME = 480

export function RaceScene(props: Props) {
  const { spec, curve, playerTuning, paint, settings, paused, onComplete } = props
  const { camera } = useThree()
  const theme = spec.theme

  const totalCars = spec.traffic + 1
  const totalLaps = spec.laps

  // ------------------------------------------------------------------ actors
  const player = useMemo(
    () => createVehicle(curve, playerTuning, totalCars - 1, totalCars, true),
    [curve, playerTuning, totalCars],
  )

  const aiCars = useMemo(() => {
    const pool = CARS.filter((c) => c.id !== playerTuning.car.id)
    const list: AiCar[] = []
    for (let i = 0; i < spec.traffic; i++) {
      const car = pool[i % pool.length]
      const wheel = WHEELS[Math.min(WHEELS.length - 1, 1 + (i % 4))]
      const skill = clamp(0.845 + spec.difficulty * 0.03 + ((i * 37) % 13) * 0.0015, 0.8, 1.02)
      const tuning = computeTuning(car.id, wheel.id, emptyUpgrades())
      list.push(createAiCar(curve, `ai-${i}`, car.id, wheel.id, tuning, i, totalCars, skill))
    }
    return list
  }, [curve, spec, playerTuning.car.id, totalCars])

  const playerRig = useMemo<CarRig>(() => ({}), [playerTuning.car.id, playerTuning.wheel.id])
  const aiRigs = useMemo<CarRig[]>(() => aiCars.map(() => ({})), [aiCars])

  /** Every car on track, rebuilt only when the grid changes — never per frame. */
  const field = useMemo<Rankable[]>(() => [player, ...aiCars], [player, aiCars])

  const playerRoot = useRef<THREE.Group>(null)
  const aiRoots = useRef<Array<THREE.Group | null>>([])

  const raw = useMemo(() => createRawInput(), [])
  const clock = useRef({
    state: 'countdown' as 'countdown' | 'racing' | 'finished',
    timer: COUNTDOWN,
    raceTime: 0,
    finishedFor: 0,
    fpsAccum: 0,
    fpsFrames: 0,
    shake: 0,
    reported: false,
    lastGear: 1,
  })

  const tmp = useMemo(
    () => ({ cam: new THREE.Vector3(), look: new THREE.Vector3(), fwd: new THREE.Vector3() }),
    [],
  )

  useEffect(() => {
    resetTelemetry(totalLaps, totalCars)
    telemetry.mapRadius = curve.samples.reduce((m, s) => Math.max(m, Math.hypot(s.x, s.z)), 200)
    telemetry.maxHealth = playerTuning.maxHealth
    telemetry.nitroMax = playerTuning.nitroCapacity
    telemetry.health = playerTuning.maxHealth
    telemetry.nitro = player.nitro
    clock.current = {
      state: 'countdown',
      timer: COUNTDOWN,
      raceTime: 0,
      finishedFor: 0,
      fpsAccum: 0,
      fpsFrames: 0,
      shake: 0,
      reported: false,
      lastGear: 1,
    }
    // Place the camera immediately so there is no first-frame jump.
    aimCamera(camera, player, settings, 1, tmp)

    // Dev-only handle so the browser end-to-end script can read live state.
    if (import.meta.env.DEV) {
      ;(window as unknown as { __apexTelemetry?: typeof telemetry }).__apexTelemetry = telemetry
      ;(window as unknown as { __apexVehicle?: Vehicle }).__apexVehicle = player
    }
  }, [curve, player, settings, camera, totalLaps, totalCars, playerTuning, tmp])

  useFrame((_, delta) => {
    const c = clock.current
    // Guard against the zero-length first frame and tab-switch time jumps.
    const dt = Number.isFinite(delta) && delta > 0 ? Math.min(delta, 0.05) : 0

    if (paused) {
      updateVisuals(player, playerRoot.current, playerRig)
      return
    }

    c.fpsAccum += delta
    c.fpsFrames++
    if (c.fpsAccum > 0.5) {
      telemetry.fps = Math.round(c.fpsFrames / c.fpsAccum)
      c.fpsAccum = 0
      c.fpsFrames = 0
    }

    if (c.state === 'countdown') {
      const before = c.timer
      c.timer -= dt
      // `before >= mark` matters: the timer starts at exactly 3, so a strict
      // comparison would swallow the first beep of the cadence.
      for (const mark of [3, 2, 1]) {
        if (before >= mark && c.timer < mark) audio.ui('count')
      }
      if (c.timer <= 0) {
        c.state = 'racing'
        audio.ui('go')
      }
    } else if (c.state === 'racing') {
      c.raceTime += dt
      if (c.raceTime > MAX_RACE_TIME) {
        c.state = 'finished'
      }
    } else {
      c.finishedFor += dt
    }

    const frozen = c.state === 'countdown'

    // ------------------------------------------------------------- player
    readInput(raw)
    if (!frozen && consumeAction('reset') && player.resetCooldown <= 0) {
      resetToTrack(player, curve, true, playerTuning)
      audio.impact(0.25)
    }

    const healthBefore = player.health
    stepVehicle(
      player,
      playerTuning,
      { throttle: raw.throttle, steer: raw.steer, handbrake: raw.handbrake, boost: raw.boost },
      curve,
      dt,
      c.raceTime,
      totalLaps,
      { frozen },
    )
    if (player.health < healthBefore - 0.4) {
      const strength = clamp((healthBefore - player.health) / 22, 0.15, 1)
      audio.impact(strength)
      if (settings.shake) c.shake = Math.min(1, c.shake + strength * 0.8)
    }

    // ---------------------------------------------------------------- AI
    for (const ai of aiCars) {
      const gap = player.lapMeter - ai.lapMeter
      const paceScale = frozen ? 0 : clamp(1 + gap * 0.09, 0.955, 1.075)
      stepAi(ai, curve, dt, c.raceTime, totalLaps, { paceScale, halfWidth: curve.halfWidth })
    }
    resolveAiSpacing(aiCars)

    // ------------------------------------------------------- car vs car
    if (!frozen) {
      for (const ai of aiCars) {
        const dx = player.x - ai.x
        const dz = player.z - ai.z
        const distSq = dx * dx + dz * dz
        const min = 3.1
        if (distSq > min * min || distSq < 1e-5) continue
        const dist = Math.sqrt(distSq)
        const ux = dx / dist
        const uz = dz / dist
        const push = (min - dist) * 0.55
        player.x += ux * push
        player.z += uz * push
        ai.x -= ux * push * 0.7
        ai.z -= uz * push * 0.7
        const rel = player.vLong - 0.2
        player.vLong *= 0.965
        player.vLat += (ux * Math.cos(player.yaw) - uz * Math.sin(player.yaw)) * rel * 0.06
        ai.speed *= 0.985
      }
    }

    // ------------------------------------------------------------- ranking
    rankRace(field)

    // ------------------------------------------------------------ visuals
    updateVisuals(player, playerRoot.current, playerRig)
    for (let i = 0; i < aiCars.length; i++) {
      updateAiVisuals(aiCars[i], aiRoots.current[i], aiRigs[i])
    }
    if (playerRig.boost) playerRig.boost.visible = player.boosting && c.state === 'racing'
    if (playerRig.brakeMat) {
      playerRig.brakeMat.emissiveIntensity = raw.throttle < -0.1 ? 3.2 : 0.8
    }

    // ------------------------------------------------------------- camera
    c.shake = Math.max(0, c.shake - dt * 2.2)
    aimCamera(camera, player, settings, 1 - Math.exp(-9 * dt), tmp)
    if (settings.shake && c.shake > 0.01) {
      camera.position.x += (Math.random() - 0.5) * c.shake * 0.5
      camera.position.y += (Math.random() - 0.5) * c.shake * 0.4
    }

    // ----------------------------------------------------------- telemetry
    writeTelemetry(player, playerTuning, aiCars, c.state, c.timer, c.raceTime)

    // --------------------------------------------------------- engine audio
    if (settings.sound) {
      const ratio = clamp(Math.abs(player.vLong) / playerTuning.maxSpeed, 0, 1.2)
      const gearCount = 6
      const gearFloat = Math.min(gearCount - 0.001, ratio * gearCount)
      const frac = gearFloat - Math.floor(gearFloat)
      const rpm = clamp(0.16 + frac * 0.78 + (frozen ? 0 : 0.06), 0, 1)
      audio.update(
        rpm,
        Math.max(0, raw.throttle),
        ratio,
        player.slip,
        player.boosting,
        player.offRoad,
      )
    }

    // ------------------------------------------------------------- finish
    const shouldEnd = player.finished || c.state === 'finished'
    if (shouldEnd && c.state !== 'finished') c.state = 'finished'
    if (c.state === 'finished' && !c.reported && (!player.finished ? c.finishedFor > 0.4 : c.finishedFor > FORCE_END_AFTER)) {
      c.reported = true
      // A car that never crosses the line is shown in last place, so it must
      // also be paid the last-place multiplier — feeding the live position
      // here let a timeout while running first collect the winner's cheque.
      const shownPos = player.finished ? player.position : Math.max(player.position, totalCars)
      const result: RaceResult = {
        trackId: spec.id,
        position: shownPos,
        totalTime: player.finished ? player.finishTime : c.raceTime,
        bestLap: player.bestLap,
        laps: player.lapsDone,
        coins: computeReward(spec, shownPos, player.lapsDone, player.finished),
        finished: player.finished,
        distance: player.distance,
        newRecord: false,
      }
      onComplete(result)
    }
  })

  return (
    <>
      <fog attach="fog" args={[theme.fog, theme.fogNear, theme.fogFar]} />
      <SkyDome theme={theme} radius={Math.max(theme.fogFar * 1.4, 900)} />

      <ambientLight intensity={theme.ambient} color={theme.ambientColor} />
      <hemisphereLight args={[theme.hemiSky, theme.hemiGround, theme.ambient * 0.9]} />
      <directionalLight
        position={theme.sunPosition}
        intensity={theme.sunIntensity}
        color={theme.sunColor}
      />

      <RaceTrack curve={curve} quality={settings.quality} />

      <group ref={playerRoot}>
        <CarModel tuning={playerTuning} paint={paint} rig={playerRig} />
      </group>

      {aiCars.map((ai, i) => (
        <group key={ai.id} ref={(o) => { aiRoots.current[i] = o }}>
          <CarModel
            tuning={ai.tuning}
            paint={ai.tuning.car.paint}
            rig={aiRigs[i]}
            detail={settings.quality === 'low' ? 'low' : 'high'}
          />
        </group>
      ))}
    </>
  )
}

function updateVisuals(v: Vehicle, root: THREE.Group | null, rig: CarRig): void {
  if (!root) return
  root.position.set(v.x, 0, v.z)
  root.rotation.y = v.yaw
  const body = rig.body
  if (body) {
    body.rotation.z = v.roll
    body.rotation.x = v.pitch
    body.position.y = 0
  }
  const steerAngle = -v.steerAngle
  if (rig.steer) {
    rig.steer[0] && (rig.steer[0].rotation.y = steerAngle)
    rig.steer[1] && (rig.steer[1].rotation.y = steerAngle)
  }
  if (rig.wheels) {
    const spin = v.distance / Math.max(0.2, 0.34)
    for (let i = 0; i < rig.wheels.length; i++) {
      if (rig.wheels[i]) rig.wheels[i].rotation.x = spin
    }
  }
}

function updateAiVisuals(ai: AiCar, root: THREE.Group | null, rig: CarRig): void {
  if (!root) return
  root.position.set(ai.x, 0, ai.z)
  root.rotation.y = ai.yaw
  if (rig.body) {
    rig.body.rotation.z = ai.roll
    rig.body.rotation.x = 0
  }
  if (rig.steer) {
    rig.steer[0] && (rig.steer[0].rotation.y = ai.steer * 0.55)
    rig.steer[1] && (rig.steer[1].rotation.y = ai.steer * 0.55)
  }
  if (rig.wheels) {
    for (let i = 0; i < rig.wheels.length; i++) {
      if (rig.wheels[i]) rig.wheels[i].rotation.x = ai.wheelSpin
    }
  }
  if (rig.boost) rig.boost.visible = ai.boosting
}

function aimCamera(
  camera: THREE.Camera,
  v: Vehicle,
  settings: Settings,
  t: number,
  tmp: { cam: THREE.Vector3; look: THREE.Vector3; fwd: THREE.Vector3 },
): void {
  const mode = settings.camera
  const fx = Math.sin(v.yaw)
  const fz = Math.cos(v.yaw)
  const speedRatio = clamp(Math.abs(v.vLong) / 70, 0, 1)

  if (mode === 'hood') {
    tmp.cam.set(v.x - fx * 0.6, 1.02, v.z - fz * 0.6)
    camera.position.lerp(tmp.cam, 1)
    tmp.look.set(v.x + fx * 40, 1.0, v.z + fz * 40)
  } else {
    const back = mode === 'close' ? 5.6 : 7.6
    const height = mode === 'close' ? 2.3 : 3.05
    const drift = clamp(v.vLat * 0.06, -0.6, 0.6)
    tmp.cam.set(
      v.x - fx * back + Math.cos(v.yaw) * drift,
      height,
      v.z - fz * back - Math.sin(v.yaw) * drift,
    )
    camera.position.lerp(tmp.cam, t)
    tmp.look.set(v.x + fx * 9, 1.15, v.z + fz * 9)
  }
  const cam = camera as THREE.PerspectiveCamera
  const targetFov = (mode === 'hood' ? 72 : 62) + speedRatio * 20
  if (cam.isPerspectiveCamera) {
    cam.fov += (targetFov - cam.fov) * Math.min(1, t * 2.2)
    cam.updateProjectionMatrix()
  }
  camera.lookAt(tmp.look)
}

function writeTelemetry(
  player: Vehicle,
  tuning: Tuning,
  aiCars: AiCar[],
  state: 'countdown' | 'racing' | 'finished',
  timer: number,
  raceTime: number,
): void {
  const ratio = clamp(Math.abs(player.vLong) / tuning.maxSpeed, 0, 1.2)
  if (!Number.isFinite(ratio + player.health + player.nitro + player.progress)) return
  const gearCount = 6
  const gearFloat = Math.min(gearCount - 0.001, Math.max(0, ratio * gearCount))
  const gear = player.vLong < -0.5 ? 0 : Math.floor(gearFloat) + 1
  const frac = gearFloat - Math.floor(gearFloat)

  telemetry.state = state
  telemetry.countdown = Math.max(0, timer)
  telemetry.raceTime = raceTime
  telemetry.speed = Math.abs(player.vLong)
  telemetry.gear = gear
  telemetry.rpm = clamp(0.14 + frac * 0.8 + (state === 'countdown' ? 0.12 : 0), 0, 1)
  telemetry.lap = Math.min(player.lapsDone + 1, telemetry.totalLaps)
  telemetry.position = player.position
  telemetry.lastLap = player.lastLapTime
  telemetry.bestLap = player.bestLap
  telemetry.nitro = player.nitro
  telemetry.nitroMax = tuning.nitroCapacity
  telemetry.health = player.health
  telemetry.maxHealth = tuning.maxHealth
  telemetry.boosting = player.boosting
  telemetry.offRoad = player.offRoad
  telemetry.wrongWay = player.wrongWay
  telemetry.wrecked = player.wrecked
  telemetry.damageFlash = player.damageFlash
  telemetry.progress = player.progress
  telemetry.distance = player.distance

  // Reuse last frame's entries: pushing fresh objects here would allocate a
  // handful of garbage every frame for the whole race.
  const cars = telemetry.cars
  cars.length = aiCars.length + 1
  writeMiniCar(cars, 0, player.x, player.z, true, tuning.car.accent, player.position, 'YOU')
  for (let i = 0; i < aiCars.length; i++) {
    const ai = aiCars[i]
    writeMiniCar(cars, i + 1, ai.x, ai.z, false, ai.tuning.car.paint, ai.position, ai.tuning.car.name)
  }
}

function writeMiniCar(
  cars: MiniCar[],
  i: number,
  x: number,
  z: number,
  isPlayer: boolean,
  color: string,
  position: number,
  name: string,
): void {
  const c = cars[i] ?? (cars[i] = { x: 0, z: 0, isPlayer: false, color: '#ffffff', position: 0, name: '' })
  c.x = x
  c.z = z
  c.isPlayer = isPlayer
  c.color = color
  c.position = position
  c.name = name
}

/** Vertical gradient sky plus stars for night circuits. */
function SkyDome({ theme, radius }: { theme: TrackSpec['theme']; radius: number }) {
  const uniforms = useMemo(
    () => ({
      topColor: { value: new THREE.Color(theme.skyTop) },
      bottomColor: { value: new THREE.Color(theme.skyBottom) },
      exponent: { value: theme.sky === 'sunset' ? 0.85 : 1.15 },
    }),
    [theme.skyTop, theme.skyBottom, theme.sky],
  )

  const stars = useMemo(() => {
    if (!theme.night) return null
    const count = 1400
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const y = Math.random() * 0.85 + 0.05
      const r = Math.sqrt(1 - y * y)
      positions[i * 3] = Math.cos(a) * r * radius * 0.95
      positions[i * 3 + 1] = y * radius * 0.95
      positions[i * 3 + 2] = Math.sin(a) * r * radius * 0.95
    }
    return positions
  }, [theme.night, radius])

  return (
    <group>
      <mesh scale={[radius, radius, radius]}>
        <sphereGeometry args={[1, 32, 20]} />
        <shaderMaterial
          uniforms={uniforms}
          side={THREE.BackSide}
          depthWrite={false}
          toneMapped={false}
          vertexShader={`
            varying vec3 vPos;
            void main() {
              vPos = position;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            uniform vec3 topColor;
            uniform vec3 bottomColor;
            uniform float exponent;
            varying vec3 vPos;
            void main() {
              float h = normalize(vPos).y;
              float k = pow(clamp(h * 0.5 + 0.5, 0.0, 1.0), exponent);
              gl_FragColor = vec4(mix(bottomColor, topColor, k), 1.0);
            }
          `}
        />
      </mesh>
      {stars && (
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[stars, 3]} />
          </bufferGeometry>
          <pointsMaterial size={radius * 0.006} color="#ffffff" sizeAttenuation toneMapped={false} />
        </points>
      )}
    </group>
  )
}


