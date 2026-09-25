import { ArrowDown01, ArrowUp10, Dices } from 'lucide-react'
import type { GameAction, GameState, StartRule } from '@shared/types.ts'
import { Button } from '@/components/ui/button'
import { useNow } from '@/hooks/misc'
import { cn } from '@/lib/utils'
import { PlayerAvatar } from './bits'

function Countdown({ deadline }: { deadline: number | null }) {
  const now = useNow(250)
  if (!deadline) return null
  const left = Math.max(0, Math.ceil((deadline - now) / 1000))
  return <span className={cn('font-mono tabular-nums', left <= 5 ? 'text-red-400' : 'text-white/70')}>{left}s</span>
}

const RULE_LABEL: Record<StartRule, string> = { highest: 'Highest roll starts', lowest: 'Lowest roll starts' }

/** Start of the game: everyone votes whether the highest or lowest roll goes first. */
export function VotePanel({ state, me, busy, run }: { state: GameState; me: string; busy: boolean; run: (a: GameAction) => void }) {
  const o = state.opening!
  const mine = o.votes[me]
  const active = state.players.filter((p) => !p.bankrupt)
  const count = (r: StartRule) => Object.values(o.votes).filter((v) => v === r).length
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3 text-center">
      <div className="font-comic text-2xl text-amber-300 text-shadow-comic">Who starts the game?</div>
      <div className="text-sm text-white/75">
        Vote now · <Countdown deadline={state.deadline} /> · majority wins (a tie means highest)
      </div>
      <div className="grid w-full grid-cols-2 gap-2">
        {(['highest', 'lowest'] as const).map((r) => (
          <Button
            key={r}
            variant={mine === r ? 'default' : 'outline'}
            disabled={busy}
            onClick={() => run({ type: 'vote', choice: r })}
            className="h-auto flex-col gap-1 py-3"
          >
            {r === 'highest' ? <ArrowUp10 className="size-6" /> : <ArrowDown01 className="size-6" />}
            <span className="font-comic text-lg tracking-wider">{RULE_LABEL[r]}</span>
            <span className="text-xs opacity-80">{count(r)} vote(s)</span>
          </Button>
        ))}
      </div>
      <div className="text-xs text-white/60">
        {Object.keys(o.votes).length}/{active.length} voted{mine ? ' · you can still change your vote' : ''}
      </div>
    </div>
  )
}

/** Everyone rolls; the highest (or lowest) roll takes the first turn. Ties roll again. */
export function OpeningRollPanel({ state, me, busy, run }: { state: GameState; me: string; busy: boolean; run: (a: GameAction) => void }) {
  const o = state.opening!
  const canRoll = o.rollers.includes(me) && o.rolls[me] === undefined
  const shown = state.players.filter((p) => !p.bankrupt)
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3 text-center">
      <div className="font-comic text-2xl text-amber-300 text-shadow-comic">{o.rule ? RULE_LABEL[o.rule] : ''}</div>
      <div className="text-sm text-white/75">
        {o.round > 1 ? 'Tie! The tied players roll again' : 'Everyone rolls 2 dice'} · <Countdown deadline={state.deadline} />
      </div>
      <div className="grid w-full gap-1.5">
        {shown.map((p) => {
          const inRound = o.rollers.includes(p.id)
          const roll = o.rolls[p.id]
          return (
            <div key={p.id} className={cn('flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-2 py-1', !inRound && 'opacity-40')}>
              <PlayerAvatar player={p} className="size-7" showSpeaking={false} />
              <span className="flex-1 text-left text-sm">{p.name}</span>
              <span className="font-mono text-lg font-bold text-amber-200">{roll ?? (inRound ? '…' : '')}</span>
            </div>
          )
        })}
      </div>
      {canRoll ? (
        <Button size="lg" className="h-12 px-7 font-comic text-xl tracking-wider" disabled={busy} onClick={() => run({ type: 'openingRoll' })}>
          <Dices className="size-5" /> Roll for first turn
        </Button>
      ) : (
        <div className="text-xs text-white/60">{o.rollers.includes(me) ? 'Waiting for the others to roll…' : 'Waiting for the tie-break…'}</div>
      )}
    </div>
  )
}
