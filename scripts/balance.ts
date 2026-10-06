/**
 * Development helper: prints a balance report so race lengths, pacing and the
 * prize economy can be judged at a glance. Run with `npm run balance`.
 */
import { CARS, getCar } from '../src/game/cars'
import { TRACKS } from '../src/game/tracks'
import { computeReward } from '../src/game/tuning'
import { UPGRADES, upgradeCost } from '../src/game/upgrades'
import { formatLap, formatCoins } from '../src/game/utils'
import { runLaps } from './autopilot'

console.log('\nCIRCUIT PACING (test driver, stock tyres)')
console.log(
  'track'.padEnd(14) +
    'len'.padStart(7) +
    'laps'.padStart(6) +
    'starter lap'.padStart(13) +
    'starter race'.padStart(14) +
    'top car lap'.padStart(13) +
    'top car race'.padStart(14),
)

for (const track of TRACKS) {
  const slow = runLaps(track.id, 'kestrel', { seconds: track.laps * 45 + 45 })
  const fast = runLaps(track.id, 'nebula', { seconds: track.laps * 45 + 45 })
  const starterLap = slow.lapTimes.length ? slow.lapTimes[slow.lapTimes.length - 1] : NaN
  const fastLap = fast.lapTimes.length ? fast.lapTimes[fast.lapTimes.length - 1] : NaN
  console.log(
    track.id.padEnd(14) +
      `${slow.curve.length.toFixed(0)}m`.padStart(7) +
      String(track.laps).padStart(6) +
      formatLap(starterLap).padStart(13) +
      formatLap(starterLap * track.laps).padStart(14) +
      formatLap(fastLap).padStart(13) +
      formatLap(fastLap * track.laps).padStart(14),
  )
  if (slow.offRoadPct > 4 || fast.offRoadPct > 4) {
    console.log(
      `  !! off-track: starter ${slow.offRoadPct.toFixed(1)}%, top car ${fast.offRoadPct.toFixed(1)}%`,
    )
  }
}

console.log('\nECONOMY (payout for a win, and races needed to afford each car)')
const avgWin = TRACKS.reduce((sum, t) => sum + computeReward(t, 1, t.laps, true), 0) / TRACKS.length
console.log(`  average win purse: ${formatCoins(avgWin)} coins`)
for (const car of CARS) {
  if (car.price === 0) continue
  const best = TRACKS.reduce(
    (max, t) => Math.max(max, computeReward(t, 1, t.laps, true)),
    0,
  )
  console.log(
    `  ${car.name.padEnd(16)} ${formatCoins(car.price).padStart(9)} coins  ` +
      `≈${(car.price / best).toFixed(1)} wins on the richest circuit`,
  )
}

console.log('\nUPGRADE COST TO MAX')
let total = 0
for (const def of UPGRADES) {
  let cost = 0
  for (let level = 0; level < def.maxLevel; level++) cost += upgradeCost(def.key, level)
  total += cost
  console.log(`  ${def.name.padEnd(18)} ${formatCoins(cost).padStart(9)} coins`)
}
console.log(`  ${'TOTAL'.padEnd(18)} ${formatCoins(total).padStart(9)} coins`)

console.log('\nAI PACE CHECK (starter car, difficulty 5 circuit)')
const aiRef = runLaps('alpine', 'kestrel', { seconds: 120 })
console.log(`  test driver best lap: ${formatLap(aiRef.vehicle.bestLap)}`)
console.log(`  top speed reached:    ${(aiRef.topSpeed * 3.6).toFixed(0)} km/h`)
console.log(`  starter car rated:    ${getCar('kestrel').maxSpeed > 0 ? Math.round(getCar('kestrel').maxSpeed * 3.6) : 0} km/h`)
console.log('')
