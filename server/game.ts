import { randomInt } from 'node:crypto'
import { nanoid } from 'nanoid'
import { AVATARS, BOARD_SIZE, JAIL_INDEX, PROPERTY_INDEXES, SIGNPOSTS, TILES } from '../shared/board.ts'
import { CHANCE_CARDS, type ChanceCard } from '../shared/cards.ts'
import {
  JAIL_BAIL,
  LANDING_ON_START_BONUS,
  LEASE_OFFICE_GRANT,
  MAX_LEVEL,
  STARTING_CASH_MAX,
  STARTING_CASH_MIN,
  STARTING_CASH_STEP,
  PORTAL_FEE,
  SIGNPOST_SWING_BONUS,
  buildBlocker,
  buildCost,
  formatCoins,
  holding,
  leasePayout,
  netWorth,
  propertiesOf,
  rentFor,
  taxFor,
  unleaseCost,
} from '../shared/rules.ts'
import {
  DEFAULT_SETTINGS,
  type Debt,
  type GameAction,
  type GameState,
  type LogEntry,
  type Phase,
  type Player,
  type Settings,
  type TradeOffer,
} from '../shared/types.ts'

export const MAX_PLAYERS = 6
export const MIN_PLAYERS = 2

const DISCONNECTED_TURN_SECONDS = 15

function shuffle<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const rollDie = () => randomInt(1, 7)

export class GameError extends Error {}

export class Game {
  state: GameState
  /** Secret reconnect tokens: token -> player id */
  readonly tokens = new Map<string, string>()
  private deck: ChanceCard[] = []
  private afterDebt: (() => void) | null = null
  private timer: NodeJS.Timeout | null = null
  private logSeq = 0
  private eventSeq = 0
  private readonly onChange: () => void

  constructor(code: string, onChange: () => void) {
    this.onChange = onChange
    this.state = {
      code,
      status: 'lobby',
      hostId: '',
      settings: { ...DEFAULT_SETTINGS },
      players: [],
      turn: 0,
      current: null,
      phase: 'roll',
      dice: [1, 1],
      rollSeq: 0,
      doubles: 0,
      canRollAgain: false,
      holdings: {},
      pot: 0,
      debt: null,
      freeUnlease: false,
      log: [],
      lastCard: null,
      moves: [],
      money: [],
      trades: [],
      deadline: null,
      startedAt: null,
      endsAt: null,
      winner: null,
      ranking: null,
    }
  }

  // ---------------------------------------------------------------- lobby

  addPlayer(name: string, avatar?: string): { player: Player; token: string } {
    const s = this.state
    if (s.status !== 'lobby') throw new GameError('Game already started')
    if (s.players.length >= MAX_PLAYERS) throw new GameError('Room is full (6 players max)')
    const taken = new Set(s.players.map((p) => p.avatar))
    const chosen = avatar && !taken.has(avatar) && AVATARS.some((a) => a.id === avatar) ? avatar : AVATARS.find((a) => !taken.has(a.id))!.id
    const player: Player = {
      id: nanoid(10),
      name: cleanName(name) || `Spider ${s.players.length + 1}`,
      avatar: chosen,
      cash: 0,
      pos: 0,
      inJail: false,
      jailTurns: 0,
      jailCards: 0,
      bankrupt: false,
      connected: true,
      ready: false,
    }
    s.players.push(player)
    if (!s.hostId) s.hostId = player.id
    const token = nanoid(24)
    this.tokens.set(token, player.id)
    this.log(`${player.name} joined the room`, 'system')
    return { player, token }
  }

  removePlayer(id: string) {
    const s = this.state
    const player = this.player(id)
    if (s.status !== 'lobby') {
      this.forfeit(id)
      return
    }
    s.players = s.players.filter((p) => p.id !== id)
    for (const [t, pid] of this.tokens) if (pid === id) this.tokens.delete(t)
    if (s.hostId === id) s.hostId = s.players[0]?.id ?? ''
    this.log(`${player.name} left the room`, 'system')
  }

