import { TILES, groupMembers, type GroupId } from './board.ts'
import type { GameState, Holding } from './types.ts'

export const MAX_LEVEL = 4
export const UNLEASE_INTEREST = 0.1
export const LANDING_ON_START_BONUS = 5_000
export const LEASE_OFFICE_GRANT = 2_000
export const PORTAL_FEE = 2_000
export const SIGNPOST_SWING_BONUS = 2_000
export const TAX_RATE = 0.1
export const TAX_MIN = 2_000
export const TAX_MAX = 15_000

export const roundTo100 = (n: number) => Math.round(n / 100) * 100

export function holding(state: GameState, tile: number): Holding {
  return state.holdings[tile] ?? { owner: null, level: 0, leased: false }
}

export function ownedInGroup(state: GameState, playerId: string, group: GroupId): number {
  return groupMembers(group).filter((i) => holding(state, i).owner === playerId).length
}

export function ownsFullGroup(state: GameState, playerId: string, group: GroupId): boolean {
  return ownedInGroup(state, playerId, group) === groupMembers(group).length
}

export function rentFor(state: GameState, tile: number): number {
  const card = TILES[tile].card
  const h = holding(state, tile)
  if (!card || !h.owner || h.leased) return 0
  if (h.level === 0) return card.rent[0] * (ownsFullGroup(state, h.owner, card.group) ? 2 : 1)
  return card.rent[h.level]
}

export function buildCost(state: GameState, tile: number): number {
  const card = TILES[tile].card
  if (!card) return 0
  return roundTo100((card.build * state.settings.buildCostPct) / 100)
}

export function leasePayout(state: GameState, tile: number): number {
  const card = TILES[tile].card
  if (!card) return 0
  return card.lease[holding(state, tile).level]
}

export function unleaseCost(state: GameState, tile: number): number {
  const base = leasePayout(state, tile)
  return state.freeUnlease ? base : roundTo100(base * (1 + UNLEASE_INTEREST))
}

export function buildBlocker(state: GameState, playerId: string, tile: number): string | null {
  const card = TILES[tile].card
  if (!card) return 'Not a property'
  const h = holding(state, tile)
  if (h.owner !== playerId) return 'You do not own this'
  if (h.leased) return 'Leased properties cannot be built on'
  if (h.level >= MAX_LEVEL) return 'Already a Web HQ'
  const need = state.settings.buildRequirement
  if (ownedInGroup(state, playerId, card.group) < need) return `Own ${need} of the ${groupMembers(card.group).length} in this group to build`
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.cash < buildCost(state, tile)) return 'Not enough coins'
  return null
}

export function propertyValue(state: GameState, tile: number): number {
  const card = TILES[tile].card
  if (!card) return 0
  const h = holding(state, tile)
  const built = card.price + h.level * buildCost(state, tile)
  return h.leased ? built - leasePayout(state, tile) : built
}

export function netWorth(state: GameState, playerId: string): number {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.bankrupt) return 0
  let worth = player.cash
  for (const [i, h] of Object.entries(state.holdings)) {
    if (h.owner === playerId) worth += propertyValue(state, Number(i))
  }
  return worth
}

export function propertiesOf(state: GameState, playerId: string): number[] {
  return Object.entries(state.holdings)
    .filter(([, h]) => h.owner === playerId)
    .map(([i]) => Number(i))
    .sort((a, b) => a - b)
}

/** Coins a player could still raise by leasing everything they own. */
export function liquidity(state: GameState, playerId: string): number {
  return propertiesOf(state, playerId)
    .filter((i) => !holding(state, i).leased)
    .reduce((sum, i) => sum + leasePayout(state, i), 0)
}

export function taxFor(state: GameState, playerId: string): number {
  return Math.min(TAX_MAX, Math.max(TAX_MIN, roundTo100(netWorth(state, playerId) * TAX_RATE)))
}

/** WebCoins, the in-game currency. */
export const formatCoins = (n: number) => `${n < 0 ? '-' : ''}${Math.abs(n).toLocaleString('en-US')} WC`
