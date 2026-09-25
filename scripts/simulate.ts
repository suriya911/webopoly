// Headless bot games to smoke-test the rules engine: `npx tsx scripts/simulate.ts [games]`
import { PROPERTY_INDEXES, TILES } from '../shared/board.ts'
import { SHOP_ITEMS } from '../shared/cards.ts'
import { buildBlocker, holding, leasedBy, propertiesOf, rentCollector } from '../shared/rules.ts'
import type { GameAction, GameState, Player } from '../shared/types.ts'
import { Game, GameError } from '../server/game.ts'

const games = Number(process.argv[2] ?? 200)
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
const chance = (p: number) => Math.random() < p
let totalTurns = 0
let finished = 0
const errors = new Map<string, number>()
const seen = new Map<string, number>()
const count = (k: string) => seen.set(k, (seen.get(k) ?? 0) + 1)

/** Free actions a bot might take before rolling / ending its turn. */
function freeAction(s: GameState, me: Player): GameAction | null {
  const mine = propertiesOf(s, me.id)
  if (me.items.symbiote && chance(0.5)) {
    const tile = [...mine, ...leasedBy(s, me.id)].find((i) => rentCollector(s, i) === me.id)
    const target = s.players.find((p) => p.id !== me.id && !p.bankrupt && !p.inJail)
    if (tile !== undefined && target) return { type: 'useSymbiote', target: target.id, tile }
  }
  if (me.items.sinister && chance(0.5)) return { type: 'activateSinister' }
  if (me.items.startCard && chance(0.3)) return { type: 'useStartCard', ultimate: false }
  const b = mine.find((i) => !buildBlocker(s, me.id, i))
  if (b !== undefined && me.cash > 60000 && chance(0.3)) return { type: 'build', tile: b }
  return null
}

function decide(s: GameState, me: Player): GameAction {
  switch (s.phase) {
    case 'roll':
      return freeAction(s, me) ?? { type: 'roll' }
    case 'jail':
      if (me.items.jailCard) return { type: 'useJailCard' }
      if (me.cash > 60000 && chance(0.3)) return { type: 'payBail' }
      return me.jailRolls < 3 ? { type: 'roll' } : { type: 'stayInJail' }
    case 'buy':
      return me.cash > TILES[me.pos].card!.price + 5000 ? { type: 'buy' } : { type: 'pass' }
    case 'choose':
      return { type: 'choose', tile: pick(s.choice!.tiles) }
    case 'shop': {
      const affordable = SHOP_ITEMS.filter((i) => i.price < me.cash - 30000)
      return affordable.length && chance(0.6) ? { type: 'shopBuy', item: pick(affordable).id } : { type: 'shopLeave' }
    }
    case 'spiderverse':
      return { type: 'spiderverse', go: chance(0.6) }
    case 'leaseSpot': {
      if (chance(0.4)) {
        const free = PROPERTY_INDEXES.filter((i) => !holding(s, i).owner && !holding(s, i).lease)
        if (free.length) return { type: 'leaseUnowned', tile: pick(free), level: Math.floor(Math.random() * 5) }
      }
      if (chance(0.3)) {
        const other = s.players.find((p) => p.id !== me.id && !p.bankrupt)
        const tile = propertiesOf(s, me.id).find((i) => !holding(s, i).lease)
        if (other && tile !== undefined) return { type: 'proposeLease', tile, with: other.id }
      }
      return { type: 'leaveLeaseSpot' }
    }
    case 'manage': {
      const f = freeAction(s, me)
      if (f) return f
      if (chance(0.05)) {
        const other = s.players.find((p) => !p.bankrupt && p.id !== me.id)
        if (other)
          return {
            type: 'proposeTrade',
            offer: { to: other.id, giveProps: propertiesOf(s, me.id).slice(0, 1), getProps: propertiesOf(s, other.id).slice(0, 1), giveCash: 1000, getCash: 0 },
          }
      }
      return { type: 'endTurn' }
    }
    case 'debt': {
      const mine = propertiesOf(s, me.id).filter((i) => !holding(s, i).lease)
      if (me.cash >= s.debt!.amount) return { type: 'payDebt' }
      if (mine.length) return { type: 'sellProperty', tile: mine[0] }
      return { type: 'bankrupt' }
    }
    default:
      throw new Error(`no bot move for ${s.phase}`)
  }
}

