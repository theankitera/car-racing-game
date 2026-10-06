import * as THREE from 'three'
import { mulberry32 } from '../game/utils'

const cache = new Map<string, THREE.Texture>()

interface NoiseOptions {
  grain?: number
  blobs?: number
  size?: number
  contrast?: number
}

/** Deterministic speckled surface texture, tinted by `base`. */
export function noiseTexture(key: string, base: string, opts: NoiseOptions = {}): THREE.Texture {
  const hit = cache.get(key)
  if (hit) return hit

  const size = opts.size ?? 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.Texture()

  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  const rnd = mulberry32(0x9e3779b9)
  const blobs = opts.blobs ?? 2600
  const grain = opts.grain ?? 0.09
  const contrast = opts.contrast ?? 1

  for (let i = 0; i < blobs; i++) {
    const x = rnd() * size
    const y = rnd() * size
    const r = 0.6 + rnd() * (size / 48)
    const a = 0.015 + rnd() * grain * contrast
    ctx.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // A few broader patches so large surfaces do not look uniform.
  for (let i = 0; i < 26; i++) {
    const x = rnd() * size
    const y = rnd() * size
    const r = size * (0.05 + rnd() * 0.16)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const shade = rnd() > 0.5 ? '255,255,255' : '0,0,0'
    g.addColorStop(0, `rgba(${shade},${0.05 * contrast})`)
    g.addColorStop(1, `rgba(${shade},0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  cache.set(key, tex)
  return tex
}

/** Black and white chequer used for start/finish lines and the gantry banner. */
export function checkerTexture(key: string, squares = 8, a = '#f4f6fa', b = '#14161c'): THREE.Texture {
  const hit = cache.get(key)
  if (hit) return hit

  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.Texture()

  const cell = size / squares
  for (let x = 0; x < squares; x++) {
    for (let y = 0; y < squares; y++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? a : b
      ctx.fillRect(x * cell, y * cell, cell, cell)
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  tex.colorSpace = THREE.SRGBColorSpace
  cache.set(key, tex)
  return tex
}

export function disposeTextures(): void {
  for (const t of cache.values()) t.dispose()
  cache.clear()
}