  updateProfile(id: string, patch: { name?: string; avatar?: string; ready?: boolean }) {
    const s = this.state
    if (s.status !== 'lobby') throw new GameError('Game already started')
    const p = this.player(id)
    if (patch.name !== undefined) p.name = cleanName(patch.name) || p.name
    if (patch.avatar !== undefined) {
      if (!AVATARS.some((a) => a.id === patch.avatar)) throw new GameError('Unknown avatar')
      if (s.players.some((o) => o.id !== id && o.avatar === patch.avatar)) throw new GameError('Avatar already taken')
      p.avatar = patch.avatar
    }
    if (patch.ready !== undefined) p.ready = patch.ready
  }

  updateSettings(id: string, patch: Partial<Settings>) {
    const s = this.state
    if (id !== s.hostId) throw new GameError('Only the host can change settings')
    if (s.status !== 'lobby') throw new GameError('Game already started')
    const next = { ...s.settings }
    for (const key of Object.keys(s.settings) as (keyof Settings)[]) {
      if (patch[key] !== undefined) (next as Record<string, unknown>)[key] = patch[key]
    }
    next.startingCash = clamp(Math.round(next.startingCash / STARTING_CASH_STEP) * STARTING_CASH_STEP, STARTING_CASH_MIN, STARTING_CASH_MAX)
    next.salary = clamp(next.salary, 0, 50_000)
    next.turnSeconds = clamp(next.turnSeconds, 0, 300)
    next.timeLimitMinutes = clamp(next.timeLimitMinutes, 0, 240)
    s.settings = next
  }

  kick(hostId: string, targetId: string) {
    if (hostId !== this.state.hostId) throw new GameError('Only the host can kick')
    if (hostId === targetId) throw new GameError('You cannot kick yourself')
    this.removePlayer(targetId)
  }

  start(id: string) {
    const s = this.state
    if (id !== s.hostId) throw new GameError('Only the host can start')
    if (s.status !== 'lobby') throw new GameError('Game already started')
    if (s.players.length < MIN_PLAYERS) throw new GameError('Need at least 2 players')
    s.status = 'playing'
    s.players = shuffle(s.players)
    for (const p of s.players) {
      p.cash = s.settings.startingCash
      p.pos = 0
    }
    this.deck = shuffle(CHANCE_CARDS)
    s.startedAt = Date.now()
    s.endsAt = s.settings.timeLimitMinutes ? s.startedAt + s.settings.timeLimitMinutes * 60_000 : null
    s.turn = 0
    this.log(`Game on! ${s.players.map((p) => p.name).join(', ')} enter the web. ${s.players[0].name} goes first.`, 'system')
    this.beginTurn(s.players[0].id)
  }

  setConnected(id: string, connected: boolean) {
    const p = this.state.players.find((x) => x.id === id)
    if (!p || p.connected === connected) return
    p.connected = connected
    if (this.state.status === 'playing' && !p.bankrupt) {
      this.log(`${p.name} ${connected ? 'reconnected' : 'disconnected'}`, 'system')
      if (this.state.current === id) this.schedule()
    }
  }

  // ---------------------------------------------------------------- actions

  act(playerId: string, action: GameAction) {
    const s = this.state
    if (s.status !== 'playing') throw new GameError('Game is not running')
    const me = this.player(playerId)
    if (me.bankrupt) throw new GameError('You are out of the game')

    // Actions allowed any time
    switch (action.type) {
      case 'proposeTrade':
        return this.proposeTrade(playerId, action.offer)
      case 'respondTrade':
        return this.respondTrade(playerId, action.id, action.accept)
      case 'cancelTrade':
        s.trades = s.trades.filter((t) => !(t.id === action.id && t.from === playerId))
        return
      case 'forfeit':
        return this.forfeit(playerId)
    }

    if (s.current !== playerId) throw new GameError('Not your turn')

    switch (action.type) {
      case 'roll':
        if (s.phase === 'jail') return this.rollInJail()
        this.expect('roll')
        return this.roll()
      case 'payBail':
        this.expect('jail')
        if (me.cash < JAIL_BAIL) throw new GameError('Not enough coins for bail')
        this.pay(me, JAIL_BAIL, { toPot: true })
        this.release(me, `${me.name} paid ${formatCoins(JAIL_BAIL)} bail`)
        s.phase = 'roll'
        break
      case 'useJailCard':
        this.expect('jail')
        if (me.jailCards < 1) throw new GameError('No pardon card')
        me.jailCards--
        this.release(me, `${me.name} used a pardon card to escape The Raft`)
        s.phase = 'roll'
        break
      case 'buy':
        this.expect('buy')
        return this.buy(me)
      case 'pass':
        this.expect('buy')
        this.log(`${me.name} passed on ${TILES[me.pos].name}`, 'money', me.id)
        return this.afterResolve()
      case 'signpost':
        this.expect('signpost')
        return this.signpost(me, action.choice)
      case 'portal':
        this.expect('portal')
        return this.portal(me, action.target)
      case 'build':
        this.expectManage()
        return this.build(me, action.tile)
      case 'lease':
        if (!['roll', 'jail', 'manage', 'debt', 'buy'].includes(s.phase)) throw new GameError('Finish your current decision first')
        return this.lease(me, action.tile)
      case 'unlease':
        this.expectManage()
        return this.unlease(me, action.tile)
      case 'payDebt':
        this.expect('debt')
        return this.payDebt(me)
      case 'bankrupt':
        this.expect('debt')
        return this.goBankrupt(me, s.debt)
      case 'endTurn':
        this.expect('manage')
        return this.nextTurn()
    }
  }

