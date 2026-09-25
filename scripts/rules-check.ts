// Deterministic checks for specific house rules: `npx tsx scripts/rules-check.ts`
import assert from 'node:assert/strict'
import { LEASE_INDEX, SHOP_INDEX, SPIDERVERSE_INDEX, TILES } from '../shared/board.ts'
import { Game } from '../server/game.ts'

function setup() {
  const game = new Game('T', () => {})
  game.addPlayer('A')
  game.addPlayer('B')
  game.updateSettings(game.state.hostId, { turnSeconds: 0 })
  game.start(game.state.hostId)
  for (const id of [...game.state.offerPending]) game.act(id, { type: 'ultimateOffer', buy: false })
  const me = game.player(game.state.current!)
  const other = game.state.players.find((p) => p.id !== me.id)!
  return { game, me, other, g: game as any }
}

let passed = 0
const check = (name: string, fn: () => void) => {
  fn()
  passed++
  console.log(`✓ ${name}`)
}

check('Spider-Verse reverse stops exactly on the spot and grants a forward roll', () => {
  const { game, me, g } = setup()
  me.pos = SPIDERVERSE_INDEX + 5
  me.reversing = true
  g.hasRolled = true
  g.reverseStep(me, 8)
  assert.equal(me.pos, SPIDERVERSE_INDEX)
  assert.equal(me.reversing, false)
  assert.equal(game.state.phase, 'roll')
})

check('Reverse step short of the spot keeps reversing and resolves the landing', () => {
  const { me, g } = setup()
  me.pos = SPIDERVERSE_INDEX + 9
  me.reversing = true
  g.reverseStep(me, 3)
  assert.equal(me.pos, SPIDERVERSE_INDEX + 6)
  assert.equal(me.reversing, true)
})

check('No jail while reversing', () => {
  const { me, g } = setup()
  me.reversing = true
  g.sendToJail(me)
  assert.equal(me.inJail, false)
})

check('UNO / CHANCE use the dice total that brought the player there', () => {
  const { game, me, g } = setup()
  game.state.dice = [3, 3]
  const uno = TILES.find((t) => t.kind === 'uno')!.index
  me.pos = uno
  g.landOn(me)
  assert.equal(game.state.lastCard?.roll, 6)
  assert.equal(game.state.lastCard?.deck, 'uno')
})

check('Doublets do not give an extra roll', () => {
  const { game, me, g } = setup()
  g.throwDice = () => ((game.state.dice = [2, 2]), [2, 2])
  me.pos = 0
  game.act(me.id, { type: 'roll' })
  assert.notEqual(game.state.phase, 'roll')
})

check('Token Shop sells one item per visit', () => {
  const { game, me } = setup()
  me.pos = SHOP_INDEX
  game.state.phase = 'shop'
  game.act(me.id, { type: 'shopBuy', item: 'jailCard' })
  assert.equal(me.items.jailCard, 1)
  assert.notEqual(game.state.phase, 'shop')
})

check('Paying out of jail means moving next turn', () => {
  const { game, me } = setup()
  me.inJail = true
  game.state.phase = 'jail'
  game.act(me.id, { type: 'payBail' })
  assert.equal(me.inJail, false)
  assert.equal(game.state.phase, 'manage')
})

check('Selling a card for debt refunds price plus all building costs', () => {
  const { game, me } = setup()
  const tile = TILES.find((t) => t.card)!.index
  const card = TILES[tile].card!
  game.state.holdings[tile] = { owner: me.id, level: 2, lease: null }
  game.state.phase = 'debt'
  game.state.debt = { amount: 1, to: null, reason: 'test' }
  const before = me.cash
  game.act(me.id, { type: 'sellProperty', tile })
  assert.equal(me.cash - before, card.price + 2 * card.build)
  assert.equal(game.state.holdings[tile], undefined)
})

check('Half / 1.5x / double rent counts rent payments, not turns', () => {
  const { game, me, other, g } = setup()
  const tile = TILES.find((t) => t.card)!.index
  game.state.holdings[tile] = { owner: other.id, level: 0, lease: null }
  me.effects.rentMult = 2
  me.effects.rentPayments = 2
  const base = TILES[tile].card!.rent[0]
  assert.equal(g.rentDue(me, tile), base * 2)
  assert.equal(g.rentDue(me, tile), base * 2)
  assert.equal(g.rentDue(me, tile), base)
})

check('Lease rounds are paid each time the renter comes back to the Lease spot', () => {
  const { game, me, g } = setup()
  const tile = TILES.find((t) => t.card)!.index
  me.pos = LEASE_INDEX
  game.state.phase = 'leaseSpot'
  game.act(me.id, { type: 'leaseUnowned', tile, level: 0 })
  const lease = game.state.holdings[tile].lease!
  assert.equal(lease.started, true)
  g.moveBy(me, 39)
  assert.equal(g.dueLeases.length, 0)
  g.moveBy(me, 1)
  assert.deepEqual(g.dueLeases, [tile])
})

check('One upgrade, only on the owned card the player just landed on', () => {
  const { game, me, g } = setup()
  me.cash = 500_000
  const [a, b] = TILES.filter((t) => t.card).map((t) => t.index)
  game.state.holdings[a] = { owner: me.id, level: 0, lease: null }
  game.state.holdings[b] = { owner: me.id, level: 0, lease: null }
  me.pos = a
  game.state.phase = 'manage'
  assert.throws(() => game.act(me.id, { type: 'build', tile: a }), /one upgrade/) // standing, but did not land this turn
  g.landOn(me)
  assert.throws(() => game.act(me.id, { type: 'build', tile: b }), /one upgrade/)
  game.act(me.id, { type: 'build', tile: a })
  assert.equal(game.state.holdings[a].level, 1)
  assert.throws(() => game.act(me.id, { type: 'build', tile: a }), /one upgrade/)
})

console.log(`\n${passed} rule checks passed`)
process.exit(0)
