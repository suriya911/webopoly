// Board layout, property cards and group metadata for Webopoly.
// Tile index 0 is START (top-left corner of the board art); play moves clockwise.

export type GroupId = 'A' | 'S' | '6' | 'G' | 'V' | 'W'

export interface Group {
  id: GroupId
  name: string
  tagline: string
  color: string
  glow: string
}

export const GROUPS: Record<GroupId, Group> = {
  A: { id: 'A', name: 'Amazing Spiders', tagline: 'The heroes of the web', color: '#ef4444', glow: 'rgba(239,68,68,.55)' },
  S: { id: 'S', name: 'Symbiotes', tagline: 'We are Venom', color: '#f59e0b', glow: 'rgba(245,158,11,.55)' },
  '6': { id: '6', name: 'Sinister Six', tagline: 'Six against one', color: '#3b82f6', glow: 'rgba(59,130,246,.55)' },
  G: { id: 'G', name: 'Sinister Syndicate', tagline: 'Goblin’s rogues gallery', color: '#22c55e', glow: 'rgba(34,197,94,.55)' },
  V: { id: 'V', name: 'Villains Inc.', tagline: 'Clones, crime lords & killers', color: '#a855f7', glow: 'rgba(168,85,247,.55)' },
  W: { id: 'W', name: 'Spider-Verse', tagline: 'Every universe, one web', color: '#06b6d4', glow: 'rgba(6,182,212,.55)' },
}

export interface PropertyCard {
  name: string
  group: GroupId
  price: number
  /** Cost of each building level (house 1, 2, 3, then the HQ/hotel). */
  build: number
  /** Rent: [land, 1H, 2H, 3H, HQ] */
  rent: [number, number, number, number, number]
  /** Lease payout from the bank at each level: [land, 1H, 2H, 3H, HQ] */
  lease: [number, number, number, number, number]
}

export type TileKind =
  | 'start'
  | 'property'
  | 'chance'
  | 'signpost'
  | 'portal'
  | 'tax'
  | 'jail'
  | 'spidersense'
  | 'lease'

export interface Tile {
  index: number
  kind: TileKind
  name: string
  card?: PropertyCard
}

const p = (
  name: string,
  group: GroupId,
  price: number,
  build: number,
  rent: PropertyCard['rent'],
  lease: PropertyCard['lease'],
): PropertyCard => ({ name, group, price, build, rent, lease })

// Values transcribed from CARDS.pdf
const C = {
  sandman: p('Sandman', '6', 13000, 12500, [2000, 4500, 7000, 9500, 13500], [1000, 2500, 4000, 5500, 8000]),
  ironSpider: p('Iron Spider', 'A', 18000, 17000, [3000, 7500, 10000, 13500, 18500], [2000, 3500, 4500, 6000, 7500]),
  antiVenom: p('Anti-Venom', 'S', 12000, 11000, [2000, 4500, 7000, 9500, 12500], [2000, 4000, 4500, 5500, 7000]),
  electro: p('Electro', 'G', 11500, 11000, [2000, 4500, 7000, 9000, 13000], [1000, 2000, 3500, 4500, 6000]),
  spiderMan: p('Spider-Man', 'A', 18000, 17000, [3500, 7500, 9500, 13000, 19000], [2000, 3500, 4500, 6000, 7000]),
  venom: p('Venom', 'S', 16500, 16000, [3500, 7000, 9500, 11500, 17000], [3500, 6500, 8000, 9000, 11000]),
  miles: p('Miles Morales', 'A', 17500, 17000, [3000, 7000, 9000, 12500, 17000], [1500, 3500, 4500, 6000, 6500]),
  lizard: p('Lizard', '6', 12500, 11500, [2000, 4500, 6500, 8500, 12000], [1000, 2000, 3500, 4500, 6000]),
  knull: p('Knull', 'S', 23500, 23000, [5000, 9000, 15000, 19000, 24000], [3500, 7000, 8500, 11000, 12500]),
  spiderWarrior: p('Spider Warrior', 'W', 12000, 11000, [2500, 5000, 7500, 9500, 13000], [1000, 2000, 3500, 5500, 7000]),
  mysterio: p('Mysterio', '6', 17500, 17500, [3500, 7000, 9500, 14000, 18000], [2500, 4000, 5500, 7000, 11000]),
  greenGoblin: p('Green Goblin', 'G', 18000, 17000, [4000, 7000, 10000, 13500, 18000], [2500, 3500, 5000, 6500, 7000]),
  taskmaster: p('Taskmaster', 'V', 16000, 15500, [3000, 5500, 9000, 13000, 16500], [2500, 3500, 5000, 7500, 9000]),
  spiderMan2099: p('Spider-Man 2099', 'W', 17500, 16000, [3500, 7500, 9000, 12500, 17500], [2500, 3500, 5000, 6000, 8000]),
  spiderWoman: p('Spider-Woman', 'W', 12500, 11000, [2000, 4500, 7000, 9000, 13000], [1000, 2000, 3500, 4500, 6000]),
  kraven: p('Kraven', 'G', 12500, 12000, [2000, 5000, 7500, 9500, 13000], [1000, 2000, 3500, 4500, 6000]),
  scarletSpider: p('Scarlet Spider', 'V', 15000, 15500, [3000, 6500, 9000, 13000, 16000], [2000, 3500, 5500, 7500, 9000]),
  agentVenom: p('Agent Venom', 'A', 15000, 9000, [1500, 4000, 6000, 8000, 10000], [1000, 2000, 3000, 4000, 5000]),
  scream: p('Scream', 'S', 13000, 12000, [2000, 5000, 7000, 9000, 13500], [2500, 4500, 5500, 6500, 8000]),
  scorpion: p('Scorpion', '6', 11500, 11000, [2000, 4500, 6000, 8500, 12000], [1000, 2500, 3500, 5000, 6500]),
  spiderHam: p('Spider-Ham', 'W', 10500, 10000, [1500, 4000, 6000, 8500, 11500], [500, 1500, 2500, 3500, 5500]),
  hobgoblin: p('Hobgoblin', 'V', 9000, 8500, [1500, 3500, 6500, 7500, 9500], [1000, 2500, 3000, 4500, 5500]),
  carnage: p('Carnage', 'S', 13500, 13000, [2500, 5000, 7500, 10000, 14000], [2500, 5000, 5500, 6500, 8500]),
  beetle: p('Beetle', 'G', 13000, 12500, [2000, 5000, 7500, 9000, 13500], [1000, 2500, 3000, 4500, 6000]),
  docOck: p('Doctor Octopus', '6', 16500, 16000, [3000, 7500, 9000, 13000, 18000], [2500, 4000, 5500, 7000, 9000]),
  vulture: p('Vulture', 'G', 8500, 8000, [1500, 4000, 6000, 8000, 10000], [1000, 2000, 3000, 3500, 4000]),
  spiderGwen: p('Spider-Gwen', 'A', 12500, 11000, [2000, 4500, 7000, 9500, 13500], [1000, 1500, 3000, 4500, 6500]),
  jackal: p('Jackal', 'V', 8500, 8000, [1500, 3000, 4500, 6000, 9500], [1000, 1500, 2500, 3500, 4500]),
  kingpin: p('Kingpin', 'V', 13000, 12000, [2000, 4500, 7000, 9500, 14500], [2500, 4500, 5500, 6000, 8000]),
  spiderNoir: p('Spider Noir', 'W', 13500, 13000, [2500, 5000, 7500, 9500, 14000], [1000, 2500, 3500, 4500, 6500]),
}