  private expect(phase: Phase) {
    if (this.state.phase !== phase) throw new GameError(`You can't do that right now`)
  }

  private expectManage() {
    if (!['roll', 'jail', 'manage'].includes(this.state.phase)) throw new GameError('Finish your current decision first')
  }

  // ---------------------------------------------------------------- turn flow

  private beginTurn(id: string) {
    const s = this.state
    const p = this.player(id)
    s.current = id
    s.doubles = 0
    s.canRollAgain = false
    s.freeUnlease = false
    s.debt = null
    this.afterDebt = null
    s.phase = p.inJail ? 'jail' : 'roll'
  }

  private nextTurn(): void {
    const s = this.state
    if (s.status !== 'playing') return
    if (s.endsAt && Date.now() >= s.endsAt) {
      this.log('Time is up!', 'system')
      return this.finish()
    }
    const alive = s.players.filter((p) => !p.bankrupt)
    if (alive.length <= 1) return this.finish()
    const idx = s.players.findIndex((p) => p.id === s.current)
    for (let k = 1; k <= s.players.length; k++) {
      const next = s.players[(idx + k) % s.players.length]
      if (!next.bankrupt) {
        s.turn++
        return this.beginTurn(next.id)
      }
    }
  }

  /** Called once a landing has been fully resolved. */
  private afterResolve(): void {
    const s = this.state
    const me = this.player(s.current!)
    if (me.bankrupt) return
    s.phase = s.canRollAgain && !me.inJail ? 'roll' : 'manage'
    if (s.phase === 'roll') this.log(`Doubles! ${me.name} rolls again`, 'move', me.id)
  }

  private roll(): void {
    const s = this.state
    const me = this.player(s.current!)
    const [a, b] = this.throwDice()
    const isDouble = a === b
    this.log(`${me.name} rolled ${a} + ${b} = ${a + b}${isDouble ? ' (doubles)' : ''}`, 'move', me.id)
    if (isDouble) {
      s.doubles++
      if (s.doubles >= 3) {
        this.log(`Three doubles in a row! ${me.name} is caught speeding and sent to The Raft`, 'jail', me.id)
        return this.sendToJail(me)
      }
    }
    s.canRollAgain = isDouble
    this.moveBy(me, a + b)
    this.resolveLanding(me)
  }

  private rollInJail(): void {
    const s = this.state
    const me = this.player(s.current!)
    const [a, b] = this.throwDice()
    if (a === b) {
      this.release(me, `${me.name} rolled doubles (${a} + ${b}) and broke out of The Raft!`)
      s.canRollAgain = false
      this.moveBy(me, a + b)
      return this.resolveLanding(me)
    }
    me.jailTurns++
    if (me.jailTurns >= 3) {
      this.log(`${me.name} failed a third escape (${a} + ${b}) and must pay ${formatCoins(JAIL_BAIL)} bail`, 'jail', me.id)
      const move = () => {
        this.release(me, `${me.name} is released from The Raft`)
        this.moveBy(me, a + b)
        this.resolveLanding(me)
      }
      if (this.charge(me, JAIL_BAIL, { toPot: true }, 'Raft bail', move)) move()
      return
    }
    this.log(`${me.name} rolled ${a} + ${b}, no doubles. Stuck in The Raft (${me.jailTurns}/3)`, 'jail', me.id)
    s.phase = 'manage'
  }

