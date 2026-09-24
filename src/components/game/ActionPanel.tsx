import { useState } from 'react'
import { ArrowLeft, ArrowRight, Dices, DoorOpen, Gavel, Hourglass, KeyRound, Shuffle, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { TILES } from '@shared/board.ts'
import type { GameAction, GameState } from '@shared/types.ts'
import { PORTAL_FEE, holding, leasePayout, propertiesOf } from '@shared/rules.ts'
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
  roll: 'is about to roll',
  jail: 'is plotting a Raft escape',
  buy: 'is deciding whether to buy',
  signpost: 'is choosing a way',
  portal: 'is choosing a portal destination',
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

export function ActionPanel({ state, me, animating }: { state: GameState; me: string; animating: boolean }) {
  const { run, busy } = useAct()
  const current = state.players.find((p) => p.id === state.current)
  const player = state.players.find((p) => p.id === me)
  if (!current || !player) return null

  if (state.current !== me) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-white/80">
        <Hourglass className="size-4 animate-pulse" />
        <span>
          <b className="text-white">{current.name}</b> {PHASE_WAIT[state.phase]}…
        </span>
      </div>
    )
  }

  if (player.bankrupt) return null
  const disabled = busy || animating
  const tile = TILES[player.pos]

  switch (state.phase) {
    case 'roll':
      return (
        <div className="flex flex-col items-center gap-2">
          {state.canRollAgain && <div className="font-comic text-lg text-amber-300 text-shadow-comic">Doubles! Roll again</div>}
          <BigButton onClick={() => run({ type: 'roll' })} disabled={disabled} className="h-14 px-8 text-2xl">
            <Dices className="size-6" /> Roll dice
          </BigButton>
          <div className="text-[11px] text-white/60">Press Space · build or lease from My Stuff first</div>
        </div>
      )

    case 'jail':
      return (
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="font-comic text-xl text-sky-300 text-shadow-comic">Locked in The Raft ({player.jailTurns}/3)</div>
          <div className="flex flex-wrap justify-center gap-2">
            <BigButton onClick={() => run({ type: 'roll' })} disabled={disabled}>
              <Dices /> Roll doubles
            </BigButton>
            <BigButton variant="secondary" onClick={() => run({ type: 'payBail' })} disabled={disabled || player.cash < state.settings.bail}>
              <KeyRound /> Bail <Coins value={state.settings.bail} className="font-sans text-sm" />
            </BigButton>
            {player.jailCards > 0 && (
              <BigButton variant="secondary" onClick={() => run({ type: 'useJailCard' })} disabled={disabled}>
                <DoorOpen /> Pardon ({player.jailCards})
              </BigButton>
            )}
          </div>
        </div>
      )

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
          {short && <div className="text-xs text-amber-300">Not enough coins. Lease a property from My Stuff to afford it.</div>}
        </div>
      )
    }

    case 'signpost':
      return (
        <div className="flex flex-col items-center gap-2">
          <div className="font-comic text-xl text-amber-200 text-shadow-comic">Which way, web-head?</div>
          <div className="flex flex-col gap-1.5">
            {(
              [
                ['this', 'This Way', '3 spaces forward', ArrowRight],
                ['that', 'That Way', '3 spaces back', ArrowLeft],
                ['another', 'Another Way', 'Swing to the other signpost, +2,000', Shuffle],
              ] as const
            ).map(([choice, label, hint, Icon], k) => (
              <button
                key={choice}
                disabled={disabled}
                onClick={() => run({ type: 'signpost', choice })}
                className={cn(
                  'group flex items-center gap-3 rounded-md border border-amber-900/60 bg-gradient-to-b from-amber-200 to-amber-400 px-4 py-1.5 text-left text-amber-950 shadow-[0_4px_0_#78350f] transition hover:brightness-110 active:translate-y-0.5 active:shadow-none disabled:opacity-50',
                  k === 1 ? 'ml-6' : k === 2 ? 'ml-2' : '',
                )}
              >
                <Icon className="size-5" />
                <span>
                  <span className="block font-comic text-xl leading-none tracking-wider">{label}</span>
                  <span className="text-[11px] opacity-80">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )

    case 'portal':
      return (
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-2 font-comic text-xl text-fuchsia-300 text-shadow-comic">
            <Sparkles className="size-5" /> Multiverse Portal
          </div>
          <div className="text-sm text-white/80">
            Click any glowing property to jump there for <Coins value={PORTAL_FEE} />. Rent or buying applies.
          </div>
          <BigButton variant="secondary" onClick={() => run({ type: 'portal', target: null })} disabled={disabled}>
            <X /> Stay here
          </BigButton>
        </div>
      )

    case 'manage':
      return (
        <div className="flex flex-col items-center gap-2">
          <BigButton onClick={() => run({ type: 'endTurn' })} disabled={disabled} className="h-12 px-7 text-xl">
            End turn <ArrowRight className="size-5" />
          </BigButton>
          <div className="text-[11px] text-white/60">Press Enter · build houses, lease or trade before ending</div>
        </div>
      )

    case 'debt':
      return <DebtPanel state={state} me={me} disabled={disabled} run={run} />
  }
}

function DebtPanel({
  state,
  me,
  disabled,
  run,
}: {
  state: GameState
  me: string
  disabled: boolean
  run: (a: GameAction) => void
}) {
  const player = state.players.find((p) => p.id === me)!
  const debt = state.debt!
  const leaseable = propertiesOf(state, me).filter((i) => !holding(state, i).leased)
  const short = Math.max(0, debt.amount - player.cash)
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-2 text-center">
      <div className="font-comic text-xl text-red-400 text-shadow-comic">You owe {debt.amount.toLocaleString('en-US')} for {debt.reason}</div>
      <div className="text-sm text-white/80">
        Cash <Coins value={player.cash} /> · short <Coins value={short} className="text-red-300" />
      </div>
      {leaseable.length > 0 && (
        <div className="flex max-h-28 w-full flex-wrap justify-center gap-1 overflow-y-auto">
          {leaseable.map((i) => (
            <Button key={i} size="sm" variant="outline" disabled={disabled} onClick={() => run({ type: 'lease', tile: i })}>
              Lease {TILES[i].name} <span className="font-mono text-emerald-300">+{leasePayout(state, i).toLocaleString('en-US')}</span>
            </Button>
          ))}
        </div>
      )}
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
                You will be out of the game. Your coins and properties go to {debt.to ? state.players.find((p) => p.id === debt.to)?.name : 'the bank'}. This cannot be undone.
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