const prop = (index: number, card: PropertyCard): Tile => ({ index, kind: 'property', name: card.name, card })

export const TILES: Tile[] = [
  { index: 0, kind: 'start', name: 'START' },
  prop(1, C.sandman),
  prop(2, C.ironSpider),
  prop(3, C.antiVenom),
  prop(4, C.electro),
  { index: 5, kind: 'chance', name: 'Spider-Sense ?' },
  prop(6, C.spiderMan),
  prop(7, C.venom),
  prop(8, C.miles),
  prop(9, C.lizard),
  { index: 10, kind: 'spidersense', name: 'Spider-Sense Stash' },
  prop(11, C.knull),
  { index: 12, kind: 'signpost', name: 'This Way / That Way' },
  prop(13, C.spiderWarrior),
  prop(14, C.mysterio),
  { index: 15, kind: 'portal', name: 'Multiverse Portal' },
  prop(16, C.greenGoblin),
  prop(17, C.taskmaster),
  prop(18, C.spiderMan2099),
  prop(19, C.spiderWoman),
  { index: 20, kind: 'jail', name: 'The Raft (Jail)' },
  prop(21, C.kraven),
  { index: 22, kind: 'chance', name: 'Spider-Sense ?' },
  prop(23, C.scarletSpider),
  prop(24, C.agentVenom),
  { index: 25, kind: 'tax', name: 'City Tax' },
  prop(26, C.scream),
  prop(27, C.scorpion),
  prop(28, C.spiderHam),
  prop(29, C.hobgoblin),
  { index: 30, kind: 'lease', name: 'Lease Office' },
  prop(31, C.carnage),
  prop(32, C.beetle),
  prop(33, C.docOck),
  prop(34, C.vulture),
  prop(35, C.spiderGwen),
  { index: 36, kind: 'signpost', name: 'This Way / That Way' },
  prop(37, C.jackal),
  prop(38, C.kingpin),
  prop(39, C.spiderNoir),
]

export const BOARD_SIZE = TILES.length
export const JAIL_INDEX = 20
export const PORTAL_INDEX = 15
export const SIGNPOSTS = [12, 36]

export const PROPERTY_INDEXES = TILES.filter((t) => t.kind === 'property').map((t) => t.index)

export function groupMembers(group: GroupId): number[] {
  return TILES.filter((t) => t.card?.group === group).map((t) => t.index)
}

export const LEVEL_LABELS = ['Land', '1 House', '2 Houses', '3 Houses', 'Web HQ'] as const

export const AVATARS = [
  { id: 'spiderman', name: 'Spider-Man', color: '#ef4444' },
  { id: 'miles', name: 'Miles', color: '#f43f5e' },
  { id: 'venom', name: 'Venom', color: '#e5e7eb' },
  { id: 'iron', name: 'Iron Spider', color: '#f59e0b' },
  { id: 'ham', name: 'Spider-Ham', color: '#ec4899' },
  { id: 'scarlet', name: 'Scarlet', color: '#3b82f6' },
  { id: 'agent', name: 'Agent Venom', color: '#22c55e' },
  { id: '2099', name: '2099', color: '#06b6d4' },
] as const

export type AvatarId = (typeof AVATARS)[number]['id']

export function avatarInfo(id: string) {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0]
}