for (let g = 0; g < games; g++) {
  const game = new Game('TEST', () => {})
  const n = 2 + (g % 5)
  for (let i = 0; i < n; i++) game.addPlayer(`Bot${i}`)
  const host = game.state.hostId
  game.updateSettings(host, { turnSeconds: 0, timeLimitMinutes: 0, startingCash: pick([100_000, 150_000, 300_000]) })
  game.start(host)
  let steps = 0
  while (game.state.status === 'playing' && steps < 30000) {
    steps++
    const s = game.state
    let actor: Player
    let action: GameAction
    if (s.phase === 'vote') {
      actor = s.players.find((p) => !p.bankrupt && !s.opening!.votes[p.id])!
      action = { type: 'vote', choice: chance(0.5) ? 'highest' : 'lowest' }
    } else if (s.phase === 'order') {
      actor = game.player(s.opening!.rollers.find((id) => s.opening!.rolls[id] === undefined)!)
      action = { type: 'openingRoll' }
    } else if (s.phase === 'offer') {
      actor = game.player(s.offerPending[0])
      action = { type: 'ultimateOffer', buy: chance(0.3) }
    } else if (s.phase === 'web') {
      actor = game.player(s.webPrompt!.owner)
      action = { type: 'web', use: chance(0.7) }
    } else {
      actor = s.players.find((p) => p.id === s.current)!
      action = decide(s, actor)
    }
    count(s.phase)
    try {
      game.act(actor.id, action)
      for (const t of [...game.state.trades]) {
        try {
          game.act(t.to, { type: 'respondTrade', id: t.id, accept: chance(0.5) })
        } catch (e) {
          if (!(e instanceof GameError)) throw e
        }
      }
      for (const o of [...game.state.leaseOffers]) {
        const responder = o.from === o.lessor ? o.lessee : o.lessor
        try {
          game.act(responder, { type: 'respondLease', id: o.id, accept: chance(0.6) })
        } catch (e) {
          if (!(e instanceof GameError)) throw e
        }
      }
    } catch (e) {
      if (!(e instanceof GameError)) throw e
      const key = `${s.phase}:${action.type}:${e.message}`
      errors.set(key, (errors.get(key) ?? 0) + 1)
      if (['roll', 'endTurn', 'payDebt', 'shopLeave', 'leaveLeaseSpot', 'stayInJail'].includes(action.type))
        throw new Error(`Stuck: ${e.message} in ${s.phase}`)
    }
    for (const p of game.state.players) {
      if (!p.bankrupt && p.cash < 0) throw new Error(`Negative cash ${p.name} ${p.cash} phase ${game.state.phase}`)
      if (p.pos < 0 || p.pos >= 40) throw new Error('bad pos')
      if (!p.bankrupt && game.state.status === 'playing' && propertiesOf(game.state, p.id).length > p.cardLimit) throw new Error(`over card limit ${p.name}`)
      if (p.glued && p.inJail) throw new Error('glued in jail')
      if (p.reversing && p.inJail) throw new Error('reversing in jail')
      if (p.reversing) count('reversing')
    }
    for (const [i, h] of Object.entries(game.state.holdings)) {
      if (h.owner && !game.state.players.find((p) => p.id === h.owner && !p.bankrupt)) throw new Error(`Orphan holding ${i}`)
      if (!h.owner && !h.lease) throw new Error(`Empty holding ${i}`)
      if (h.lease && !game.state.players.find((p) => p.id === h.lease!.lessee && !p.bankrupt)) throw new Error(`Orphan lease ${i}`)
      if (h.level < 0 || h.level > 4) throw new Error('bad level')
    }
  }
  totalTurns += game.state.turn
  if (game.state.status === 'finished') finished++
  game.dispose()
}
console.log(`games=${games} finished=${finished} avgTurns=${Math.round(totalTurns / games)}`)
console.log('phases seen:', Object.fromEntries(seen))
console.log('rejected actions:', Object.fromEntries(errors))
