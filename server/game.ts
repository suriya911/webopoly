import { randomInt } from 'node:crypto'
import { nanoid } from 'nanoid'
import { AVATARS, BOARD_SIZE, GROUPS, JAIL_INDEX, SPIDERVERSE_INDEX, TILES, type GroupId } from '../shared/board.ts'
import { CHANCE_TABLE, RANDOM_ROLL_TABLE, SHOP_ITEMS, UNO_TABLE, type FateEntry } from '../shared/cards.ts'
import {
  JAIL_BAIL,
  JAIL_DOUBLET_TRIES,
  JAIL_MAX_TURNS,
  LEASE_ROUNDS,
  MAX_LEVEL,
  ROUND_TILES,
  SPIDERVERSE_FEE,
  STARTING_CASH_MAX,
  STARTING_CASH_MIN,
  STARTING_CASH_STEP,
  WEB_GLUE_TURNS,
  buildBlocker,
  buildCost,
  formatCoins,
  holding,
  leaseAmount,
  leasedBy,
  netWorth,
  propertiesOf,
  rentCollector,
  rentFor,
  sellBuildingValue,
  sellPropertyValue,
  startReward,
  taxBill,
} from '../shared/rules.ts'
import {
  DEFAULT_SETTINGS,
  EMPTY_ITEMS,
  NO_EFFECTS,
  type Choice,
  type Debt,
  type GameAction,
  type GameState,
  type LogEntry,
  type Phase,
  type Player,
  type Settings,
  type ShopItem,
  type TradeOffer,
} from '../shared/types.ts'

export const MAX_PLAYERS = 6
export const MIN_PLAYERS = 2