  private throwDice(): [number, number] {
    const s = this.state
    s.dice = [rollDie(), rollDie()]
    s.rollSeq++
    return s.dice
  }

  private release(me: Player, text: string) {
    me.inJail = false
    me.jailTurns = 0
    this.log(text, 'jail', me.id)
  }

  // ---------------------------------------------------------------- movement

  private moveBy(me: Player, steps: number) {
    const path: number[] = []
    const dir = Math.sign(steps)
    let pos = me.pos
    for (let i = 0; i < Math.abs(steps); i++) {
      pos = (pos + dir + BOARD_SIZE) % BOARD_SIZE
      path.push(pos)
      if (dir > 0 && pos === 0) this.paySalary(me, i === Math.abs(steps) - 1)
    }
    me.pos = pos
    this.pushMove({ seq: ++this.eventSeq, playerId: me.id, path })
  }

  /** Move forward (clockwise) to a tile, collecting salary if START is passed. */
  private advanceTo(me: Player, target: number) {
    const steps = (target - me.pos + BOARD_SIZE) % BOARD_SIZE || BOARD_SIZE
    this.moveBy(me, steps)
  }

  private teleport(me: Player, target: number) {
    me.pos = target
    this.pushMove({ seq: ++this.eventSeq, playerId: me.id, path: [target], teleport: true })
  }

  private pushMove(move: GameState['moves'][number]) {
    const moves = this.state.moves
    moves.push(move)
    if (moves.length > 12) moves.splice(0, moves.length - 12)
  }

  private paySalary(me: Player, landed: boolean) {
    const s = this.state
    const amount = s.settings.salary + (landed ? LANDING_ON_START_BONUS : 0)
    if (!amount) return
    this.addCash(me, amount)
    this.log(
      landed ? `${me.name} landed right on START: ${formatCoins(amount)} (salary + bonus)` : `${me.name} passed START and collected ${formatCoins(amount)}`,
      'money',
      me.id,
    )
  }

  private sendToJail(me: Player) {
    const s = this.state
    this.teleport(me, JAIL_INDEX)
    me.inJail = true
    me.jailTurns = 0
    s.canRollAgain = false
    s.doubles = 0
    s.phase = 'manage'
  }

  private resolveLanding(me: Player): void {
    const s = this.state
    const tile = TILES[me.pos]
    switch (tile.kind) {
      case 'property': {
        const h = holding(s, tile.index)
        if (!h.owner) {
          s.phase = 'buy'
          return
        }
        if (h.owner === me.id) {
          this.log(`${me.name} is home at ${tile.name}`, 'move', me.id)
          return this.afterResolve()
        }
        const owner = this.player(h.owner)
        if (h.leased) {
          this.log(`${tile.name} is leased to the bank. No rent due`, 'money', me.id)
          return this.afterResolve()
        }
        const rent = rentFor(s, tile.index)
        this.log(`${me.name} owes ${owner.name} ${formatCoins(rent)} rent for ${tile.name}`, 'money', me.id)
        if (this.charge(me, rent, { to: owner.id }, `Rent to ${owner.name}`, () => this.afterResolve())) this.afterResolve()
        return
      }
      case 'chance':
        return this.drawCard(me)
      case 'signpost':
        s.phase = 'signpost'
        return
      case 'portal':
        if (me.cash >= PORTAL_FEE) {
          s.phase = 'portal'
          return
        }
        this.log(`${me.name} can't afford the Multiverse Portal`, 'move', me.id)
        return this.afterResolve()
      case 'tax': {
        const tax = taxFor(s, me.id)
        this.log(`${me.name} pays ${formatCoins(tax)} city tax (10% of net worth)`, 'money', me.id)
        if (this.charge(me, tax, { toPot: true }, 'City tax', () => this.afterResolve())) this.afterResolve()
        return
      }
      case 'jail':
        this.log(`${me.name} walked into The Raft. Locked up!`, 'jail', me.id)
        return this.sendToJail(me)
      case 'spidersense': {
        if (s.pot > 0) {
          this.log(`${me.name}'s spider-sense finds the stash: ${formatCoins(s.pot)}!`, 'money', me.id)
          this.addCash(me, s.pot)
          s.pot = 0
        } else {
          this.log(`${me.name} checks the Spider-Sense Stash. Empty!`, 'money', me.id)
        }
        return this.afterResolve()
      }
      case 'lease':
        this.addCash(me, LEASE_OFFICE_GRANT)
        s.freeUnlease = true
        this.log(`${me.name} visits the Lease Office: ${formatCoins(LEASE_OFFICE_GRANT)} grant and interest-free buy-backs this turn`, 'money', me.id)
        return this.afterResolve()
      case 'start':
        return this.afterResolve()
    }
  }

