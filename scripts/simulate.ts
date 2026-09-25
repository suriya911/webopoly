// Headless bot games to smoke-test the rules engine: `npx tsx scripts/simulate.ts [games]`
import { PROPERTY_INDEXES, TILES } from '../shared/board.ts'
import { buildBlocker, holding, propertiesOf } from '../shared/rules.ts'
import type { GameAction } from '../shared/types.ts'
import { Game, GameError } from '../server/game.ts'

const games = Number(process.argv[2] ?? 200)
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
let totalTurns = 0
let finished = 0
const errors = new Map<string, number>()

for (let g = 0; g < games; g++) {
  const game = new Game('TEST', () => {})
  const n = 2 + (g % 5)
  for (let i = 0; i < n; i++) game.addPlayer(`Bot${i}`)
  const host = game.state.hostId
  game.updateSettings(host, { turnSeconds: 0, timeLimitMinutes: 0 })
  game.start(host)
  let steps = 0
  while (game.state.status === 'playing' && steps < 20000) {
    steps++
    const s = game.state
    const me = s.players.find((p) => p.id === s.current)!
    let action: GameAction
    switch (s.phase) {
      case 'roll':
        if (Math.random() < 0.3) {
          const b = propertiesOf(s, me.id).find((i) => !buildBlocker(s, me.id, i))
          if (b !== undefined && me.cash > 40000) {
            action = { type: 'build', tile: b }
            break
          }
        }
        action = { type: 'roll' }
        break
      case 'jail':
        action = pick([{ type: 'roll' }, { type: 'payBail' }, ...(me.jailCards ? [{ type: 'useJailCard' } as const] : [])] as GameAction[])
        break
      case 'buy':
        action = me.cash > (TILES[me.pos].card!.price + 5000) ? { type: 'buy' } : { type: 'pass' }
        break
      case 'signpost':
        action = { type: 'signpost', choice: pick(['this', 'that', 'another'] as const) }
        break
      case 'portal':
        action = { type: 'portal', target: Math.random() < 0.5 ? null : pick(PROPERTY_INDEXES) }
        break
      case 'manage': {
        const leased = propertiesOf(s, me.id).find((i) => holding(s, i).leased)
        if (leased !== undefined && me.cash > 60000 && Math.random() < 0.5) action = { type: 'unlease', tile: leased }
        else if (Math.random() < 0.05 && s.players.filter((p) => !p.bankrupt).length > 1) {
          const other = pick(s.players.filter((p) => !p.bankrupt && p.id !== me.id))
          action = { type: 'proposeTrade', offer: { to: other.id, giveProps: propertiesOf(s, me.id).slice(0, 1), getProps: propertiesOf(s, other.id).slice(0, 1), giveCash: 1000, getCash: 0 } }
        } else action = { type: 'endTurn' }
        break
      }
      case 'debt': {
        const l = propertiesOf(s, me.id).find((i) => !holding(s, i).leased)
        action = me.cash >= s.debt!.amount ? { type: 'payDebt' } : l !== undefined ? { type: 'lease', tile: l } : { type: 'bankrupt' }
        break
      }
    }
    try {
      game.act(me.id, action)
      // Let targets answer trades
      for (const t of [...game.state.trades]) {
        try { game.act(t.to, { type: 'respondTrade', id: t.id, accept: Math.random() < 0.5 }) } catch (e) { if (!(e instanceof GameError)) throw e }
      }
    } catch (e) {
      if (!(e instanceof GameError)) throw e
      errors.set(`${s.phase}:${action.type}:${e.message}`, (errors.get(`${s.phase}:${action.type}:${e.message}`) ?? 0) + 1)
      if (action.type === 'roll' || action.type === 'endTurn' || action.type === 'payDebt') throw new Error(`Stuck: ${e.message} in ${s.phase}`)
    }
    // Invariants
    for (const p of game.state.players) {
      if (!p.bankrupt && p.cash < 0) throw new Error(`Negative cash ${p.name} ${p.cash} phase ${game.state.phase}`)
      if (p.pos < 0 || p.pos >= 40) throw new Error('bad pos')
    }
    for (const [i, h] of Object.entries(game.state.holdings)) {
      const owner = game.state.players.find((p) => p.id === h.owner)
      if (!owner || owner.bankrupt) throw new Error(`Orphan holding ${i}`)
      if (h.level < 0 || h.level > 4) throw new Error('bad level')
    }
  }
  totalTurns += game.state.turn
  if (game.state.status === 'finished') finished++
  game.dispose()
}
console.log(`games=${games} finished=${finished} avgTurns=${Math.round(totalTurns / games)}`)
console.log('rejected actions:', Object.fromEntries(errors))
