import type { UpgradeDef, UpgradeKey } from './types'

export const UPGRADES: UpgradeDef[] = [
  {
    key: 'engine',
    name: 'Engine',
    blurb: 'Forged internals, bigger turbos and a remapped ECU.',
    icon: '⚙️',
    baseCost: 2600,
    maxLevel: 5,
    effect: '+9% power and +4% top speed per level',
  },
  {
    key: 'tires',
    name: 'Tyres',
    blurb: 'Softer compound and a suspension geometry that puts it to work.',
    icon: '🛞',
    baseCost: 2200,
    maxLevel: 5,
    effect: '+7% grip per level',
  },
  {
    key: 'armor',
    name: 'Chassis Armour',
    blurb: 'Reinforced crash structures and a stronger roll cage.',
    icon: '🛡️',
    baseCost: 1800,
    maxLevel: 5,
    effect: '+22% hull and -9% damage taken per level',
  },
  {
    key: 'nitro',
    name: 'Nitrous',
    blurb: 'A bigger bottle plus a faster refill valve.',
    icon: '🔥',
    baseCost: 2000,
    maxLevel: 5,
    effect: '+16% nitro capacity and regen per level',
  },
  {
    key: 'chassis',
    name: 'Weight Reduction',
    blurb: 'Carbon panels, stripped interior, lexan glass.',
    icon: '🪶',
    baseCost: 2400,
    maxLevel: 5,
    effect: '-4.5% mass and +4% steering per level',
  },
]

export const UPGRADE_MAP: Record<UpgradeKey, UpgradeDef> = UPGRADES.reduce(
  (acc, u) => {
    acc[u.key] = u
    return acc
  },
  {} as Record<UpgradeKey, UpgradeDef>,
)

export const UPGRADE_KEYS: UpgradeKey[] = UPGRADES.map((u) => u.key)

/** Cost to go from `level` to `level + 1`. */
export function upgradeCost(key: UpgradeKey, level: number): number {
  const def = UPGRADE_MAP[key]
  if (!def) return Infinity
  if (level >= def.maxLevel) return Infinity
  return Math.round(def.baseCost * (1 + level * 0.75))
}

export function emptyUpgrades(): Record<UpgradeKey, number> {
  return { engine: 0, tires: 0, armor: 0, nitro: 0, chassis: 0 }
}