  private signpost(me: Player, choice: 'this' | 'that' | 'another'): void {
    if (choice === 'this') {
      this.log(`${me.name} goes THIS WAY: 3 spaces forward`, 'move', me.id)
      this.moveBy(me, 3)
      return this.resolveLanding(me)
    }
    if (choice === 'that') {
      this.log(`${me.name} goes THAT WAY: 3 spaces back`, 'move', me.id)
      this.moveBy(me, -3)
      return this.resolveLanding(me)
    }
    const other = SIGNPOSTS.find((i) => i !== me.pos) ?? SIGNPOSTS[0]
    this.log(`${me.name} takes ANOTHER WAY and web-swings across the city (+${formatCoins(SIGNPOST_SWING_BONUS)})`, 'move', me.id)
    this.advanceTo(me, other)
    this.addCash(me, SIGNPOST_SWING_BONUS)
    return this.afterResolve()
  }

  private portal(me: Player, target: number | null): void {
    if (target === null) {
      this.log(`${me.name} stays out of the multiverse`, 'move', me.id)
      return this.afterResolve()
    }
    if (!PROPERTY_INDEXES.includes(target)) throw new GameError('Pick a property tile')
    if (me.cash < PORTAL_FEE) throw new GameError('Not enough coins')
    this.pay(me, PORTAL_FEE, { toPot: true })
    this.log(`${me.name} pays ${formatCoins(PORTAL_FEE)} and jumps through the portal to ${TILES[target].name}`, 'move', me.id)
    this.teleport(me, target)
    this.resolveLanding(me)
  }

  // ---------------------------------------------------------------- cards

  private drawCard(me: Player): void {
    const s = this.state
    if (this.deck.length === 0) this.deck = shuffle(CHANCE_CARDS)
    let card = this.deck.shift()!
    // Pardon cards held by players are out of the deck.
    if (card.effect.kind === 'jailCard' && s.players.some((p) => p.jailCards > 0)) {
      this.deck.push(card)
      card = this.deck.shift()!
    }
    s.lastCard = { seq: ++this.eventSeq, playerId: me.id, cardId: card.id, title: card.title, text: card.text }
    this.log(`${me.name} drew “${card.title}”: ${card.text}`, 'card', me.id)
    if (card.effect.kind !== 'jailCard') this.deck.push(card)

    const e = card.effect
    const done = () => this.afterResolve()
    switch (e.kind) {
      case 'collect':
        this.addCash(me, e.amount)
        return done()
      case 'pay':
        if (this.charge(me, e.amount, { toPot: true }, card.title, done)) done()
        return
      case 'collectFromEach':
        for (const o of this.others(me)) {
          const amt = Math.min(o.cash, e.amount)
          this.addCash(o, -amt)
          this.addCash(me, amt)
        }
        return done()
      case 'payEach': {
        const others = this.others(me)
        const total = e.amount * others.length
        if (total === 0) return done()
        if (me.cash >= total) {
          for (const o of others) this.transfer(me, o, e.amount)
          return done()
        }
        this.enterDebt({ amount: total, to: null, split: others.map((o) => o.id), reason: card.title }, done)
        return
      }
      case 'moveTo':
        this.advanceTo(me, e.tile)
        return this.resolveLanding(me)
      case 'moveBy':
        this.moveBy(me, e.steps)
        return this.resolveLanding(me)
      case 'jail':
        return this.sendToJail(me)
      case 'jailCard':
        me.jailCards++
        return done()
      case 'repairs': {
        let bill = 0
        for (const i of propertiesOf(s, me.id)) {
          const lvl = holding(s, i).level
          bill += lvl === MAX_LEVEL ? e.perHQ : lvl * e.perHouse
        }
        if (bill === 0) {
          this.log(`${me.name} has no buildings. Nothing to repair!`, 'card', me.id)
          return done()
        }
        this.log(`${me.name}'s repair bill: ${formatCoins(bill)}`, 'money', me.id)
        if (this.charge(me, bill, { toPot: true }, card.title, done)) done()
        return
      }
      case 'nearestUnowned': {
        for (let k = 1; k < BOARD_SIZE; k++) {
          const i = (me.pos + k) % BOARD_SIZE
          if (TILES[i].kind === 'property' && !holding(s, i).owner) {
            this.advanceTo(me, i)
            return this.resolveLanding(me)
          }
        }
        this.log('Every property is claimed. Nowhere to scout!', 'card', me.id)
        return done()
      }
    }
  }

