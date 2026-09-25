export interface Settings {
  startingCash: number
  salary: number
  /** Seconds per decision; 0 disables the turn timer. */
  turnSeconds: number
  /** Minutes before the game ends and the richest player wins; 0 = play to the last one standing. */
  timeLimitMinutes: number
  /** Taxes and fines go into a pot collected on the Spider-Sense Stash corner. */
  stashPot: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  startingCash: 100_000,
  salary: 10_000,
  turnSeconds: 90,
  timeLimitMinutes: 0,
  stashPot: true,
}

export interface Player {
  id: string
  name: string
  avatar: string
  cash: number
  pos: number
  inJail: boolean
  jailTurns: number
  jailCards: number
  bankrupt: boolean
  connected: boolean
  ready: boolean
}

export interface Holding {
  owner: string | null
  /** 0 = land only, 1-3 houses, 4 = Web HQ */
  level: number
  leased: boolean
}

export type Phase = 'roll' | 'jail' | 'buy' | 'signpost' | 'portal' | 'manage' | 'debt'

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
  cardId: string
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

export interface Debt {
  amount: number
  /** Creditor player id; null means the bank (or the stash pot when toPot is set). */
  to: string | null
  toPot?: boolean
  /** When set, the amount is shared equally between these players. */
  split?: string[]
  reason: string
}

export interface GameState {
  code: string
  status: 'lobby' | 'playing' | 'finished'
  hostId: string
  settings: Settings
  players: Player[]
  turn: number
  current: string | null
  phase: Phase
  dice: [number, number]
  rollSeq: number
  doubles: number
  canRollAgain: boolean
  holdings: Record<number, Holding>
  pot: number
  debt: Debt | null
  freeUnlease: boolean
  log: LogEntry[]
  lastCard: CardEvent | null
  moves: MoveEvent[]
  money: MoneyEvent[]
  trades: TradeOffer[]
  deadline: number | null
  startedAt: number | null
  endsAt: number | null
  winner: string | null
  ranking: { id: string; worth: number }[] | null
}

export type GameAction =
  | { type: 'roll' }
  | { type: 'buy' }
  | { type: 'pass' }
  | { type: 'signpost'; choice: 'this' | 'that' | 'another' }
  | { type: 'portal'; target: number | null }
  | { type: 'payBail' }
  | { type: 'useJailCard' }
  | { type: 'build'; tile: number }
  | { type: 'lease'; tile: number }
  | { type: 'unlease'; tile: number }
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