const DISCONNECTED_TURN_SECONDS = 15
const OFFER_SECONDS = 45
const WEB_PROMPT_SECONDS = 25
const ULTIMATE_START_PRICE = SHOP_ITEMS.find((i) => i.id === 'ultimateStart')!.price

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
  private afterDebt: (() => void) | null = null
  private afterWeb: (() => void) | null = null
  /** Lease payments that fell due during the current move, settled before the landing resolves. */
  private dueLeases: number[] = []
  /** Whether the current player has used their dice roll this turn (START cards can be used before or after). */
  private hasRolled = false
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
      offerPending: [],
      dice: [1, 1],
      rollSeq: 0,
      doubles: 0,
      canRollAgain: false,
      holdings: {},
      debt: null,
      choice: null,
      fateDeck: null,
      webPrompt: null,
      criminalTile: null,
      log: [],
      lastCard: null,
      moves: [],
      money: [],
      trades: [],
      leaseOffers: [],
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
      jailRolls: 0,
      criminal: false,
      glued: null,
      ultimateStart: false,
      items: { ...EMPTY_ITEMS },
      effects: { ...NO_EFFECTS },
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
    s.startedAt = Date.now()
    s.endsAt = s.settings.timeLimitMinutes ? s.startedAt + s.settings.timeLimitMinutes * 60_000 : null
    s.turn = 0
    this.log(`Game on! ${s.players.map((p) => p.name).join(', ')} enter the web. ${s.players[0].name} goes first.`, 'system')
    // Everyone may buy the Ultimate START upgrade before the first roll.
    s.phase = 'offer'
    s.current = null
    s.offerPending = s.players.filter((p) => p.cash >= ULTIMATE_START_PRICE).map((p) => p.id)
    if (s.offerPending.length) this.log(`Ultimate START is on offer for ${formatCoins(ULTIMATE_START_PRICE)}. Each player can decide now`, 'system')
    else this.beginTurn(s.players[0].id)
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

    // Actions that are not tied to the current turn
    switch (action.type) {
      case 'ultimateOffer':
        return this.answerOffer(me, action.buy)
      case 'web':
        return this.answerWeb(me, action.use)
      case 'proposeTrade':
        return this.proposeTrade(playerId, action.offer)
      case 'respondTrade':
        return this.respondTrade(playerId, action.id, action.accept)
      case 'cancelTrade':
        s.trades = s.trades.filter((t) => !(t.id === action.id && t.from === playerId))
        return
      case 'respondLease':
        return this.respondLease(me, action.id, action.accept)
      case 'cancelLease':
        s.leaseOffers = s.leaseOffers.filter((o) => !(o.id === action.id && o.from === playerId))
        return
      case 'forfeit':
        return this.forfeit(playerId)
    }

    if (s.current !== playerId) throw new GameError('Not your turn')

    switch (action.type) {
      case 'roll':
        if (s.phase === 'jail') return this.rollInJail(me)
        this.expect('roll')
        return this.roll(me)
      case 'payBail':
        this.expect('jail')
        if (me.cash < JAIL_BAIL) throw new GameError('Not enough coins to pay your way out')
        this.addCash(me, -JAIL_BAIL)
        this.release(me, `${me.name} paid ${formatCoins(JAIL_BAIL)} to get out of jail`)
        s.phase = 'roll'
        return
      case 'useJailCard':
        this.expect('jail')
        if (me.items.jailCard < 1) throw new GameError('No jail card')
        me.items.jailCard--
        this.release(me, `${me.name} used a Jail card to walk out`)
        s.phase = 'roll'
        return
      case 'stayInJail':
        this.expect('jail')
        this.log(`${me.name} waits in jail (${me.jailTurns}/${JAIL_MAX_TURNS})`, 'jail', me.id)
        s.phase = 'manage'
        return
      case 'buy':
        this.expect('buy')
        return this.buy(me)
      case 'pass':
        this.expect('buy')
        this.log(`${me.name} passed on ${TILES[me.pos].name}`, 'money', me.id)
        return this.afterResolve()
      case 'rollFate':
        this.expect('fate')
        return this.rollFate(me)
      case 'choose':
        this.expect('choose')
        return this.choose(me, action.tile)
      case 'shopBuy':
        this.expect('shop')
        return this.shopBuy(me, action.item)
      case 'shopLeave':
        this.expect('shop')
        this.log(`${me.name} leaves the Token Shop`, 'move', me.id)
        return this.afterResolve()
      case 'spiderverse':
        this.expect('spiderverse')
        return this.spiderverse(me, action.power)
      case 'leaseUnowned':
        this.expect('leaseSpot')
        return this.leaseUnowned(me, action.tile, action.level)
      case 'proposeLease':
        this.expect('leaseSpot')
        return this.proposeLease(me, action.tile, action.with)
      case 'leaveLeaseSpot':
        this.expect('leaseSpot')
        return this.afterResolve()
      case 'build':
        this.expectFree()
        return this.build(me, action.tile)
      case 'sellBuilding':
        this.expectFree(true)
        return this.sellBuilding(me, action.tile)
      case 'sellProperty':
        this.expectFree(true)
        return this.sellProperty(me, action.tile)
      case 'useStartCard':
        this.expectFree()
        return this.useStartCard(me, action.ultimate)
      case 'useReverse':
        this.expectFree()
        if (me.items.reverse < 1) throw new GameError('No Reverse card')
        me.items.reverse--
        this.log(`${me.name} reverses through the multiverse back to the Spider-Verse spot`, 'move', me.id)
        this.teleport(me, SPIDERVERSE_INDEX)
        return this.resolveLanding(me)
      case 'activateSinister':
        this.expectFree()
        if (me.items.sinister < 1) throw new GameError('No Sinister 6 card')
        me.items.sinister--
        me.effects.sinisterTiles = 2 * ROUND_TILES
        this.log(`${me.name} activated the Sinister 6 card: +2,000 rent on their "6" cards for 2 rounds`, 'card', me.id)
        return
      case 'useSymbiote':
        this.expectFree()
        return this.useSymbiote(me, action.target, action.tile)
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

  /** Free actions (build, power cards) are allowed while no decision is pending. */
  private expectFree(allowDebt = false) {
    const ok: Phase[] = allowDebt ? ['roll', 'manage', 'debt', 'buy', 'jail'] : ['roll', 'manage']
    if (!ok.includes(this.state.phase)) throw new GameError('Finish your current decision first')
  }

  // ---------------------------------------------------------------- turn flow

  private answerOffer(me: Player, buy: boolean) {
    const s = this.state
    if (s.phase !== 'offer' || !s.offerPending.includes(me.id)) throw new GameError('No offer waiting for you')
    s.offerPending = s.offerPending.filter((id) => id !== me.id)
    if (buy) {
      if (me.cash < ULTIMATE_START_PRICE) throw new GameError('Not enough coins')
      this.addCash(me, -ULTIMATE_START_PRICE)
      me.ultimateStart = true
      this.log(`${me.name} bought Ultimate START: 10,000 every lap!`, 'build', me.id)
    } else {
      this.log(`${me.name} skipped Ultimate START`, 'system', me.id)
    }
    if (!s.offerPending.length) this.beginTurn(s.players[0].id)
  }

  private beginTurn(id: string) {
    const s = this.state
    const p = this.player(id)
    s.current = id
    s.doubles = 0
    s.canRollAgain = false
    s.debt = null
    s.choice = null
    s.fateDeck = null
    s.webPrompt = null
    s.criminalTile = null
    this.afterDebt = null
    this.afterWeb = null
    this.dueLeases = []
    this.hasRolled = false
    p.effects.rentPending = false

    if (p.glued) {
      const { tile } = p.glued
      p.glued.turns--
      const left = p.glued.turns
      if (left <= 0) p.glued = null
      this.hasRolled = true
      s.phase = 'manage'
      const collector = this.findActive(rentCollector(s, tile))
      const rent = rentFor(s, tile, p.id)
      if (!collector || rent === 0) {
        this.log(`${p.name} is stuck in the web at ${TILES[tile].name}, but no rent is due`, 'move', p.id)
        return
      }
      this.log(`${p.name} is glued at ${TILES[tile].name} and owes ${collector.name} ${formatCoins(rent)} (${left} more turn${left === 1 ? '' : 's'})`, 'money', p.id)
      this.charge(p, rent, { to: collector.id }, `Web rent to ${collector.name}`, () => (s.phase = 'manage'))
      return
    }

    if (p.inJail) {
      if (p.jailTurns >= JAIL_MAX_TURNS) {
        this.release(p, `${p.name} served ${JAIL_MAX_TURNS} turns and leaves jail`)
        s.phase = 'roll'
        return
      }
      p.jailTurns++
      s.phase = 'jail'
      return
    }
    s.phase = 'roll'
  }

  private nextTurn() {
    const s = this.state
    if (s.status !== 'playing') return
    const cur = s.players.find((p) => p.id === s.current)
    if (cur && cur.effects.rentTurns > 0 && !cur.effects.rentPending) cur.effects.rentTurns--
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
    if (me.bankrupt || s.status !== 'playing') return
    s.choice = null
    s.fateDeck = null
    const again = (!this.hasRolled || s.canRollAgain) && !me.inJail && !me.glued
    s.phase = again ? 'roll' : 'manage'
    if (again && this.hasRolled) this.log(`Doublet! ${me.name} rolls again`, 'move', me.id)
  }

  private roll(me: Player): void {
    const s = this.state
    const [a, b] = this.throwDice()
    this.hasRolled = true
    const isDouble = a === b
    this.log(`${me.name} rolled ${a} + ${b} = ${a + b}${isDouble ? ' (doublet)' : ''}`, 'move', me.id)
    if (isDouble) {
      s.doubles++
      if (s.doubles >= 3) {
        this.log(`Three doublets in a row! ${me.name} goes to jail`, 'jail', me.id)
        return this.sendToJail(me)
      }
    }
    s.canRollAgain = isDouble
    this.moveBy(me, a + b)
    this.resolveLanding(me)
  }

  private rollInJail(me: Player): void {
    const s = this.state
    if (me.jailRolls >= JAIL_DOUBLET_TRIES) throw new GameError('You have used all 3 doublet chances')
    me.jailRolls++
    const [a, b] = this.throwDice()
    this.hasRolled = true
    if (a === b) {
      this.release(me, `${me.name} rolled a doublet (${a} + ${b}) and breaks out of jail!`)
      s.canRollAgain = false
      this.moveBy(me, a + b)
      return this.resolveLanding(me)
    }
    this.log(`${me.name} rolled ${a} + ${b}, no doublet (chance ${me.jailRolls}/${JAIL_DOUBLET_TRIES})`, 'jail', me.id)
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
    me.jailRolls = 0
    me.criminal = true
    this.log(`${text}. Criminal card: no buying or building on the first spot they land on`, 'jail', me.id)
  }

  private sendToJail(me: Player) {
    const s = this.state
    this.teleport(me, JAIL_INDEX)
    me.inJail = true
    me.jailTurns = 0
    me.jailRolls = 0
    me.glued = null
    s.canRollAgain = false
    s.doubles = 0
    this.hasRolled = true
    s.phase = 'manage'
  }

  // ---------------------------------------------------------------- movement

  private moveBy(me: Player, steps: number) {
    const path: number[] = []
    const dir = Math.sign(steps)
    let pos = me.pos
    for (let i = 0; i < Math.abs(steps); i++) {
      pos = (pos + dir + BOARD_SIZE) % BOARD_SIZE
      path.push(pos)
      if (dir > 0 && pos === 0) this.paySalary(me)
    }
    me.pos = pos
    if (dir > 0) this.travel(me, steps)
    this.pushMove({ seq: ++this.eventSeq, playerId: me.id, path })
  }

  /** Move forward (clockwise) to a tile, collecting START if it is crossed. */
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

  /** Counts forward travel for "rounds": timed card effects and lease payments. */
  private travel(me: Player, tiles: number) {
    const e = me.effects
    e.sinisterTiles = Math.max(0, e.sinisterTiles - tiles)
    e.setBoostTiles = Math.max(0, e.setBoostTiles - tiles)
    for (const i of leasedBy(this.state, me.id)) {
      const lease = this.state.holdings[i].lease!
      lease.progress += tiles
      while (lease.progress >= ROUND_TILES && lease.paymentsLeft > 0) {
        lease.progress -= ROUND_TILES
        this.dueLeases.push(i)
      }
    }
  }

  private paySalary(me: Player) {
    if (me.effects.skipStart) {
      me.effects.skipStart = false
      this.log(`${me.name} reaches START but gets no reward this time (UNO card)`, 'money', me.id)
      return
    }
    const amount = startReward(this.state, me)
    if (!amount) return
    this.addCash(me, amount)
    this.log(`${me.name} ${me.ultimateStart ? 'hits Ultimate START' : 'reaches START'}: +${formatCoins(amount)}`, 'money', me.id)
  }

  // ---------------------------------------------------------------- landing

  private resolveLanding(me: Player): void {
    const due = this.dueLeases.splice(0)
    const next = (k: number): void => {
      if (me.bankrupt) return
      if (k >= due.length) return this.landOn(me)
      const tile = due[k]
      const lease = this.state.holdings[tile]?.lease
      if (!lease || lease.lessee !== me.id) return next(k + 1)
      lease.paymentsLeft--
      const lessor = this.findActive(lease.lessor)
      const to = lessor && !lessor.inJail ? lessor.id : undefined
      const amount = lease.amount
      this.log(
        `${me.name} pays ${formatCoins(amount)} lease for ${TILES[tile].name} to ${lessor ? lessor.name : 'the bank'}${lessor?.inJail ? ' (in jail: no income, goes to the bank)' : ''}`,
        'money',
        me.id,
      )
      if (lease.paymentsLeft <= 0) this.endLease(tile)
      if (this.charge(me, amount, { to }, `Lease for ${TILES[tile].name}`, () => next(k + 1))) next(k + 1)
    }
    next(0)
  }

  private landOn(me: Player): void {
    const s = this.state
    const tile = TILES[me.pos]
    if (me.criminal) {
      me.criminal = false
      s.criminalTile = me.pos
    }
    switch (tile.kind) {
      case 'property': {
        const h = holding(s, tile.index)
        if (!h.owner && !h.lease) {
          if (s.criminalTile === tile.index) {
            this.log(`${me.name} holds a Criminal card and can't buy ${tile.name}`, 'jail', me.id)
            return this.afterResolve()
          }
          s.phase = 'buy'
          return
        }
        const collectorId = rentCollector(s, tile.index)
        if (collectorId === me.id) {
          this.log(`${me.name} is home at ${tile.name}`, 'move', me.id)
          return this.afterResolve()
        }
        const collector = this.findActive(collectorId)
        const rent = rentFor(s, tile.index, me.id)
        if (!collector || rent === 0) {
          this.log(`${tile.name}: no rent due${collector?.inJail ? ` (${collector.name} is in jail, no income)` : ''}`, 'money', me.id)
          return this.afterResolve()
        }
        this.log(`${me.name} owes ${collector.name} ${formatCoins(rent)} rent for ${tile.name}`, 'money', me.id)
        const after = () => this.offerWeb(collector, me, tile.index, () => this.afterResolve())
        if (this.charge(me, rent, { to: collector.id }, `Rent to ${collector.name}`, after)) after()
        return
      }
      case 'chance':
      case 'uno':
        s.fateDeck = tile.kind
        s.phase = 'fate'
        return
      case 'spiderverse':
        if (me.cash >= SPIDERVERSE_FEE) {
          s.phase = 'spiderverse'
          return
        }
        this.log(`${me.name} can't afford the Spider-Verse (${formatCoins(SPIDERVERSE_FEE)})`, 'move', me.id)
        return this.afterResolve()
      case 'tax':
        return this.payTax(me)
      case 'jail':
        this.log(`${me.name} landed on Jail and is locked up!`, 'jail', me.id)
        return this.sendToJail(me)
      case 'shop':
        if (me.effects.shopBan) {
          me.effects.shopBan = false
          this.log(`${me.name} is banned from the Token Shop this visit`, 'card', me.id)
          return this.afterResolve()
        }
        s.phase = 'shop'
        return
      case 'lease':
        s.phase = 'leaseSpot'
        return
      case 'start':
        return this.afterResolve()
    }
  }

  private payTax(me: Player) {
    const bill = taxBill(this.state, me.id)
    let amount = 0
    const notes: string[] = []
    if (bill.cardTax) {
      if (me.items.taxCardFree > 0) {
        me.items.taxCardFree--
        notes.push('card tax waived')
      } else amount += bill.cardTax
    }
    if (bill.buildingTax) {
      if (me.items.taxHouseFree > 0) {
        me.items.taxHouseFree--
        notes.push('house & hotel tax waived')
      } else amount += bill.buildingTax
    }
    const detail = `${bill.cards} card${bill.cards === 1 ? '' : 's'}, ${bill.houses} house${bill.houses === 1 ? '' : 's'}, ${bill.hotels} hotel${bill.hotels === 1 ? '' : 's'}`
    this.log(`${me.name} pays ${formatCoins(amount)} tax (${detail}${notes.length ? `; ${notes.join(', ')}` : ''})`, 'money', me.id)
    if (!amount) return this.afterResolve()
    if (this.charge(me, amount, {}, 'Tax', () => this.afterResolve())) this.afterResolve()
  }

  // ---------------------------------------------------------------- web card

  /** After rent is paid, the collector may spend a Web card to glue the payer in place. */
  private offerWeb(collector: Player, victim: Player, tile: number, then: () => void) {
    const s = this.state
    if (collector.items.web < 1 || collector.inJail || collector.bankrupt || victim.glued || victim.bankrupt || victim.inJail) return then()
    s.webPrompt = { owner: collector.id, victim: victim.id, tile }
    s.phase = 'web'
    this.afterWeb = then
  }

  private answerWeb(me: Player, use: boolean) {
    const s = this.state
    const prompt = s.webPrompt
    if (s.phase !== 'web' || !prompt || prompt.owner !== me.id) throw new GameError('No Web card decision for you')
    const victim = this.player(prompt.victim)
    if (use) {
      me.items.web--
      victim.glued = { tile: prompt.tile, turns: WEB_GLUE_TURNS }
      if (victim.id === s.current) s.canRollAgain = false
      this.log(`${me.name} webs ${victim.name} to ${TILES[prompt.tile].name} for ${WEB_GLUE_TURNS} more turns!`, 'card', me.id)
    } else {
      this.log(`${me.name} keeps their Web card for later`, 'card', me.id)
    }
    s.webPrompt = null
    const then = this.afterWeb
    this.afterWeb = null
    then?.()
  }

  // ---------------------------------------------------------------- fate (CHANCE / UNO)

  private rollFate(me: Player) {
    const s = this.state
    const deck = s.fateDeck!
    const [a, b] = this.throwDice()
    const total = a + b
    const entry = (deck === 'chance' ? CHANCE_TABLE : UNO_TABLE)[total]
    s.fateDeck = null
    this.showCard(me, deck, total, entry)
    this.applyFate(me, entry)
  }

  private showCard(me: Player, deck: 'chance' | 'uno' | 'random', roll: number, entry: FateEntry) {
    const label = deck === 'chance' ? 'CHANCE' : deck === 'uno' ? 'UNO' : 'Random roll'
    this.state.lastCard = { seq: ++this.eventSeq, playerId: me.id, deck, roll, title: entry.title, text: entry.text }
    this.log(`${me.name} rolled ${roll} on ${label}: ${entry.title}. ${entry.text}`, 'card', me.id)
  }

  private applyFate(me: Player, entry: FateEntry): void {
    const s = this.state
    const e = entry.effect
    const done = () => this.afterResolve()
    switch (e.kind) {
      case 'goTo':
        this.advanceTo(me, e.tile)
        return this.resolveLanding(me)
      case 'surrender': {
        const tiles = propertiesOf(s, me.id).filter((i) => !holding(s, i).lease)
        if (!tiles.length) {
          this.log(`${me.name} has no card to surrender`, 'card', me.id)
          return done()
        }
        return this.ask({ kind: 'surrender', tiles, prompt: 'Pick one of your cards to surrender to the bank', optional: false })
      }
      case 'payEach': {
        const others = this.others(me)
        const total = e.amount * others.length
        if (!total) return done()
        if (me.cash >= total) {
          for (const o of others) this.transfer(me, o, e.amount)
          return done()
        }
        this.enterDebt({ amount: total, to: null, split: others.map((o) => o.id), reason: entry.title }, done)
        return
      }
      case 'collectEach':
        for (const o of this.others(me)) this.forceCharge(o, e.amount, me, entry.title)
        return done()
      case 'rentMult':
        me.effects.rentMult = e.mult
        me.effects.rentTurns = e.turns
        me.effects.rentPending = true
        return done()
      case 'jail':
        return this.sendToJail(me)
      case 'setBoost':
        me.effects.setBoostTiles = 2 * ROUND_TILES
        return done()
      case 'pay':
        if (this.charge(me, e.amount, {}, entry.title, done)) done()
        return
      case 'collect':
        this.addCash(me, e.amount)
        return done()
      case 'item':
        me.items[e.item]++
        return done()
      case 'shopBan':
        me.effects.shopBan = true
        return done()
      case 'skipStart':
        me.effects.skipStart = true
        return done()
      case 'yourPlace': {
        const tiles = [...propertiesOf(s, me.id), ...leasedBy(s, me.id)].filter((i) => i !== me.pos)
        if (!tiles.length) {
          this.log(`${me.name} has no place of their own to go to`, 'card', me.id)
          return done()
        }
        return this.ask({ kind: 'yourPlace', tiles, prompt: 'Pick one of your places to jump to', optional: false })
      }
      case 'destroyOwn': {
        const tiles = propertiesOf(s, me.id).filter((i) => holding(s, i).level > 0 && !holding(s, i).lease)
        if (!tiles.length) {
          this.log(`${me.name} has no house or hotel to destroy. Lucky!`, 'card', me.id)
          return done()
        }
        return this.ask({ kind: 'destroyOwn', tiles, prompt: 'Pick one of your houses or hotels to destroy', optional: false })
      }
      case 'breakOther': {
        const tiles = Object.entries(s.holdings)
          .filter(([, h]) => h.owner && h.owner !== me.id && h.level > 0 && !h.lease)
          .map(([i]) => Number(i))
        if (!tiles.length) {
          this.log('No other player has a house to break', 'card', me.id)
          return done()
        }
        return this.ask({ kind: 'breakOther', tiles, prompt: 'Pick another player’s house or hotel to break', optional: false })
      }
    }
  }

  private ask(choice: Choice) {
    this.state.choice = choice
    this.state.phase = 'choose'
  }

  private choose(me: Player, tile: number | null): void {
    const s = this.state
    const c = s.choice!
    if (tile === null) {
      if (!c.optional) throw new GameError('You must pick one')
      return this.afterResolve()
    }
    if (!c.tiles.includes(tile)) throw new GameError('Pick one of the highlighted spots')
    s.choice = null
    const name = TILES[tile].name
    switch (c.kind) {
      case 'surrender':
        delete s.holdings[tile]
        this.dropOffersFor([tile])
        this.log(`${me.name} surrendered ${name} to the bank`, 'card', me.id)
        return this.afterResolve()
      case 'destroyOwn':
      case 'breakOther': {
        const h = s.holdings[tile]
        const was = h.level === MAX_LEVEL ? 'hotel' : 'a house'
        h.level--
        const owner = this.player(h.owner!)
        this.log(`${me.name} destroyed ${was} on ${owner.name}'s ${name}`, 'build', me.id)
        return this.afterResolve()
      }
      case 'yourPlace':
        this.log(`${me.name} jumps to their place: ${name}`, 'move', me.id)
        this.teleport(me, tile)
        return this.afterResolve()
      case 'teleport':
        this.log(`${me.name} teleports to ${name}`, 'move', me.id)
        this.teleport(me, tile)
        return this.resolveLanding(me)
    }
  }

  // ---------------------------------------------------------------- token shop

  private shopBuy(me: Player, id: ShopItem) {
    const s = this.state
    const item = SHOP_ITEMS.find((i) => i.id === id)
    if (!item) throw new GameError('Unknown item')
    if (item.requiresUltimate && !me.ultimateStart) throw new GameError('Only Ultimate START owners can buy this')
    if (item.requiresGroups && !item.requiresGroups.some((g) => propertiesOf(s, me.id).some((i) => TILES[i].card?.group === g)))
      throw new GameError(`You need at least one ${groupLabel(item.requiresGroups)} card`)
    if (id === 'ultimateStart' && me.ultimateStart) throw new GameError('You already own Ultimate START')
    if (me.cash < item.price) throw new GameError('Not enough coins')
    this.addCash(me, -item.price)
    this.log(`${me.name} bought ${item.name} for ${formatCoins(item.price)}`, 'build', me.id)
    if (id === 'ultimateStart') {
      me.ultimateStart = true
      return
    }
    if (id === 'random') {
      const roll = rollDie()
      const entry = RANDOM_ROLL_TABLE[roll]
      this.showCard(me, 'random', roll, entry)
      return this.applyFate(me, entry)
    }
    me.items[id]++
  }

  private useStartCard(me: Player, ultimate: boolean) {
    const key = ultimate ? 'ultimateStartCard' : 'startCard'
    if (me.items[key] < 1) throw new GameError(`No ${ultimate ? 'Ultimate Start' : 'Start'} card`)
    me.items[key]--
    this.log(`${me.name} used a ${ultimate ? 'Ultimate Start' : 'Start'} card and swings to START`, 'card', me.id)
    this.teleport(me, 0)
    this.paySalary(me)
    this.afterResolve()
  }

  private useSymbiote(me: Player, targetId: string, tile: number) {
    const s = this.state
    if (me.items.symbiote < 1) throw new GameError('No Symbiote card')
    const target = this.findActive(targetId)
    if (!target || target.id === me.id) throw new GameError('Pick an opponent')
    if (target.inJail) throw new GameError(`${target.name} is in jail`)
    if (rentCollector(s, tile) !== me.id) throw new GameError('Pick one of your places')
    me.items.symbiote--
    this.teleport(target, tile)
    const rent = rentFor(s, tile, target.id)
    this.log(`${me.name}'s Symbiote drags ${target.name} to ${TILES[tile].name}: rent ${formatCoins(rent)}`, 'card', me.id)
    target.glued = target.glued && target.glued.tile !== tile ? null : target.glued
    const resume = s.phase
    if (rent) this.forceCharge(target, rent, me, 'Symbiote rent')
    if (!target.bankrupt) this.offerWeb(me, target, tile, () => (s.phase = resume))
  }

  // ---------------------------------------------------------------- spider-verse

  private spiderverse(me: Player, power: 'teleport' | 'reverse' | 'jail' | null) {
    if (power === null) {
      this.log(`${me.name} leaves the Spider-Verse alone`, 'move', me.id)
      return this.afterResolve()
    }
    if (me.cash < SPIDERVERSE_FEE) throw new GameError('Not enough coins')
    this.addCash(me, -SPIDERVERSE_FEE)
    if (power === 'teleport') {
      this.log(`${me.name} pays ${formatCoins(SPIDERVERSE_FEE)} for Teleport Power`, 'card', me.id)
      const tiles = TILES.map((t) => t.index).filter((i) => i !== SPIDERVERSE_INDEX)
      return this.ask({ kind: 'teleport', tiles, prompt: 'Teleport Power: pick any spot on the board', optional: false })
    }
    if (power === 'reverse') {
      me.items.reverse++
      this.log(`${me.name} pays ${formatCoins(SPIDERVERSE_FEE)} for a Reverse card (return to the Spider-Verse spot on a later turn)`, 'card', me.id)
    } else {
      me.items.jailCard++
      this.log(`${me.name} pays ${formatCoins(SPIDERVERSE_FEE)} for a Jail card (jail at no cost)`, 'card', me.id)
    }
    this.afterResolve()
  }

  // ---------------------------------------------------------------- leases

  private leaseUnowned(me: Player, tile: number, level: number) {
    const s = this.state
    const card = TILES[tile].card
    if (!card) throw new GameError('Not a property')
    const h = holding(s, tile)
    if (h.owner || h.lease) throw new GameError('That card is not in the unowned pile')
    if (!Number.isInteger(level) || level < 0 || level > MAX_LEVEL) throw new GameError('Pick base, 1-3 houses or hotel')
    s.holdings[tile] = {
      owner: null,
      level: 0,
      lease: { lessee: me.id, lessor: null, level, amount: leaseAmount(tile, level), paymentsLeft: LEASE_ROUNDS, progress: 0 },
    }
    this.log(`${me.name} leased ${card.name} (${levelName(level)}) from the bank for ${LEASE_ROUNDS} rounds at ${formatCoins(leaseAmount(tile, level))} per round`, 'trade', me.id)
  }

  private proposeLease(me: Player, tile: number, withId: string) {
    const s = this.state
    const other = this.findActive(withId)
    if (!other || other.id === me.id) throw new GameError('Pick another player')
    const h = holding(s, tile)
    if (!TILES[tile].card) throw new GameError('Not a property')
    if (h.lease) throw new GameError('That card is already leased')
    let lessor: string
    let lessee: string
    if (h.owner === me.id) [lessor, lessee] = [me.id, other.id]
    else if (h.owner === other.id) [lessor, lessee] = [other.id, me.id]
    else throw new GameError(`That card belongs to neither you nor ${other.name}`)
    if (s.leaseOffers.some((o) => o.tile === tile)) throw new GameError('There is already an offer for that card')
    s.leaseOffers.push({ id: nanoid(8), from: me.id, lessor, lessee, tile })
    this.log(
      `${me.name} proposes a lease: ${this.player(lessee).name} rents ${TILES[tile].name} from ${this.player(lessor).name} for ${LEASE_ROUNDS} rounds`,
      'trade',
      me.id,
    )
  }

  private respondLease(me: Player, id: string, accept: boolean) {
    const s = this.state
    const offer = s.leaseOffers.find((o) => o.id === id)
    if (!offer) throw new GameError('Offer not found')
    const responder = offer.from === offer.lessor ? offer.lessee : offer.lessor
    if (responder !== me.id) throw new GameError('This offer is not addressed to you')
    s.leaseOffers = s.leaseOffers.filter((o) => o.id !== id)
    if (!accept) {
      this.log(`${me.name} declined the lease for ${TILES[offer.tile].name}`, 'trade', me.id)
      return
    }
    const h = holding(s, offer.tile)
    const lessee = this.findActive(offer.lessee)
    if (h.owner !== offer.lessor || h.lease || !lessee) throw new GameError('This lease is no longer possible')
    h.lease = {
      lessee: offer.lessee,
      lessor: offer.lessor,
      level: h.level,
      amount: leaseAmount(offer.tile, h.level),
      paymentsLeft: LEASE_ROUNDS,
      progress: 0,
    }
    this.log(
      `Lease signed: ${lessee.name} rents ${TILES[offer.tile].name} (${levelName(h.level)}) from ${this.player(offer.lessor).name} for ${LEASE_ROUNDS} rounds at ${formatCoins(h.lease.amount)} per round`,
      'trade',
      me.id,
    )
  }

  private endLease(tile: number) {
    const s = this.state
    const h = s.holdings[tile]
    if (!h?.lease) return
    const lessee = s.players.find((p) => p.id === h.lease!.lessee)
    h.lease = null
    if (!h.owner) {
      delete s.holdings[tile]
      this.log(`The lease on ${TILES[tile].name} ended. The card returns to the unowned pile`, 'trade', lessee?.id)
    } else {
      this.log(`The lease on ${TILES[tile].name} ended. The card returns to ${this.player(h.owner).name}`, 'trade', lessee?.id)
    }
  }

  // ---------------------------------------------------------------- property

  private buy(me: Player) {
    const s = this.state
    const tile = TILES[me.pos]
    const h = holding(s, tile.index)
    if (!tile.card || h.owner || h.lease) throw new GameError('Nothing to buy here')
    if (s.criminalTile === tile.index) throw new GameError('Criminal card: you cannot buy here')
    if (me.cash < tile.card.price) throw new GameError('Not enough coins. Sell something first or pass')
    this.addCash(me, -tile.card.price)
    s.holdings[tile.index] = { owner: me.id, level: 0, lease: null }
    this.log(`${me.name} bought ${tile.name} for ${formatCoins(tile.card.price)}`, 'build', me.id)
    this.afterResolve()
  }

  private build(me: Player, tile: number) {
    const s = this.state
    const blocker = buildBlocker(s, me.id, tile)
    if (blocker) throw new GameError(blocker)
    const cost = buildCost(tile)
    this.addCash(me, -cost)
    const h = s.holdings[tile]
    h.level++
    this.log(`${me.name} built ${h.level === MAX_LEVEL ? 'a hotel' : `house #${h.level}`} on ${TILES[tile].name} for ${formatCoins(cost)}`, 'build', me.id)
  }

  private sellBuilding(me: Player, tile: number) {
    const h = holding(this.state, tile)
    if (h.owner !== me.id) throw new GameError('You do not own this')
    if (h.lease) throw new GameError('Leased cards cannot be changed')
    if (h.level < 1) throw new GameError('No building to sell')
    const value = sellBuildingValue(tile)
    h.level--
    this.addCash(me, value)
    this.log(`${me.name} sold a building on ${TILES[tile].name} for ${formatCoins(value)}`, 'money', me.id)
  }

  private sellProperty(me: Player, tile: number) {
    const s = this.state
    const h = holding(s, tile)
    if (h.owner !== me.id) throw new GameError('You do not own this')
    if (h.lease) throw new GameError('Leased cards cannot be sold')
    const value = sellPropertyValue(s, tile)
    delete s.holdings[tile]
    this.dropOffersFor([tile])
    this.addCash(me, value)
    this.log(`${me.name} sold ${TILES[tile].name} back to the bank for ${formatCoins(value)}`, 'money', me.id)
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

  /** Pays if possible and returns true; otherwise enters the debt phase and returns false. Only for the current player. */
  private charge(me: Player, amount: number, dest: { to?: string }, reason: string, then: () => void): boolean {
    if (me.cash >= amount) {
      this.addCash(me, -amount)
      if (dest.to) this.addCash(this.player(dest.to), amount)
      return true
    }
    this.enterDebt({ amount, to: dest.to ?? null, reason }, then)
    return false
  }

  /** Charges a player outside their own turn: sells their assets automatically, bankrupting them if needed. */
  private forceCharge(payer: Player, amount: number, to: Player | null, reason: string) {
    this.liquidate(payer, amount)
    if (payer.cash >= amount) {
      this.addCash(payer, -amount)
      if (to) this.addCash(to, amount)
      return
    }
    this.log(`${payer.name} can't cover ${formatCoins(amount)} for ${reason}`, 'money', payer.id)
    this.goBankrupt(payer, { amount, to: to?.id ?? null, reason })
  }

  /** Sells buildings, then properties, until the player has `target` cash. */
  private liquidate(p: Player, target: number) {
    const s = this.state
    const mine = () => propertiesOf(s, p.id).filter((i) => !holding(s, i).lease)
    for (const i of mine()) {
      while (p.cash < target && holding(s, i).level > 0) this.sellBuilding(p, i)
    }
    for (const i of mine()) {
      if (p.cash >= target) break
      this.sellProperty(p, i)
    }
  }

  private enterDebt(debt: Debt, then: () => void) {
    const s = this.state
    const me = this.player(s.current!)
    s.debt = debt
    s.phase = 'debt'
    this.afterDebt = then
    this.log(`${me.name} is short ${formatCoins(debt.amount - me.cash)} for ${debt.reason}. Sell buildings or cards, or declare bankruptcy`, 'money', me.id)
  }

  private payDebt(me: Player) {
    const s = this.state
    const debt = s.debt!
    if (me.cash < debt.amount) throw new GameError(`You still need ${formatCoins(debt.amount - me.cash)}`)
    if (debt.split) {
      const share = Math.floor(debt.amount / debt.split.length)
      for (const id of debt.split) {
        const o = this.findActive(id)
        if (o) this.transfer(me, o, share)
        else this.addCash(me, -share)
      }
    } else {
      this.addCash(me, -debt.amount)
      const to = this.findActive(debt.to)
      if (to) this.addCash(to, debt.amount)
    }
    this.log(`${me.name} settled ${formatCoins(debt.amount)} for ${debt.reason}`, 'money', me.id)
    s.debt = null
    const then = this.afterDebt
    this.afterDebt = null
    s.phase = 'manage'
    then?.()
  }

  private goBankrupt(me: Player, debt: Debt | null) {
    const s = this.state
    if (me.bankrupt) return
    const creditor = this.findActive(debt?.to)
    me.bankrupt = true
    me.inJail = false
    me.glued = null
    // Cards this player rents from others go back.
    for (const i of leasedBy(s, me.id)) this.endLease(i)
    for (const i of propertiesOf(s, me.id)) {
      const h = s.holdings[i]
      if (creditor) {
        h.owner = creditor.id
        if (h.lease) h.lease.lessor = creditor.id
      } else if (h.lease) {
        // The renter keeps it until the lease ends, then it returns to the unowned pile.
        h.owner = null
        h.lease.lessor = null
        h.lease.level = h.level
        h.level = 0
      } else {
        delete s.holdings[i]
      }
    }
    if (creditor) {
      this.transfer(me, creditor, Math.max(0, me.cash))
      this.log(`${me.name} is BANKRUPT! ${creditor.name} takes every coin and card`, 'system', me.id)
    } else {
      this.addCash(me, -me.cash)
      this.log(`${me.name} is BANKRUPT! Their cards return to the bank`, 'system', me.id)
    }
    s.trades = s.trades.filter((t) => t.from !== me.id && t.to !== me.id)
    s.leaseOffers = s.leaseOffers.filter((o) => o.lessor !== me.id && o.lessee !== me.id)
    s.offerPending = s.offerPending.filter((id) => id !== me.id)
    if (s.webPrompt && (s.webPrompt.owner === me.id || s.webPrompt.victim === me.id)) {
      s.webPrompt = null
      const then = this.afterWeb
      this.afterWeb = null
      if (s.current !== me.id) then?.()
    }
    if (s.current === me.id) {
      s.debt = null
      this.afterDebt = null
      this.nextTurn()
    } else if (s.players.filter((p) => !p.bankrupt).length <= 1) {
      this.finish()
    }
  }

  private forfeit(id: string) {
    const me = this.player(id)
    if (me.bankrupt || this.state.status !== 'playing') return
    this.log(`${me.name} forfeited`, 'system', me.id)
    this.goBankrupt(me, null)
    if (this.state.phase === 'offer' && !this.state.offerPending.length && !this.state.current) this.beginTurn(this.state.players.find((p) => !p.bankrupt)!.id)
  }

  // ---------------------------------------------------------------- trades

  private proposeTrade(from: string, offer: Omit<TradeOffer, 'id' | 'from'>) {
    const s = this.state
    const to = s.players.find((p) => p.id === offer.to && !p.bankrupt)
    if (!to || to.id === from) throw new GameError('Pick another active player')
    const giveCash = Math.max(0, Math.floor(offer.giveCash || 0))
    const getCash = Math.max(0, Math.floor(offer.getCash || 0))
    const tradable = (i: number, owner: string) => holding(s, i).owner === owner && !holding(s, i).lease
    const giveProps = [...new Set(offer.giveProps)].filter((i) => tradable(i, from))
    const getProps = [...new Set(offer.getProps)].filter((i) => tradable(i, to.id))
    if (!giveProps.length && !getProps.length && !giveCash && !getCash) throw new GameError('Empty trade')
    if (s.trades.filter((t) => t.from === from).length >= 3) throw new GameError('You already have 3 open offers')
    s.trades.push({ id: nanoid(8), from, to: to.id, giveProps, giveCash, getProps, getCash })
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
    const ok = (i: number, owner: string) => holding(s, i).owner === owner && !holding(s, i).lease
    const stillValid =
      !from.bankrupt &&
      trade.giveProps.every((i) => ok(i, from.id)) &&
      trade.getProps.every((i) => ok(i, to.id)) &&
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
    this.dropOffersFor([...trade.giveProps, ...trade.getProps])
  }

  /** Voids trade and lease offers that mention cards which changed hands. */
  private dropOffersFor(tiles: number[]) {
    const s = this.state
    const touched = new Set(tiles)
    s.trades = s.trades.filter((t) => ![...t.giveProps, ...t.getProps].some((i) => touched.has(i)))
    s.leaseOffers = s.leaseOffers.filter((o) => !touched.has(o.tile))
  }

  // ---------------------------------------------------------------- end

  private finish() {
    const s = this.state
    s.status = 'finished'
    s.deadline = null
    s.ranking = s.players.map((p) => ({ id: p.id, worth: netWorth(s, p.id) })).sort((a, b) => b.worth - a.worth)
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
    if (s.status !== 'playing') {
      s.deadline = null
      return
    }
    let secs: number
    if (s.phase === 'offer') secs = OFFER_SECONDS
    else if (s.phase === 'web') secs = WEB_PROMPT_SECONDS
    else if (!s.current) secs = 0
    else secs = this.player(s.current).connected ? s.settings.turnSeconds : DISCONNECTED_TURN_SECONDS
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
        if (this.state.current) this.nextTurn()
      }
      this.schedule()
      this.onChange()
    }, secs * 1000)
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private autoAct() {
    const s = this.state
    if (s.phase === 'offer') {
      for (const id of [...s.offerPending]) this.answerOffer(this.player(id), false)
      return
    }
    if (s.phase === 'web' && s.webPrompt) return this.answerWeb(this.player(s.webPrompt.owner), false)
    const me = this.player(s.current!)
    this.log(`${me.name} ran out of time. Auto-playing`, 'system', me.id)
    switch (s.phase) {
      case 'roll':
        return this.roll(me)
      case 'jail':
        if (me.jailRolls < JAIL_DOUBLET_TRIES) return this.rollInJail(me)
        s.phase = 'manage'
        return
      case 'buy':
        return this.afterResolve()
      case 'fate':
        return this.rollFate(me)
      case 'choose':
        return this.choose(me, s.choice!.optional ? null : s.choice!.tiles[0])
      case 'shop':
      case 'leaseSpot':
        return this.afterResolve()
      case 'spiderverse':
        return this.spiderverse(me, null)
      case 'manage':
        return this.nextTurn()
      case 'debt':
        this.liquidate(me, s.debt!.amount)
        if (me.cash >= s.debt!.amount) return this.payDebt(me)
        return this.goBankrupt(me, s.debt)
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

  private findActive(id: string | null | undefined): Player | undefined {
    return id ? this.state.players.find((p) => p.id === id && !p.bankrupt) : undefined
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

function levelName(level: number) {
  return ['base', '1 house', '2 houses', '3 houses', 'hotel'][level] ?? 'base'
}

function groupLabel(groups: GroupId[]) {
  return [...new Set(groups.map((g) => `"${GROUPS[g].symbol}"`))].join(' / ')
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
