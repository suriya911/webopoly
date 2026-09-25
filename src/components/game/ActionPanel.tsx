import { useState } from 'react'
import { ArrowRight, Building2, Dices, DoorOpen, Gavel, Hourglass, KeyRound, ShoppingBag, Sparkles, Undo2, X } from 'lucide-react'
import { toast } from 'sonner'
import { GROUPS, LEVEL_LABELS, PROPERTY_INDEXES, TILES } from '@shared/board.ts'
import { SHOP_ITEMS } from '@shared/cards.ts'
import type { GameAction, GameState, Player } from '@shared/types.ts'
import {
  JAIL_BAIL,
  buildBlocker,
  buildCost,
  JAIL_DOUBLET_TRIES,
  JAIL_MAX_TURNS,
  LEASE_ROUNDS,
  SPIDERVERSE_FEE,
  holding,
  leaseAmount,
  propertiesOf,
  sellPropertyValue,
} from '@shared/rules.ts'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { act } from '@/store'
import { Coins } from './bits'
import { PropertyCard } from './PropertyCard'

export function useAct() {
  const [busy, setBusy] = useState(false)
  const run = async (action: GameAction) => {
    if (busy) return
    setBusy(true)
    try {
      await act(action)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return { run, busy }
}

const PHASE_WAIT: Record<GameState['phase'], string> = {
  offer: 'is deciding on Ultimate START',
  roll: 'is about to roll',
  jail: 'is plotting a jailbreak',
  buy: 'is deciding whether to buy',
  choose: 'is making a choice',
  shop: 'is shopping at the Token Shop',
  spiderverse: 'is in the Spider-Verse',
  leaseSpot: 'is at the Lease spot',
  web: 'is waiting on a Web card',
  manage: 'is managing their empire',
  debt: 'is scrambling to pay a debt',
}

function BigButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      size="lg"
      className={cn('h-11 px-5 font-comic text-lg tracking-wider shadow-[0_6px_0_rgb(0_0_0/0.45)] active:translate-y-0.5 active:shadow-none', className)}
      {...props}
    />
  )
}

const Title = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('text-center font-comic text-xl text-shadow-comic', className)}>{children}</div>
)

function Waiting({ text }: { text: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2 text-center text-sm text-white/80">
      <Hourglass className="size-4 shrink-0 animate-pulse" />
      <span>{text}</span>
    </div>
  )
}

