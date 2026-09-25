import { GROUPS, TILES, groupMembers, type GroupId } from './board.ts'
import type { GameState, Holding, Player } from './types.ts'

export const MAX_LEVEL = 4
export const STARTING_CASH_MIN = 50_000
export const STARTING_CASH_MAX = 300_000
export const STARTING_CASH_STEP = 10_000

export const ULTIMATE_START_REWARD = 10_000
export const JAIL_BAIL = 20_000
export const JAIL_MAX_TURNS = 5
export const JAIL_DOUBLET_TRIES = 3
export const SPIDERVERSE_FEE = 15_000
export const SET_BONUS = 2_000
export const SET_BONUS_MIN_CARDS = 3
export const SINISTER_BONUS = 2_000
export const ROUND_TILES = 40
export const LEASE_ROUNDS = 3
export const WEB_GLUE_TURNS = 3
export const TAX_PER_CARD = 1_000
export const TAX_PER_HOUSE = 500
export const TAX_PER_HOTEL = 1_000

export const roundTo100 = (n: number) => Math.round(n / 100) * 100

export function holding(state: GameState, tile: number): Holding {
  return state.holdings[tile] ?? { owner: null, level: 0, lease: null }
}

export function findPlayer(state: GameState, id: string | null | undefined): Player | undefined {
  return id ? state.players.find((p) => p.id === id) : undefined
}

export function ownedInGroup(state: GameState, playerId: string, group: GroupId): number {
  return groupMembers(group).filter((i) => holding(state, i).owner === playerId).length
}

/** Who receives rent for a tile: the lessee while leased, otherwise the owner. */
export function rentCollector(state: GameState, tile: number): string | null {
  const h = holding(state, tile)
  return h.lease ? h.lease.lessee : h.owner
}

/** The level rent is charged at (unowned leases carry their own level). */
export function effectiveLevel(state: GameState, tile: number): number {
  const h = holding(state, tile)
  return h.lease && !h.owner ? h.lease.level : h.level
}

export function hasSetBonus(state: GameState, tile: number): boolean {
  const card = TILES[tile].card
  const h = holding(state, tile)
  if (!card || !h.owner || h.lease) return false
  return ownedInGroup(state, h.owner, card.group) >= SET_BONUS_MIN_CARDS
}

/** Rent before the payer's personal modifiers. 0 when nobody collects or the collector is in jail. */
export function baseRent(state: GameState, tile: number): number {
  const card = TILES[tile].card
  const collectorId = rentCollector(state, tile)
  const collector = findPlayer(state, collectorId)
  if (!card || !collector || collector.bankrupt || collector.inJail) return 0
  let rent = card.rent[effectiveLevel(state, tile)]
  if (hasSetBonus(state, tile)) rent += SET_BONUS + (collector.effects.setBoostTiles > 0 ? SET_BONUS : 0)
  if (collector.effects.sinisterTiles > 0 && GROUPS[card.group].symbol === '6') rent += SINISTER_BONUS
  return rent
}

/** Half / 1.5x / double rent cards apply to the player's next rent payments to other players. */
export function payerMultiplier(payer: Player): number {
  const e = payer.effects
  return e.rentPayments > 0 ? e.rentMult : 1
}

export function rentFor(state: GameState, tile: number, payerId?: string): number {
  const payer = findPlayer(state, payerId)
  const rent = baseRent(state, tile)
  return payer ? roundTo100(rent * payerMultiplier(payer)) : rent
}

export function buildCost(tile: number): number {
  return TILES[tile].card?.build ?? 0
}

export function leaseAmount(tile: number, level: number): number {
  return TILES[tile].card?.lease[level] ?? 0
}

export function buildBlocker(state: GameState, playerId: string, tile: number): string | null {
  const card = TILES[tile].card
  if (!card) return 'Not a property'
  const h = holding(state, tile)
  if (h.owner !== playerId) return 'You do not own this'
  if (h.lease) return 'Leased properties cannot be built on'
  if (h.level >= MAX_LEVEL) return 'Already a hotel'
  if (state.criminalTile === tile && state.current === playerId) return 'Criminal card: you cannot build here this turn'
  const player = findPlayer(state, playerId)
  if (!player) return 'Player not found'
  if (state.current !== playerId || state.buildTile !== tile)
    return 'Build only when you land on your own card: one upgrade per visit'
  if (player.cash < buildCost(tile)) return 'Not enough coins'
  return null
}

export function propertyValue(state: GameState, tile: number): number {
  const card = TILES[tile].card
  if (!card) return 0
  return card.price + holding(state, tile).level * card.build
}

/** Selling a card back to the bank (only to pay a debt) refunds the card price plus everything spent building on it. */
export function sellPropertyValue(state: GameState, tile: number): number {
  return propertyValue(state, tile)
}

/** Backward steps from a tile to the Spider-Verse spot. */
export function stepsBackTo(from: number, target: number): number {
  return (from - target + 40) % 40
}

export function propertiesOf(state: GameState, playerId: string): number[] {
  return Object.entries(state.holdings)
    .filter(([, h]) => h.owner === playerId)
    .map(([i]) => Number(i))
    .sort((a, b) => a - b)
}

/** Properties a player is renting from someone else (or from the bank). */
export function leasedBy(state: GameState, playerId: string): number[] {
  return Object.entries(state.holdings)
    .filter(([, h]) => h.lease?.lessee === playerId)
    .map(([i]) => Number(i))
    .sort((a, b) => a - b)
}

export function netWorth(state: GameState, playerId: string): number {
  const player = findPlayer(state, playerId)
  if (!player || player.bankrupt) return 0
  return propertiesOf(state, playerId).reduce((sum, i) => sum + propertyValue(state, i), player.cash)
}

/** Coins a player could still raise by selling everything back to the bank. */
export function liquidity(state: GameState, playerId: string): number {
  return propertiesOf(state, playerId)
    .filter((i) => !holding(state, i).lease)
    .reduce((sum, i) => sum + sellPropertyValue(state, i), 0)
}

export interface TaxBill {
  cards: number
  houses: number
  hotels: number
  cardTax: number
  buildingTax: number
}

export function taxBill(state: GameState, playerId: string): TaxBill {
  const props = propertiesOf(state, playerId)
  let houses = 0
  let hotels = 0
  for (const i of props) {
    const lvl = holding(state, i).level
    if (lvl === MAX_LEVEL) hotels++
    else houses += lvl
  }
  return {
    cards: props.length,
    houses,
    hotels,
    cardTax: props.length * TAX_PER_CARD,
    buildingTax: houses * TAX_PER_HOUSE + hotels * TAX_PER_HOTEL,
  }
}

export function startReward(state: GameState, player: Player): number {
  return player.ultimateStart ? ULTIMATE_START_REWARD : state.settings.salary
}

/** WebCoins, the in-game currency. */
export const formatCoins = (n: number) => `${n < 0 ? '-' : ''}${Math.abs(n).toLocaleString('en-US')} WC`