  // ---------------------------------------------------------------- property

  private buy(me: Player): void {
    const s = this.state
    const tile = TILES[me.pos]
    if (!tile.card || holding(s, tile.index).owner) throw new GameError('Nothing to buy here')
    if (me.cash < tile.card.price) throw new GameError('Not enough coins. Lease something first or pass')
    this.addCash(me, -tile.card.price)
    s.holdings[tile.index] = { owner: me.id, level: 0, leased: false }
    this.log(`${me.name} bought ${tile.name} for ${formatCoins(tile.card.price)}`, 'build', me.id)
    this.afterResolve()
  }

  private build(me: Player, tile: number) {
    const s = this.state
    const blocker = buildBlocker(s, me.id, tile)
    if (blocker) throw new GameError(blocker)
    const cost = buildCost(s, tile)
    this.addCash(me, -cost)
    const h = s.holdings[tile]
    h.level++
    this.log(
      `${me.name} built ${h.level === MAX_LEVEL ? 'a Web HQ' : `house #${h.level}`} on ${TILES[tile].name} for ${formatCoins(cost)}`,
      'build',
      me.id,
    )
  }

  private lease(me: Player, tile: number) {
    const s = this.state
    const h = holding(s, tile)
    if (h.owner !== me.id) throw new GameError('You do not own this')
    if (h.leased) throw new GameError('Already leased')
    const payout = leasePayout(s, tile)
    h.leased = true
    this.addCash(me, payout)
    this.log(`${me.name} leased ${TILES[tile].name} to the bank for ${formatCoins(payout)}`, 'money', me.id)
  }

  private unlease(me: Player, tile: number) {
    const s = this.state
    const h = holding(s, tile)
    if (h.owner !== me.id) throw new GameError('You do not own this')
    if (!h.leased) throw new GameError('Not leased')
    const cost = unleaseCost(s, tile)
    if (me.cash < cost) throw new GameError('Not enough coins')
    this.addCash(me, -cost)
    h.leased = false
    this.log(`${me.name} bought back the lease on ${TILES[tile].name} for ${formatCoins(cost)}`, 'money', me.id)
  }

  // ---------------------------------------------------------------- money

  private addCash(p: Player, delta: number) {
    if (!delta) return
    p.cash += delta
    const s = this.state
    s.money.push({ seq: ++this.eventSeq, playerId: p.id, delta })
    if (s.money.length > 30) s.money.splice(0, s.money.length - 30)
  }

  private transfer(from: Player, to: Player, amount: number) {
    this.addCash(from, -amount)
    this.addCash(to, amount)
  }

  /** Pays immediately; caller guarantees funds. */
  private pay(me: Player, amount: number, dest: { to?: string; toPot?: boolean }) {
    this.addCash(me, -amount)
    if (dest.to) this.addCash(this.player(dest.to), amount)
    else if (dest.toPot && this.state.settings.stashPot) this.state.pot += amount
  }

  /** Pays if possible and returns true; otherwise enters the debt phase and returns false. */
  private charge(me: Player, amount: number, dest: { to?: string; toPot?: boolean }, reason: string, then: () => void): boolean {
    if (me.cash >= amount) {
      this.pay(me, amount, dest)
      return true
    }
    this.enterDebt({ amount, to: dest.to ?? null, toPot: dest.toPot, reason }, then)
    return false
  }

  private enterDebt(debt: Debt, then: () => void) {
    const s = this.state
    const me = this.player(s.current!)
    s.debt = debt
    s.phase = 'debt'
    this.afterDebt = then
    this.log(`${me.name} is short ${formatCoins(debt.amount - me.cash)} for ${debt.reason}. Lease properties or declare bankruptcy`, 'money', me.id)
  }

