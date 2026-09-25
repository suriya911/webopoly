import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Bug, Crown, Gavel, Lock, Mic, MicOff, Siren, WifiOff, Zap } from 'lucide-react'
import { GROUPS, TILES } from '@shared/board.ts'
import type { GameState } from '@shared/types.ts'
import { netWorth, propertiesOf } from '@shared/rules.ts'
import { sfx } from '@/lib/sfx'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import { Coins, PlayerAvatar, playerColor } from './bits'

interface Floater {
  seq: number
  delta: number
}

/** Shows +/- coin changes floating off each player's balance. */
function useMoneyFloaters(state: GameState, me: string | null) {
  const [floaters, setFloaters] = useState<Record<string, Floater[]>>({})
  const seen = useRef(state.money.at(-1)?.seq ?? 0)
  useEffect(() => {
    const fresh = state.money.filter((m) => m.seq > seen.current)
    if (!fresh.length) return
    seen.current = fresh.at(-1)!.seq
    const mine = fresh.filter((m) => m.playerId === me)
    if (mine.length) {
      const net = mine.reduce((a, m) => a + m.delta, 0)
      if (net > 0) sfx.coinIn()
      else if (net < 0) sfx.coinOut()
    }
    setFloaters((f) => {
      const next = { ...f }
      for (const m of fresh) next[m.playerId] = [...(next[m.playerId] ?? []), { seq: m.seq, delta: m.delta }]
      return next
    })
    const done = new Set(fresh.map((m) => m.seq))
    setTimeout(() => {
      setFloaters((f) => {
        const next: Record<string, Floater[]> = {}
        for (const [k, v] of Object.entries(f)) next[k] = v.filter((x) => !done.has(x.seq))
        return next
      })
    }, 1800)
  }, [state.money, me])
  return floaters
}

export function PlayersPanel({ state, me }: { state: GameState; me: string }) {
  const voice = useStore((s) => s.voice)
  const floaters = useMoneyFloaters(state, me)

  return (
    <div className="space-y-1.5">
      {state.players.map((p) => {
        const v = voice.find((x) => x.id === p.id)
        const props = propertiesOf(state, p.id)
        const isTurn = state.current === p.id && state.status === 'playing'
        return (
          <div
            key={p.id}
            className={cn(
              'relative flex items-center gap-3 rounded-xl border border-transparent bg-white/[0.03] p-2 transition',
              isTurn && 'border-white/15 bg-white/[0.08]',
              p.bankrupt && 'opacity-45 grayscale',
            )}
            style={isTurn ? { boxShadow: `inset 3px 0 0 ${playerColor(p.avatar)}` } : undefined}
          >
            <PlayerAvatar player={p} className="size-10" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <span className="truncate">{p.name}</span>
                {p.id === me && <span className="rounded bg-white/10 px-1 text-[10px] font-normal text-white/70">you</span>}
                {state.hostId === p.id && <Crown className="size-3.5 text-amber-300" aria-label="Host" />}
                {p.inJail && <Lock className="size-3.5 text-sky-300" aria-label="In jail" />}
                {p.ultimateStart && <Zap className="size-3.5 text-amber-300" aria-label="Ultimate START" />}
                {p.glued && <Bug className="size-3.5 text-sky-400" aria-label="Glued by a Web card" />}
                {p.criminal && <Siren className="size-3.5 text-red-400" aria-label="Criminal card" />}
                {!p.connected && <WifiOff className="size-3.5 text-red-400" aria-label="Disconnected" />}
                {p.bankrupt && <Gavel className="size-3.5 text-red-400" aria-label="Bankrupt" />}
              </div>
              <div className="flex items-center gap-2 text-xs text-white/70">
                <Coins value={p.cash} className="text-amber-200" />
                <span className="text-white/40">·</span>
                <span title="Net worth">NW {netWorth(state, p.id).toLocaleString('en-US')}</span>
              </div>
              {props.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-0.5">
                  {props.map((i) => (
                    <span
                      key={i}
                      title={TILES[i].name}
                      className="h-1.5 w-3 rounded-sm"
                      style={{ background: GROUPS[TILES[i].card!.group].color, opacity: state.holdings[i].lease ? 0.4 : 1 }}
                    />
                  ))}
                </div>
              )}
            </div>
            {v && (
              <div className="text-white/70" title={v.muted ? 'Muted' : 'In voice'}>
                {v.muted ? <MicOff className="size-4 text-red-400" /> : <Mic className="size-4 text-emerald-400" />}
              </div>
            )}
            <div className="pointer-events-none absolute top-1 right-10">
              <AnimatePresence>
                {(floaters[p.id] ?? []).map((f) => (
                  <motion.div
                    key={f.seq}
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: -14, opacity: 1 }}
                    exit={{ y: -26, opacity: 0 }}
                    transition={{ duration: 0.6 }}
                    className={cn('font-mono text-sm font-bold drop-shadow', f.delta > 0 ? 'text-emerald-400' : 'text-red-400')}
                  >
                    {f.delta > 0 ? '+' : '−'}
                    {Math.abs(f.delta).toLocaleString('en-US')}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )
      })}
    </div>
  )
}
