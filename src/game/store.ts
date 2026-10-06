import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CARS, STARTER_CAR, getCar } from './cars'
import { TRACKS, trackIndex } from './tracks'
import { STARTER_WHEEL, WHEELS, getWheel } from './wheels'
import { UPGRADE_KEYS, UPGRADE_MAP, emptyUpgrades, upgradeCost } from './upgrades'
import type { RaceResult, SaveData, Settings, TrackRecord, UpgradeKey } from './types'

export const SAVE_VERSION = 1
export const STARTING_COINS = 3000

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const defaultSettings: Settings = {
  quality: 'high',
  sound: true,
  volume: 0.55,
  // Honour the OS-level motion preference out of the box; the toggle in
  // Settings still overrides it either way.
  shake: !prefersReducedMotion,
  units: 'kmh',
  camera: 'chase',
}

const emptyRecord = (): TrackRecord => ({
  finished: false,
  bestPosition: 0,
  bestTime: null,
  bestLap: null,
  wins: 0,
})

export function createDefaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    coins: STARTING_COINS,
    ownedCars: [STARTER_CAR],
    ownedWheels: [STARTER_WHEEL],
    equippedCar: STARTER_CAR,
    equippedWheel: STARTER_WHEEL,
    paint: getCar(STARTER_CAR).paint,
    upgrades: emptyUpgrades(),
    records: {},
    settings: { ...defaultSettings },
    totalRaces: 0,
    totalWins: 0,
    totalDistance: 0,
    unlockedTracks: [TRACKS[0].id],
  }
}

export type Screen = 'menu' | 'garage' | 'levels' | 'race' | 'settings' | 'howto'

const num = (v: unknown, fallback: number, min = 0): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n >= min ? n : fallback
}

/**
 * Repairs a loaded save. The file lives in localStorage, so it can be stale,
 * truncated, hand-edited or simply written by an older build; without this a
 * tampered `upgrades` level becomes a permanently overpowered car and a bad
 * `equippedCar` silently falls back to the starter with the wrong paint.
 */