export function ActionPanel({ state, me, animating }: { state: GameState; me: string; animating: boolean }) {
  const { run, busy } = useAct()
  const player = state.players.find((p) => p.id === me)
  if (!player) return null
  const disabled = busy || animating

  // Game start: everyone decides on Ultimate START
  if (state.phase === 'offer') {
    if (!state.offerPending.includes(me)) return <Waiting text={`Waiting for ${state.offerPending.length} player(s) to decide on Ultimate START…`} />
    return (
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <Title className="text-amber-300">Ultimate START?</Title>
        <p className="text-sm text-white/80">
          Pay <Coins value={100_000} /> once and collect <b>10,000</b> instead of 5,000 every time you cross or land on START.
        </p>
        {player.cash - 100_000 < 20_000 && (
          <p className="text-xs text-amber-300">Careful: that leaves you only {(player.cash - 100_000).toLocaleString('en-US')} coins to start with.</p>
        )}
        <div className="flex gap-2">
          <BigButton onClick={() => run({ type: 'ultimateOffer', buy: true })} disabled={busy || player.cash < 100_000}>
            Buy it
          </BigButton>
          <BigButton variant="secondary" onClick={() => run({ type: 'ultimateOffer', buy: false })} disabled={busy}>
            No thanks
          </BigButton>
        </div>
      </div>
    )
  }

  // A Web card decision belongs to the card holder, even on someone else's turn
  if (state.phase === 'web' && state.webPrompt) {
    const w = state.webPrompt
    const victim = state.players.find((p) => p.id === w.victim)
    if (w.owner !== me) return <Waiting text={`${state.players.find((p) => p.id === w.owner)?.name} may use a Web card…`} />
    return (
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <Title className="text-sky-300">Use your Web card?</Title>
        <p className="text-sm text-white/80">
          Glue <b>{victim?.name}</b> at <b>{TILES[w.tile].name}</b> for 3 more turns. They pay you rent every turn.
        </p>
        <div className="flex gap-2">
          <BigButton onClick={() => run({ type: 'web', use: true })} disabled={busy}>
            Web them!
          </BigButton>
          <BigButton variant="secondary" onClick={() => run({ type: 'web', use: false })} disabled={busy}>
            Not now
          </BigButton>
        </div>
      </div>
    )
  }

  const current = state.players.find((p) => p.id === state.current)
  if (!current) return null
  if (state.current !== me)
    return (
      <Waiting
        text={
          <>
            <b className="text-white">{current.name}</b> {PHASE_WAIT[state.phase]}…
          </>
        }
      />
    )
  if (player.bankrupt) return null
  const tile = TILES[player.pos]

  switch (state.phase) {
    case 'roll':
      return (
        <div className="flex flex-col items-center gap-2">
          {player.reversing && (
            <div className="max-w-xs text-center text-xs text-fuchsia-300">
              Spider-Verse trip: you move <b>backward</b> and stop on the Spider-Verse, then roll again to go forward.
            </div>
          )}
          <BigButton onClick={() => run({ type: 'roll' })} disabled={disabled} className="h-14 px-8 text-2xl">
            <Dices className="size-6" /> {player.reversing ? 'Roll (reverse)' : 'Roll dice'}
          </BigButton>
          <QuickCards player={player} disabled={disabled} run={run} />
          <div className="text-[11px] text-white/60">Press Space · build or use power cards from My Stuff</div>
        </div>
      )

    case 'jail': {
      const triesLeft = JAIL_DOUBLET_TRIES - player.jailRolls
      return (
        <div className="flex flex-col items-center gap-2 text-center">
          <Title className="text-sky-300">
            In jail · turn {player.jailTurns}/{JAIL_MAX_TURNS}
          </Title>
          <div className="max-w-xs text-xs text-white/70">
            No income while you’re inside. A doublet frees you and you move now ({triesLeft} of {JAIL_DOUBLET_TRIES} chances left, one per turn). Paying or a Jail card
            frees you, but you move on your next turn.
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {triesLeft > 0 && (
              <BigButton onClick={() => run({ type: 'roll' })} disabled={disabled}>
                <Dices /> Roll for a doublet
              </BigButton>
            )}
            <BigButton variant="secondary" onClick={() => run({ type: 'payBail' })} disabled={disabled || player.cash < JAIL_BAIL}>
              <KeyRound /> Pay <Coins value={JAIL_BAIL} className="font-sans text-sm" />
            </BigButton>
            {player.items.jailCard > 0 && (
              <BigButton variant="secondary" onClick={() => run({ type: 'useJailCard' })} disabled={disabled}>
                <DoorOpen /> Jail card ({player.items.jailCard})
              </BigButton>
            )}
            <BigButton variant="ghost" onClick={() => run({ type: 'stayInJail' })} disabled={disabled}>
              Stay
            </BigButton>
          </div>
        </div>
      )
    }

    case 'buy': {
      const price = tile.card?.price ?? 0
      const short = player.cash < price
      return (
        <div className="flex w-full max-w-md flex-col items-center gap-3">
          <PropertyCard tile={player.pos} state={state} compact />
          <div className="flex gap-2">
            <BigButton onClick={() => run({ type: 'buy' })} disabled={disabled || short}>
              Buy for <Coins value={price} className="font-sans text-base" />
            </BigButton>
            <BigButton variant="secondary" onClick={() => run({ type: 'pass' })} disabled={disabled}>
              Pass
            </BigButton>
          </div>
          {short && <div className="text-xs text-amber-300">Not enough coins to buy this one.</div>}
        </div>
      )
    }

    case 'choose': {
      const c = state.choice!
      return (
        <div className="flex max-w-sm flex-col items-center gap-2 text-center">
          <Title className="text-sky-300">{c.prompt}</Title>
          <div className="text-xs text-white/70">Click one of the glowing spots on the board.</div>
          {c.optional && (
            <BigButton variant="secondary" onClick={() => run({ type: 'choose', tile: null })} disabled={disabled}>
              <X /> Skip
            </BigButton>
          )}
        </div>
      )
    }

    case 'shop':
      return <ShopPanel state={state} player={player} disabled={disabled} run={run} />

    case 'spiderverse':
      return (
        <div className="flex max-w-md flex-col items-center gap-2 text-center">
          <Title className="text-fuchsia-300">
            <Sparkles className="mr-1 inline size-5" /> Spider-Verse
          </Title>
          <div className="text-sm text-white/80">
            Pay <Coins value={SPIDERVERSE_FEE} /> to jump to <b>your own card</b> or an <b>unowned card</b>. From your next turn you come back in reverse until you stop on the
            Spider-Verse, then roll again to go forward. No jail on the way back.
          </div>
          <div className="flex gap-2">
            <BigButton onClick={() => run({ type: 'spiderverse', go: true })} disabled={disabled || player.cash < SPIDERVERSE_FEE}>
              Jump
            </BigButton>
            <BigButton variant="secondary" onClick={() => run({ type: 'spiderverse', go: false })} disabled={disabled}>
              Stay
            </BigButton>
          </div>
        </div>
      )

    case 'leaseSpot':
      return <LeasePanel state={state} player={player} disabled={disabled} run={run} />

    case 'manage': {
      const bt = state.buildTile
      const blocker = bt !== null ? buildBlocker(state, me, bt) : null
      return (
        <div className="flex flex-col items-center gap-2">
          {bt !== null && (
            <Button variant="outline" disabled={disabled || !!blocker} onClick={() => run({ type: 'build', tile: bt })} title={blocker ?? undefined}>
              <Building2 /> Build {holding(state, bt).level === 3 ? 'hotel' : 'a house'} on {TILES[bt].name} · <Coins value={buildCost(bt)} />
            </Button>
          )}
          <BigButton onClick={() => run({ type: 'endTurn' })} disabled={disabled} className="h-12 px-7 text-xl">
            End turn <ArrowRight className="size-5" />
          </BigButton>
          <QuickCards player={player} disabled={disabled} run={run} />
          <div className="text-[11px] text-white/60">Press Enter · build, trade or use power cards before ending</div>
        </div>
      )
    }

    case 'debt':
      return <DebtPanel state={state} player={player} disabled={disabled} run={run} />

    default:
      return null
  }
}