  private payDebt(me: Player): void {
    const s = this.state
    const debt = s.debt!
    if (me.cash < debt.amount) throw new GameError(`You still need ${formatCoins(debt.amount - me.cash)}`)
    if (debt.split) {
      const share = Math.floor(debt.amount / debt.split.length)
      for (const id of debt.split) {
        const o = s.players.find((p) => p.id === id && !p.bankrupt)
        if (o) this.transfer(me, o, share)
      }
    } else {
      this.pay(me, debt.amount, { to: debt.to ?? undefined, toPot: debt.toPot })
    }
    this.log(`${me.name} settled ${formatCoins(debt.amount)} for ${debt.reason}`, 'money', me.id)
    s.debt = null
    const then = this.afterDebt
    this.afterDebt = null
    s.phase = 'manage'
    then?.()
  }

  private goBankrupt(me: Player, debt: Debt | null): void {
    const s = this.state
    const creditor = debt?.to ? s.players.find((p) => p.id === debt.to && !p.bankrupt) : undefined
    me.bankrupt = true
    me.inJail = false
    for (const i of propertiesOf(s, me.id)) {
      if (creditor) s.holdings[i].owner = creditor.id
      else delete s.holdings[i]
    }
    if (creditor) {
      this.transfer(me, creditor, Math.max(0, me.cash))
      creditor.jailCards += me.jailCards
      this.log(`${me.name} is BANKRUPT! ${creditor.name} takes every coin and property`, 'system', me.id)
    } else {
      this.addCash(me, -me.cash)
      this.log(`${me.name} is BANKRUPT! Their properties return to the bank`, 'system', me.id)
    }
    me.jailCards = 0
    s.trades = s.trades.filter((t) => t.from !== me.id && t.to !== me.id)
    if (s.current === me.id) {
      s.debt = null
      this.afterDebt = null
      this.nextTurn()
    } else if (s.players.filter((p) => !p.bankrupt).length <= 1) {
      this.finish()
    }
  }

  private forfeit(id: string): void {
    const me = this.player(id)
    if (me.bankrupt || this.state.status !== 'playing') return
    this.log(`${me.name} forfeited`, 'system', me.id)
    this.goBankrupt(me, null)
  }

  // ---------------------------------------------------------------- trades

  private proposeTrade(from: string, offer: Omit<TradeOffer, 'id' | 'from'>) {
    const s = this.state
    const to = s.players.find((p) => p.id === offer.to && !p.bankrupt)
    if (!to || to.id === from) throw new GameError('Pick another active player')
    const giveCash = Math.max(0, Math.floor(offer.giveCash || 0))
    const getCash = Math.max(0, Math.floor(offer.getCash || 0))
    const giveProps = [...new Set(offer.giveProps)].filter((i) => holding(s, i).owner === from)
    const getProps = [...new Set(offer.getProps)].filter((i) => holding(s, i).owner === to.id)
    if (!giveProps.length && !getProps.length && !giveCash && !getCash) throw new GameError('Empty trade')
    if (s.trades.filter((t) => t.from === from).length >= 3) throw new GameError('You already have 3 open offers')
    const trade: TradeOffer = { id: nanoid(8), from, to: to.id, giveProps, giveCash, getProps, getCash }
    s.trades.push(trade)
    this.log(`${this.player(from).name} sent a trade offer to ${to.name}`, 'trade', from)
  }

