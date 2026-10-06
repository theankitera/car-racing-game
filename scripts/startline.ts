/**
 * Development helper: the start/finish line sits on control point 0, so the
 * array order decides where the grid is. This prints how straight every
 * possible rotation is, and the tightest corner of the resulting circuit.
 */
import { buildTrackCurve } from '../src/game/curve'
import { TRACKS } from '../src/game/tracks'

for (const spec of TRACKS) {
  const n = spec.points.length
  let bestK = 0
  let bestScore = -Infinity
  const rows: string[] = []

  for (let k = 0; k < n; k++) {
    const rotated = [...spec.points.slice(k), ...spec.points.slice(0, k)]
    const curve = buildTrackCurve({ ...spec, points: rotated })
    const startRadius = 1 / Math.max(curve.curvature[0], 1e-6)
    let minRadius = Infinity
    for (let i = 0; i < curve.count; i++) {
      minRadius = Math.min(minRadius, 1 / Math.max(curve.curvature[i], 1e-6))
    }
    // Straight start, but also make sure the whole lap stays drivable.
    const score = Math.min(startRadius, 240) + Math.min(minRadius, 60) * 0.5
    if (score > bestScore) {
      bestScore = score
      bestK = k
    }
    rows.push(`k=${String(k).padStart(2)} start=${startRadius.toFixed(0).padStart(4)}m min=${minRadius.toFixed(0).padStart(4)}m`)
  }

  const step = (Math.PI * 2) / n
  console.log(`\n${spec.id}  (${n} points, step ${step.toFixed(4)} rad)`)
  console.log('  ' + rows.join('\n  '))
  console.log(
    `  => best rotation k=${bestK}, rot offset ${(-bestK * step).toFixed(4)} from current`,
  )
}
