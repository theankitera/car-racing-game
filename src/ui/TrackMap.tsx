import { useMemo } from 'react'
import { getCachedCurve } from '../game/curve'
import { getTrack } from '../game/tracks'

interface Props {
  trackId: string
  size?: number
  color?: string
  accent?: string
  /** Highlights a partial lap, 0..1. */
  progress?: number
  marker?: { x: number; z: number } | null
}

/** Normalised SVG outline of a circuit, used across every menu screen. */
export function TrackMap({ trackId, size = 150, color, accent, progress, marker }: Props) {
  const curve = useMemo(() => getCachedCurve(getTrack(trackId)), [trackId])
  const theme = curve.spec.theme
  const stroke = color ?? theme.edge
  const hot = accent ?? theme.barrierTop

  const { path, project } = useMemo(() => {
    let maxR = 1
    for (const s of curve.samples) maxR = Math.max(maxR, Math.abs(s.x), Math.abs(s.z))
    const pad = 10
    const scale = (size / 2 - pad) / maxR
    const project = (x: number, z: number) => ({
      px: size / 2 + x * scale,
      py: size / 2 + z * scale,
    })
    const path =
      curve.samples
        .map((s, i) => {
          const p = project(s.x, s.z)
          return `${i === 0 ? 'M' : 'L'}${p.px.toFixed(1)},${p.py.toFixed(1)}`
        })
        .join(' ') + ' Z'
    return { path, project }
  }, [curve, size])

  const markerPos = marker ? project(marker.x, marker.z) : null

  return (
    <svg width="100%" height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Circuit map">
      <path d={path} fill="none" stroke={stroke} strokeWidth={8} strokeLinejoin="round" opacity={0.16} />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={2.6}
        strokeLinejoin="round"
        opacity={0.75}
      />
      <circle
        cx={project(curve.samples[0].x, curve.samples[0].z).px}
        cy={project(curve.samples[0].x, curve.samples[0].z).py}
        r={4}
        fill={hot}
      />
      {typeof progress === 'number' && (
        <circle
          cx={project(
            curve.samples[Math.floor(progress * curve.count) % curve.count].x,
            curve.samples[Math.floor(progress * curve.count) % curve.count].z,
          ).px}
          cy={project(
            curve.samples[Math.floor(progress * curve.count) % curve.count].x,
            curve.samples[Math.floor(progress * curve.count) % curve.count].z,
          ).py}
          r={4.5}
          fill="none"
          stroke={hot}
          strokeWidth={2}
        />
      )}
      {markerPos && <circle cx={markerPos.px} cy={markerPos.py} r={5} fill="#ffffff" />}
    </svg>
  )
}
