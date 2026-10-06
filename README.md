# 🏁 Apex Nitro

A complete 3D arcade racing game built with **React Three Fiber**. Eight supercars,
five circuits, a full upgrade path and a career that saves itself to your browser.

Everything is generated in code: the car bodies are lofted from parametric
cross-sections, the circuits are built from a radius profile, the scenery is
instanced at runtime and the engine sound is synthesised with the Web Audio API.
There is **not a single downloaded asset**, so there is nothing that can fail to
load and no network dependency at runtime.

```bash
npm install
npm run dev      # http://localhost:5173
```

---

## Gameplay

| Action | Key |
| --- | --- |
| Accelerate | `W` / `↑` |
| Brake & reverse | `S` / `↓` |
| Steer | `A` `D` / `←` `→` |
| Handbrake / drift | `Space` |
| Nitro boost | `Shift` |
| Reset to the track | `R` |
| Pause | `Esc` |
| Camera | Settings → Driving camera |

Gamepads work out of the box (left stick steers, triggers are throttle and
brake). On phones and tablets on-screen controls appear automatically.

You start at the back of a grid of up to seven rivals. Finish in the top three to
fill the podium and win a bigger cheque. Hitting the barriers costs hull
integrity; running out of it wrecks the car, and `R` puts you back on the road.
Finishing a circuit unlocks the next one.

## What is in it

**Eight cars** — from the free Kestrel GT to the 1,500 hp Nebula Prime. Each has
its own mass, power, drag, grip, steering lock and geometry, so a tall rally car
with knobbly tyres really does drive differently from a low, wide hypercar.

**Five circuits** — a harbour sweeper, a fast oval with hairpins, a neon street
circuit, a desert valley and a frozen mountain pass. Every circuit has its own
sky, lighting, ground, barriers and scenery, plus its own lap count, difficulty,
grid size and prize money.

**Upgrades** — engine, tyres, chassis armour, nitrous and weight reduction, five
levels each. Upgrades are global, so they benefit every car you own.

**Wheels** — six sets from stock alloys to carbon track slicks, each changing
grip, power delivery and mass, with the rim style, spoke count, dish and tyre
width rendered from the spec.

**Paint** — fourteen liveries, free and applied instantly.

**A real HUD** — speedometer with a live needle, gear indicator, lap and position
counters, hull and nitro meters, a canvas minimap with every car plotted, a live
standings board, wrong-way and off-track warnings and a damage flash.

**Synthesised audio** — a detuned-oscillator engine whose note tracks RPM and
load, plus induction noise, tyre squeal, wind and impact sounds. No files.

## Project layout

```
src/
  game/            pure logic, no rendering
    types.ts         shared types and the coordinate conventions
    cars.ts          the eight cars: physics + geometry parameters
    wheels.ts        wheel catalogue
    upgrades.ts      upgrade tracks and the cost curve
    tracks.ts        the five circuits and their themes
    curve.ts         track spline, nearest-point and lateral queries
    vehicle.ts       the arcade physics step, grid placement, lap timing
    ai.ts            opponents, corner-speed model, lane changes
    tuning.ts        combines car + wheels + upgrades into final numbers
    store.ts         zustand store with localStorage persistence
    input.ts         keyboard, gamepad and touch input
    audio.ts         the Web Audio engine
    telemetry.ts     the frame-by-frame HUD bridge
  three/
    carGeometry.ts   lofted body/canopy/roof geometry from a CarShape
    CarModel.tsx     assembles a full car (aero, lights, wheels, flames)
    WheelModel.tsx   procedural wheel with several rim styles
    trackMesh.ts     ribbon and wall lofting helpers
    RaceTrack.tsx    road, kerbs, barriers, gantry and themed scenery
    RaceScene.tsx    environment, camera, game loop, physics, AI, ranking
    textures.ts      procedural asphalt, ground and chequer textures
  ui/              menu, garage, circuit select, HUD, results, settings, help
  screens/Race.tsx the race screen: canvas + HUD + pause + results
scripts/           headless development tools (see below)
```

### How a car is built

`buildCarGeometries` lofts three closed, smooth-shaded shells along the car's
length: the painted body, the glass canopy and a painted roof panel that is
deliberately narrower than the glass, so it emerges through the top of the
canopy and leaves the windows visible. Keyframes control the floor line, the
silhouette from tail to nose, and the tumblehome. Changing numbers in
`cars.ts` genuinely changes the shape — nothing is a texture swap.

### Driving model

Local-frame arcade physics in `vehicle.ts`: a torque curve with speed falloff,
quadratic aero drag calibrated so every car reaches its quoted top speed, a grip
limit that clamps the yaw rate, and slip-based drifting. Steering authority falls
off with speed, so the car is agile in the pits and grip-limited in a fast
corner. It is the single place driving feel is defined.

## Development tools

All of these run headlessly and need no browser except the last one.

```bash
npm run typecheck   # TypeScript, no emit
npm run smoke       # 200+ assertions: geometry, tracks, physics, AI, economy
npm run balance     # lap-time, race-length and prize-money report
npm run startline   # picks the rotation that puts a start line on a straight
npm run e2e         # drives the real game in headless Chrome (dev server must be up)
```

`npm run smoke` is the important one. It builds every car and circuit, drives a
car around every circuit with a deterministic test driver, checks that nothing
ever becomes `NaN`, that the car cannot tunnel through a barrier, that the AI
completes multiple laps without leaving the track, and that the economy is
monotonic. It caught a genuine bug during development: the first animation frame
a browser delivers has a delta of zero, which divided by zero inside the physics
step and turned the whole car state into `NaN`. There is now a regression test
for it.

`npm run e2e` launches headless Chrome, connects over the DevTools Protocol using
Node's built-in WebSocket, holds down the accelerator and asserts that the car
accelerates, gears change, laps count and no console errors appear. It also walks
every screen. Add `E2E_SECONDS=120` to drive for longer.

Progress is saved to `localStorage` under `apex-nitro-save`. Settings has a reset
button, and a runtime error anywhere in the UI shows a recovery screen instead of
a blank page.

Handy deep links: `#race/neon`, `#garage`, `#levels`, `#settings`, `#howto`.

## Build

```bash
npm run build     # typechecks, then bundles to dist/
npm run preview   # serve the production build
```

The build is a static site — `dist/` can be dropped on any host.