export function sanitizeSave(raw: Partial<SaveData>): SaveData {
  const base = createDefaultSave()

  const knownCars = new Set(CARS.map((c) => c.id))
  const knownWheels = new Set(WHEELS.map((w) => w.id))
  const knownTracks = new Set(TRACKS.map((t) => t.id))

  const ownedCars = Array.isArray(raw.ownedCars)
    ? raw.ownedCars.filter((id): id is string => typeof id === 'string' && knownCars.has(id))
    : []
  if (!ownedCars.includes(STARTER_CAR)) ownedCars.unshift(STARTER_CAR)

  const ownedWheels = Array.isArray(raw.ownedWheels)
    ? raw.ownedWheels.filter((id): id is string => typeof id === 'string' && knownWheels.has(id))
    : []
  if (!ownedWheels.includes(STARTER_WHEEL)) ownedWheels.unshift(STARTER_WHEEL)

  const upgrades = emptyUpgrades()
  for (const key of UPGRADE_KEYS) {
    const max = UPGRADE_MAP[key].maxLevel
    const level = num((raw.upgrades as Record<string, unknown> | undefined)?.[key], 0)
    upgrades[key] = Math.min(max, Math.max(0, Math.floor(level)))
  }

  const records: Record<string, TrackRecord> = {}
  if (raw.records && typeof raw.records === 'object') {
    for (const [id, rec] of Object.entries(raw.records)) {
      if (!knownTracks.has(id) || !rec || typeof rec !== 'object') continue
      records[id] = {
        finished: rec.finished === true,
        bestPosition: Math.floor(num(rec.bestPosition, 0)),
        bestTime: typeof rec.bestTime === 'number' && rec.bestTime > 0 ? rec.bestTime : null,
        bestLap: typeof rec.bestLap === 'number' && rec.bestLap > 0 ? rec.bestLap : null,
        wins: Math.floor(num(rec.wins, 0)),
      }
    }
  }

  const unlocked = Array.isArray(raw.unlockedTracks)
    ? raw.unlockedTracks.filter((id): id is string => typeof id === 'string' && knownTracks.has(id))
    : []
  if (!unlocked.includes(TRACKS[0].id)) unlocked.unshift(TRACKS[0].id)

  const s = (raw.settings ?? {}) as Partial<Settings>
  const settings: Settings = {
    quality: s.quality === 'low' || s.quality === 'medium' ? s.quality : 'high',
    sound: typeof s.sound === 'boolean' ? s.sound : base.settings.sound,
    volume: Math.min(1, Math.max(0, num(s.volume, base.settings.volume))),
    shake: typeof s.shake === 'boolean' ? s.shake : base.settings.shake,
    units: s.units === 'mph' ? 'mph' : 'kmh',
    camera: s.camera === 'close' || s.camera === 'hood' ? s.camera : 'chase',
  }

  const equippedCar =
    typeof raw.equippedCar === 'string' && ownedCars.includes(raw.equippedCar)
      ? raw.equippedCar
      : STARTER_CAR
  const equippedWheel =
    typeof raw.equippedWheel === 'string' && ownedWheels.includes(raw.equippedWheel)
      ? raw.equippedWheel
      : STARTER_WHEEL

  return {
    version: SAVE_VERSION,
    coins: Math.floor(num(raw.coins, base.coins)),
    ownedCars,
    ownedWheels,
    equippedCar,
    equippedWheel,
    paint: typeof raw.paint === 'string' && raw.paint.length <= 32 ? raw.paint : getCar(equippedCar).paint,
    upgrades,
    records,
    settings,
    totalRaces: Math.floor(num(raw.totalRaces, 0)),
    totalWins: Math.floor(num(raw.totalWins, 0)),
    totalDistance: num(raw.totalDistance, 0),
    unlockedTracks: unlocked,
  }
}

interface GameStore extends SaveData {
  /** Non-persisted navigation state. */
  screen: Screen
  lastResult: RaceResult | null
  activeTrack: string

  setScreen: (s: Screen) => void
  startRace: (trackId: string) => void
  setLastResult: (r: RaceResult | null) => void

  addCoins: (n: number) => void
  buyCar: (id: string) => boolean
  equipCar: (id: string) => void
  buyWheel: (id: string) => boolean
  equipWheel: (id: string) => void
  setPaint: (color: string) => void
  buyUpgrade: (key: UpgradeKey) => boolean
  upgradeCostFor: (key: UpgradeKey) => number

  finishRace: (trackId: string, result: Omit<RaceResult, 'coins' | 'newRecord'> & { coins: number }) => RaceResult
  isTrackUnlocked: (id: string) => boolean
  unlockTrack: (id: string) => void

  updateSettings: (patch: Partial<Settings>) => void
  resetProgress: () => void
}