/** One-tap buttons for power cards that can be used before or after rolling. */
function QuickCards({ player, disabled, run }: { player: Player; disabled: boolean; run: (a: GameAction) => void }) {
  const it = player.items
  if (!it.startCard && !it.ultimateStartCard && !it.sinister) return null
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {it.startCard > 0 && (
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => run({ type: 'useStartCard', ultimate: false })}>
          <Undo2 /> Start card ({it.startCard})
        </Button>
      )}
      {it.ultimateStartCard > 0 && (
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => run({ type: 'useStartCard', ultimate: true })}>
          <Undo2 /> Ultimate Start card ({it.ultimateStartCard})
        </Button>
      )}
      {it.sinister > 0 && (
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => run({ type: 'activateSinister' })}>
          <Sparkles /> Activate Sinister 6
        </Button>
      )}
    </div>
  )
}

function ShopPanel({ state, player, disabled, run }: { state: GameState; player: Player; disabled: boolean; run: (a: GameAction) => void }) {
  const mine = propertiesOf(state, player.id)
  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-2">
      <Title className="text-amber-300">
        <ShoppingBag className="mr-1 inline size-5" /> Token Shop
      </Title>
      <div className="grid max-h-[min(19rem,40vh)] w-full gap-1 overflow-y-auto pr-1">
        {SHOP_ITEMS.map((item) => {
          let blocked: string | null = null
          if (item.requiresUltimate && !player.ultimateStart) blocked = 'Ultimate START owners only'
          else if (item.id === 'ultimateStart' && player.ultimateStart) blocked = 'Already owned'
          else if (item.requiresGroups && !mine.some((i) => item.requiresGroups!.includes(TILES[i].card!.group)))
            blocked = `Needs a “${GROUPS[item.requiresGroups[0]].symbol}” card`
          else if (player.cash < item.price) blocked = 'Not enough coins'
          return (
            <div key={item.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-left">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{item.name}</div>
                <div className="text-[11px] leading-tight text-white/60">{blocked ?? item.text}</div>
              </div>
              <Button size="sm" disabled={disabled || !!blocked} onClick={() => run({ type: 'shopBuy', item: item.id })}>
                <Coins value={item.price} />
              </Button>
            </div>
          )
        })}
      </div>
      <BigButton variant="secondary" onClick={() => run({ type: 'shopLeave' })} disabled={disabled}>
        Leave without buying
      </BigButton>
    </div>
  )
}

