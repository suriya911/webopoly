export interface Settings {
  startingCash: number
  /** START reward for every lap (crossing or landing). Ultimate START owners get double. */
  salary: number
  /** Seconds per decision; 0 disables the turn timer. */
  turnSeconds: number
  /** Minutes before the game ends and the richest player wins; 0 = play to the last one standing. */
  timeLimitMinutes: number
}

export const DEFAULT_SETTINGS: Settings = {
  startingCash: 100_000,
  salary: 5_000,
  turnSeconds: 90,
  timeLimitMinutes: 0,
}

/** Power cards a player holds (counts). */
export interface Items {
  startCard: number
  ultimateStartCard: number
  jailCard: number
  taxCardFree: number
  taxHouseFree: number
  sinister: number
  web: number
  symbiote: number
}

export const EMPTY_ITEMS: Items = {
  startCard: 0,
  ultimateStartCard: 0,
  jailCard: 0,
  taxCardFree: 0,
  taxHouseFree: 0,
  sinister: 0,
  web: 0,
  symbiote: 0,
}

export interface Effects {
  /** Multiplier on rent this player pays to other players, for their next `rentPayments` payments. */
  rentMult: number
  rentPayments: number
  /** Board tiles of travel left with +2,000 extra set bonus (2 rounds = 80). */
  setBoostTiles: number
  /** Board tiles of travel left with the Sinister Six card active. */
  sinisterTiles: number
  skipStart: boolean
  shopBan: boolean
}

export const NO_EFFECTS: Effects = {
  rentMult: 1,
  rentPayments: 0,
  setBoostTiles: 0,
  sinisterTiles: 0,
  skipStart: false,
  shopBan: false,
}

export interface Player {
  id: string
  name: string
  avatar: string
  cash: number
  pos: number
  inJail: boolean
  /** Turns already spent in jail (released after 5). */
  jailTurns: number
  /** Doublet attempts used in jail (max 3). */
  jailRolls: number
  /** Just released from jail: can't buy or build on the first tile they land on. */
  criminal: boolean
  /** Stuck by a Web card: pays that tile's rent each turn instead of moving. */
  glued: { tile: number; turns: number } | null
  /** After a Spider-Verse jump: moves backward each turn until back on the Spider-Verse spot. */
  reversing: boolean
  ultimateStart: boolean
  items: Items
  effects: Effects
  bankrupt: boolean
  connected: boolean
  ready: boolean
}

export interface Lease {
  lessee: string
  /** null when leased from the bank's unowned pile */
  lessor: string | null
  level: number
  /** Paid every round, i.e. each time the renter comes back round to the Lease spot */
  amount: number
  paymentsLeft: number
  /** False until the renter first reaches the Lease spot (when the lease was agreed elsewhere). */
  started: boolean
}

export interface Holding {
  owner: string | null
  /** 0 = base, 1-3 houses, 4 = hotel */
  level: number
  lease: Lease | null
}

export type Phase =
  | 'offer'
  | 'roll'
  | 'jail'
  | 'buy'
  | 'choose'
  | 'shop'
  | 'spiderverse'
  | 'leaseSpot'
  | 'web'
  | 'manage'
  | 'debt'

export type ChoiceKind = 'surrender' | 'destroyOwn' | 'breakOther' | 'yourPlace' | 'teleport'

export interface Choice {
  kind: ChoiceKind
  tiles: number[]
  prompt: string
  optional: boolean
}

export interface LogEntry {
  id: number
  t: number
  text: string
  kind?: 'money' | 'move' | 'jail' | 'card' | 'build' | 'trade' | 'system' | 'chat'
  player?: string
}

export interface CardEvent {
  seq: number
  playerId: string
  deck: 'chance' | 'uno' | 'random'
  roll: number
  title: string
  text: string
}

export interface MoveEvent {
  seq: number
  playerId: string
  path: number[]
  teleport?: boolean
}

export interface MoneyEvent {
  seq: number
  playerId: string
  delta: number
}

export interface TradeOffer {
  id: string
  from: string
  to: string
  giveProps: number[]
  giveCash: number
  getProps: number[]
  getCash: number
}

export interface LeaseOffer {
  id: string
  from: string
  lessor: string
  lessee: string
  tile: number
}

export interface Debt {
  amount: number
  /** Creditor player id; null means the bank. */
  to: string | null
  /** When set, the amount is shared equally between these players. */
  split?: string[]
  reason: string
}

export type ShopItem =
  | 'startCard'
  | 'ultimateStartCard'
  | 'jailCard'
  | 'ultimateStart'
  | 'taxCardFree'
  | 'taxHouseFree'
  | 'random'
  | 'sinister'
  | 'web'
  | 'symbiote'

export interface GameState {
  code: string
  status: 'lobby' | 'playing' | 'finished'
  hostId: string
  settings: Settings
  players: Player[]
  turn: number
  current: string | null
  phase: Phase
  /** Players who still have to answer the Ultimate START offer at game start */
  offerPending: string[]
  dice: [number, number]
  rollSeq: number
  holdings: Record<number, Holding>
  debt: Debt | null
  choice: Choice | null
  webPrompt: { owner: string; victim: string; tile: number } | null
  /** Tile where a freshly released prisoner may not buy or build this turn */
  criminalTile: number | null
  /** Owned card the current player landed on this turn: one upgrade allowed there. */
  buildTile: number | null
  log: LogEntry[]
  lastCard: CardEvent | null
  moves: MoveEvent[]
  money: MoneyEvent[]
  trades: TradeOffer[]
  leaseOffers: LeaseOffer[]
  deadline: number | null
  startedAt: number | null
  endsAt: number | null
  winner: string | null
  ranking: { id: string; worth: number }[] | null
}

export type GameAction =
  | { type: 'ultimateOffer'; buy: boolean }
  | { type: 'roll' }
  | { type: 'buy' }
  | { type: 'pass' }
  | { type: 'choose'; tile: number | null }
  | { type: 'payBail' }
  | { type: 'useJailCard' }
  | { type: 'stayInJail' }
  | { type: 'build'; tile: number }
  | { type: 'sellProperty'; tile: number }
  | { type: 'shopBuy'; item: ShopItem }
  | { type: 'shopLeave' }
  | { type: 'spiderverse'; go: boolean }
  | { type: 'leaseUnowned'; tile: number; level: number }
  | { type: 'proposeLease'; tile: number; with: string }
  | { type: 'respondLease'; id: string; accept: boolean }
  | { type: 'cancelLease'; id: string }
  | { type: 'leaveLeaseSpot' }
  | { type: 'web'; use: boolean }
  | { type: 'useStartCard'; ultimate: boolean }
  | { type: 'activateSinister' }
  | { type: 'useSymbiote'; target: string; tile: number }
  | { type: 'payDebt' }
  | { type: 'bankrupt' }
  | { type: 'endTurn' }
  | { type: 'proposeTrade'; offer: Omit<TradeOffer, 'id' | 'from'> }
  | { type: 'respondTrade'; id: string; accept: boolean }
  | { type: 'cancelTrade'; id: string }
  | { type: 'forfeit' }

export interface ChatMessage {
  id: string
  from: string
  text: string
  t: number
}

export interface VoicePeerState {
  id: string
  muted: boolean
}

export type Ack<T = unknown> = (res: { ok: true; data?: T } | { ok: false; error: string }) => void
