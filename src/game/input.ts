import type { DriveInput } from './types'
import { clamp } from './utils'

/** DriveInput plus the raw brake pressure, which only the pad and touch produce. */
export interface RawInput extends DriveInput {
  brakeAmount: number
}

export type ActionButton = 'pause' | 'camera' | 'reset' | 'boost'

interface TouchState {
  steer: number
  throttle: number
  brake: number
  handbrake: boolean
  boost: boolean
}

const keys = new Set<string>()
const pressedActions = new Set<ActionButton>()
const touch: TouchState = { steer: 0, throttle: 0, brake: 0, handbrake: false, boost: false }

let attached = false
/**
 * Only the race screen should swallow keys. On menus the arrow keys and space
 * must keep working so lists can be scrolled normally.
 */
let enabled = true

export function setInputEnabled(on: boolean): void {
  enabled = on
  if (!on) onBlur()
}

const ACCEL = ['KeyW', 'ArrowUp']
const BRAKE = ['KeyS', 'ArrowDown']
const LEFT = ['KeyA', 'ArrowLeft']
const RIGHT = ['KeyD', 'ArrowRight']
const HANDBRAKE = ['Space']
const BOOST = ['ShiftLeft', 'ShiftRight']
const RESET = ['KeyR']
const CAMERA = ['KeyC']

function flagAction(code: string) {
  if (RESET.includes(code)) pressedActions.add('reset')
  if (CAMERA.includes(code)) pressedActions.add('camera')
  if (BOOST.includes(code)) pressedActions.add('boost')
}

function onKeyDown(e: KeyboardEvent) {
  if (!enabled) return
  // Never let the browser scroll the page while driving.
  if (
    [...ACCEL, ...BRAKE, ...LEFT, ...RIGHT, ...HANDBRAKE, ...BOOST].includes(e.code) ||
    e.code === 'Space'
  ) {
    e.preventDefault()
  }
  if (e.repeat) return
  keys.add(e.code)
  flagAction(e.code)
}

function onKeyUp(e: KeyboardEvent) {
  keys.delete(e.code)
}

function onBlur() {
  keys.clear()
  touch.steer = 0
  touch.throttle = 0
  touch.brake = 0
  touch.handbrake = false
  touch.boost = false
}

export function initInput(): () => void {
  if (attached) return () => {}
  attached = true
  window.addEventListener('keydown', onKeyDown, { passive: false })
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  return () => {
    attached = false
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    onBlur()
  }
}

export function clearInputs() {
  keys.clear()
  pressedActions.clear()
  onBlur()
}

export function consumeAction(a: ActionButton): boolean {
  if (pressedActions.has(a)) {
    pressedActions.delete(a)
    return true
  }
  return false
}

export function isKeyDown(code: string): boolean {
  return keys.has(code)
}

export const setTouchSteer = (v: number) => {
  touch.steer = clamp(v, -1, 1)
}
export const setTouchThrottle = (v: number) => {
  touch.throttle = clamp(v, 0, 1)
}
export const setTouchBrake = (v: number) => {
  touch.brake = clamp(v, 0, 1)
}
export const setTouchHandbrake = (v: boolean) => {
  touch.handbrake = v
}
export const setTouchBoost = (v: boolean) => {
  touch.boost = v
}

export function hasTouchInput(): boolean {
  return (
    touch.steer !== 0 || touch.throttle > 0 || touch.brake > 0 || touch.handbrake || touch.boost
  )
}

/** Reads a connected gamepad, if any. Works in every modern browser. */
function padInput(out: RawInput): boolean {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
  for (const pad of pads) {
    if (!pad) continue
    const dead = (v: number) => (Math.abs(v) < 0.12 ? 0 : v)
    const steer = dead(pad.axes[0] ?? 0)
    const rt = pad.buttons[7]?.value ?? 0
    const lt = pad.buttons[6]?.value ?? 0
    const a = pad.buttons[0]?.pressed ? 1 : 0
    if (steer !== 0 || rt > 0.02 || lt > 0.02 || a) {
      out.steer = clamp(steer + a * 0, -1, 1)
      out.throttle = clamp(rt + a * 0.0, -1, 1)
      if (lt > 0.02) out.throttle = 0
      out.brakeAmount = lt
      out.handbrake = pad.buttons[1]?.pressed ?? false
      out.boost = pad.buttons[5]?.pressed ?? false
      return true
    }
  }
  return false
}

/** Fills `out` with the merged keyboard + gamepad + touch state. */
export function readInput(out: RawInput): RawInput {
  let throttle = 0
  for (const k of ACCEL) if (keys.has(k)) throttle += 1
  for (const k of BRAKE) if (keys.has(k)) throttle -= 1

  let steer = 0
  for (const k of LEFT) if (keys.has(k)) steer -= 1
  for (const k of RIGHT) if (keys.has(k)) steer += 1

  const handbrake = HANDBRAKE.some((k) => keys.has(k)) || touch.handbrake
  const boost = BOOST.some((k) => keys.has(k)) || touch.boost

  out.brakeAmount = throttle < 0 ? -throttle : 0
  out.throttle = clamp(throttle, -1, 1)
  out.steer = clamp(steer, -1, 1)
  out.handbrake = handbrake
  out.boost = boost

  // Keyboard release should behave like a spring-loaded touch pedal.
  if (touch.throttle > 0) {
    out.throttle = 1
    out.brakeAmount = 0
  }
  if (touch.brake > 0) {
    out.brakeAmount = 1
    out.throttle = -1
  }
  if (touch.steer !== 0) out.steer = touch.steer

  padInput(out)
  return out
}

export function createRawInput(): RawInput {
  return { throttle: 0, steer: 0, handbrake: false, boost: false, brakeAmount: 0 }
}