export const useGame = create<GameStore>()(
  persist(
    (set, get) => ({
      ...createDefaultSave(),

      screen: 'menu',
      lastResult: null,
      activeTrack: TRACKS[0].id,

      setScreen: (s) => set({ screen: s }),

      startRace: (trackId) => set({ activeTrack: trackId, screen: 'race' }),

      setLastResult: (r) => set({ lastResult: r }),

      addCoins: (n) => set((s) => ({ coins: Math.max(0, s.coins + n) })),

      buyCar: (id) => {
        const state = get()
        const car = getCar(id)
        if (state.ownedCars.includes(id)) return false
        if (state.coins < car.price) return false
        set({
          coins: state.coins - car.price,
          ownedCars: [...state.ownedCars, id],
          equippedCar: id,
          equippedWheel: state.equippedWheel,
          paint: car.paint,
        })
        return true
      },

      equipCar: (id) => {
        const state = get()
        if (!state.ownedCars.includes(id)) return
        set({ equippedCar: id, paint: getCar(id).paint })
      },

      buyWheel: (id) => {
        const state = get()
        const wheel = getWheel(id)
        if (state.ownedWheels.includes(id)) return false
        if (state.coins < wheel.price) return false
        set({
          coins: state.coins - wheel.price,
          ownedWheels: [...state.ownedWheels, id],
          equippedWheel: id,
        })
        return true
      },

      equipWheel: (id) => {
        if (!get().ownedWheels.includes(id)) return
        set({ equippedWheel: id })
      },

      setPaint: (color) => set({ paint: color }),

      upgradeCostFor: (key) => upgradeCost(key, get().upgrades[key] ?? 0),

      buyUpgrade: (key) => {
        const state = get()
        const level = state.upgrades[key] ?? 0
        const cost = upgradeCost(key, level)
        if (!isFinite(cost) || state.coins < cost) return false
        set({
          coins: state.coins - cost,
          upgrades: { ...state.upgrades, [key]: level + 1 },
        })
        return true
      },

      finishRace: (trackId, result) => {
        const state = get()
        const idx = trackIndex(trackId)
        const prev = state.records[trackId] ?? emptyRecord()

        const newRecord =
          result.finished &&
          (prev.bestTime === null || (result.totalTime > 0 && result.totalTime < prev.bestTime))

        const record: TrackRecord = {
          finished: prev.finished || result.finished,
          bestPosition:
            prev.bestPosition === 0
              ? result.position
              : Math.min(prev.bestPosition, result.position),
          bestTime: newRecord ? result.totalTime : prev.bestTime,
          bestLap:
            result.bestLap > 0 && (prev.bestLap === null || result.bestLap < prev.bestLap)
              ? result.bestLap
              : prev.bestLap,
          wins: prev.wins + (result.finished && result.position === 1 ? 1 : 0),
        }

        const unlocked = new Set(state.unlockedTracks)
        if (result.finished && idx + 1 < TRACKS.length) unlocked.add(TRACKS[idx + 1].id)

        const full: RaceResult = { ...result, newRecord }

        set({
          coins: state.coins + result.coins,
          records: { ...state.records, [trackId]: record },
          unlockedTracks: Array.from(unlocked),
          totalRaces: state.totalRaces + 1,
          totalWins: state.totalWins + (result.finished && result.position === 1 ? 1 : 0),
          totalDistance: state.totalDistance + result.distance,
          lastResult: full,
        })

        return full
      },

      isTrackUnlocked: (id) => get().unlockedTracks.includes(id),

      unlockTrack: (id) =>
        set((s) => ({
          unlockedTracks: s.unlockedTracks.includes(id)
            ? s.unlockedTracks
            : [...s.unlockedTracks, id],
        })),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      resetProgress: () => set({ ...createDefaultSave(), screen: 'menu', lastResult: null }),
    }),
    {
      name: 'apex-nitro-save',
      version: SAVE_VERSION,
      storage: {
        getItem: (name) => {
          try {
            const raw = localStorage.getItem(name)
            return raw ? JSON.parse(raw) : null
          } catch {
            return null
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value))
          } catch {
            /* storage full or blocked — the game still works in memory */
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name)
          } catch {
            /* ignore */
          }
        },
      },
      partialize: (state) => ({
        version: state.version,
        coins: state.coins,
        ownedCars: state.ownedCars,
        ownedWheels: state.ownedWheels,
        equippedCar: state.equippedCar,
        equippedWheel: state.equippedWheel,
        paint: state.paint,
        upgrades: state.upgrades,
        records: state.records,
        settings: state.settings,
        totalRaces: state.totalRaces,
        totalWins: state.totalWins,
        totalDistance: state.totalDistance,
        unlockedTracks: state.unlockedTracks,
      }) as unknown as GameStore,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SaveData>
        return { ...current, ...sanitizeSave(p) } as GameStore
      },
    },
  ),
)