function LeasePanel({ state, player, disabled, run }: { state: GameState; player: Player; disabled: boolean; run: (a: GameAction) => void }) {
  const unowned = PROPERTY_INDEXES.filter((i) => !holding(state, i).owner && !holding(state, i).lease)
  const others = state.players.filter((p) => p.id !== player.id && !p.bankrupt)
  const [tile, setTile] = useState<string>('')
  const [level, setLevel] = useState('0')
  const [other, setOther] = useState<string>(others[0]?.id ?? '')
  const [card, setCard] = useState<string>('')
  const pending = new Set(state.leaseOffers.map((o) => o.tile))
  const swappable = [...propertiesOf(state, player.id), ...(other ? propertiesOf(state, other) : [])].filter((i) => !holding(state, i).lease && !pending.has(i))

  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-2">
      <Title className="text-emerald-300">Lease for {LEASE_ROUNDS} rounds</Title>
      <div className="grid w-full gap-2 sm:grid-cols-2">
        <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/40 p-2">
          <div className="text-xs font-semibold">From the unowned pile</div>
          <Select value={tile} onValueChange={setTile}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={unowned.length ? 'Pick a card' : 'None left'} />
            </SelectTrigger>
            <SelectContent>
              {unowned.map((i) => (
                <SelectItem key={i} value={String(i)}>
                  {TILES[i].name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEVEL_LABELS.map((l, k) => (
                <SelectItem key={l} value={String(k)}>
                  {l}
                  {tile ? ` · ${leaseAmount(Number(tile), k).toLocaleString('en-US')}/round` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="w-full"
            disabled={disabled || !tile}
            onClick={() => {
              run({ type: 'leaseUnowned', tile: Number(tile), level: Number(level) })
              setTile('')
            }}
          >
            Lease it
          </Button>
        </div>
        <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/40 p-2">
          <div className="text-xs font-semibold">With a player (both must agree)</div>
          <Select
            value={other}
            onValueChange={(v) => {
              setOther(v)
              setCard('')
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick a player" />
            </SelectTrigger>
            <SelectContent>
              {others.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={card} onValueChange={setCard}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={swappable.length ? 'Pick a card' : 'No cards'} />
            </SelectTrigger>
            <SelectContent>
              {swappable.map((i) => {
                const mineCard = holding(state, i).owner === player.id
                return (
                  <SelectItem key={i} value={String(i)}>
                    {mineCard ? 'Lease out my ' : 'Rent their '}
                    {TILES[i].name} · {leaseAmount(i, holding(state, i).level).toLocaleString('en-US')}/round
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="secondary"
            className="w-full"
            disabled={disabled || !card || !other}
            onClick={() => {
              run({ type: 'proposeLease', tile: Number(card), with: other })
              setCard('')
            }}
          >
            Send lease offer
          </Button>
        </div>
      </div>
      <div className="text-[11px] text-white/60">The renter pays the card’s lease value each round and collects its rent (no set bonus).</div>
      <BigButton variant="secondary" onClick={() => run({ type: 'leaveLeaseSpot' })} disabled={disabled}>
        Done
      </BigButton>
    </div>
  )
}

function DebtPanel({ state, player, disabled, run }: { state: GameState; player: Player; disabled: boolean; run: (a: GameAction) => void }) {
  const debt = state.debt!
  const mine = propertiesOf(state, player.id).filter((i) => !holding(state, i).lease)
  const short = Math.max(0, debt.amount - player.cash)
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-2 text-center">
      <Title className="text-red-400">
        You owe {debt.amount.toLocaleString('en-US')} for {debt.reason}
      </Title>
      <div className="text-sm text-white/80">
        Cash <Coins value={player.cash} /> · short <Coins value={short} className="text-red-300" />
      </div>
      {mine.length > 0 && (
        <div className="flex max-h-32 w-full flex-wrap justify-center gap-1 overflow-y-auto">
          {mine.map((i) => (
            <Button key={i} size="sm" variant="outline" disabled={disabled} onClick={() => run({ type: 'sellProperty', tile: i })}>
              Sell {TILES[i].name}
              {holding(state, i).level > 0 ? ` + ${holding(state, i).level === 4 ? 'hotel' : `${holding(state, i).level}H`}` : ''}{' '}
              <span className="font-mono text-emerald-300">+{sellPropertyValue(state, i).toLocaleString('en-US')}</span>
            </Button>
          ))}
        </div>
      )}
      <div className="text-[11px] text-white/60">Selling returns the card to the bank for its price plus everything you spent building on it.</div>
      <div className="flex gap-2">
        <BigButton onClick={() => run({ type: 'payDebt' })} disabled={disabled || short > 0}>
          Pay debt
        </BigButton>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <BigButton variant="destructive" disabled={disabled}>
              <Gavel /> Bankrupt
            </BigButton>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Declare bankruptcy?</AlertDialogTitle>
              <AlertDialogDescription>
                You will be out of the game. Your coins and cards go to {debt.to ? state.players.find((p) => p.id === debt.to)?.name : 'the bank'}. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep fighting</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => run({ type: 'bankrupt' })}>
                Declare bankruptcy
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