  private respondTrade(playerId: string, id: string, accept: boolean) {
    const s = this.state
    const trade = s.trades.find((t) => t.id === id)
    if (!trade || trade.to !== playerId) throw new GameError('Offer not found')
    s.trades = s.trades.filter((t) => t.id !== id)
    const from = this.player(trade.from)
    const to = this.player(trade.to)
    if (!accept) {
      this.log(`${to.name} declined ${from.name}'s trade`, 'trade', to.id)
      return
    }
    const stillValid =
      !from.bankrupt &&
      trade.giveProps.every((i) => holding(s, i).owner === from.id) &&
      trade.getProps.every((i) => holding(s, i).owner === to.id) &&
      from.cash >= trade.giveCash &&
      to.cash >= trade.getCash
    if (!stillValid) throw new GameError('This offer is no longer valid')
    for (const i of trade.giveProps) s.holdings[i].owner = to.id
    for (const i of trade.getProps) s.holdings[i].owner = from.id
    if (trade.giveCash) this.transfer(from, to, trade.giveCash)
    if (trade.getCash) this.transfer(to, from, trade.getCash)
    const names = (ids: number[]) => ids.map((i) => TILES[i].name).join(', ')
    const parts = [
      trade.giveProps.length || trade.giveCash ? `${from.name} gave ${[names(trade.giveProps), trade.giveCash ? formatCoins(trade.giveCash) : ''].filter(Boolean).join(' + ')}` : '',
      trade.getProps.length || trade.getCash ? `${to.name} gave ${[names(trade.getProps), trade.getCash ? formatCoins(trade.getCash) : ''].filter(Boolean).join(' + ')}` : '',
    ].filter(Boolean)
    this.log(`Trade done! ${parts.join('; ')}`, 'trade', from.id)
    // Offers that referenced properties which just changed hands are void.
    s.trades = s.trades.filter(
      (t) => t.giveProps.every((i) => holding(s, i).owner === t.from) && t.getProps.every((i) => holding(s, i).owner === t.to),
    )
  }

  // ---------------------------------------------------------------- end

  private finish(): void {
    const s = this.state
    s.status = 'finished'
    s.deadline = null
    s.ranking = s.players
      .map((p) => ({ id: p.id, worth: netWorth(s, p.id) }))
      .sort((a, b) => b.worth - a.worth)
    s.winner = s.ranking[0]?.id ?? null
    const w = s.players.find((p) => p.id === s.winner)
    if (w) this.log(`${w.name} rules the web! Final worth ${formatCoins(s.ranking[0].worth)}`, 'system', w.id)
    this.clearTimer()
  }

  // ---------------------------------------------------------------- timer

  /** Re-arms the turn timer. Call after every state change. */
  schedule() {
    const s = this.state
    this.clearTimer()
    if (s.status !== 'playing' || !s.current) {
      s.deadline = null
      return
    }
    const cur = this.player(s.current)
    const secs = !cur.connected ? DISCONNECTED_TURN_SECONDS : s.settings.turnSeconds
    if (!secs) {
      s.deadline = null
      return
    }
    s.deadline = Date.now() + secs * 1000
    this.timer = setTimeout(() => {
      try {
        this.autoAct()
      } catch (err) {
        console.error('autoAct failed', err)
        this.nextTurn()
      }
      this.schedule()
      this.onChange()
    }, secs * 1000)
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private autoAct(): void {
    const s = this.state
    const me = this.player(s.current!)
    this.log(`${me.name} ran out of time. Auto-playing`, 'system', me.id)
    switch (s.phase) {
      case 'roll':
        return this.roll()
      case 'jail':
        return this.rollInJail()
      case 'buy':
        return this.afterResolve()
      case 'signpost':
        return this.signpost(me, 'this')
      case 'portal':
        return this.portal(me, null)
      case 'manage':
        return this.nextTurn()
      case 'debt': {
        for (const i of propertiesOf(s, me.id)) {
          if (me.cash >= s.debt!.amount) break
          if (!holding(s, i).leased) this.lease(me, i)
        }
        if (me.cash >= s.debt!.amount) return this.payDebt(me)
        return this.goBankrupt(me, s.debt)
      }
    }
  }

  dispose() {
    this.clearTimer()
  }

  // ---------------------------------------------------------------- helpers

  player(id: string): Player {
    const p = this.state.players.find((x) => x.id === id)
    if (!p) throw new GameError('Player not found')
    return p
  }

  private others(me: Player) {
    return this.state.players.filter((p) => p.id !== me.id && !p.bankrupt)
  }

  log(text: string, kind: LogEntry['kind'] = 'system', player?: string) {
    const s = this.state
    s.log.push({ id: ++this.logSeq, t: Date.now(), text, kind, player })
    if (s.log.length > 200) s.log.splice(0, s.log.length - 200)
  }
}

function clamp(n: number, lo: number, hi: number) {
  const v = Number.isFinite(n) ? Math.round(n) : lo
  return Math.min(hi, Math.max(lo, v))
}

function cleanName(name: string) {
  return String(name ?? '')
    .replace(/[^\p{L}\p{N} _.\-!']/gu, '')
    .trim()
    .slice(0, 18)
}
