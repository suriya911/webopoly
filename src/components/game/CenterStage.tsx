import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import type { CardEvent, GameState } from '@shared/types.ts'
import { useNow } from '@/hooks/misc'
import { sfx } from '@/lib/sfx'
import { useStore } from '@/store'
import { ActionPanel } from './ActionPanel'
import { Coins, PlayerAvatar, playerColor } from './bits'
import { Dice } from './Dice'

export function TurnTimer({ state }: { state: GameState }) {
  const now = useNow(250)
  if (!state.deadline) return null
  const total = (state.players.find((p) => p.id === state.current)?.connected ? state.settings.turnSeconds : 15) * 1000
  const left = Math.max(0, state.deadline - now)
  const pct = Math.min(100, (left / total) * 100)
  const urgent = left < 10_000
  return (
    <div className="flex items-center gap-2">
      <Clock className={`size-3.5 ${urgent ? 'animate-pulse text-red-400' : 'text-white/60'}`} />
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/15">
        <div className={`h-full rounded-full transition-[width] duration-300 ${urgent ? 'bg-red-500' : 'bg-sky-400'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-7 font-mono text-xs tabular-nums text-white/70">{Math.ceil(left / 1000)}s</span>
    </div>
  )
}

function CardPopup({ card, name, onClose }: { card: CardEvent; name: string; onClose: () => void }) {
  return (
    <motion.div
      className="absolute inset-0 z-30 grid cursor-pointer place-items-center bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
      title="Click to close"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ rotateY: 180, scale: 0.6 }}
        animate={{ rotateY: 0, scale: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 160, damping: 16 }}
        className="relative w-[78%] max-w-sm overflow-hidden rounded-2xl border-2 border-sky-300/70 bg-gradient-to-br from-[#12203f] via-[#0c1226] to-[#301018] p-5 text-center shadow-[0_0_60px_rgb(56_189_248/0.45)]"
      >
        <div className="web-bg absolute inset-0 opacity-60" />
        <div className="relative">
          <div className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-sky-400/20 font-comic text-3xl text-sky-300">?</div>
          <div className="text-[10px] tracking-[0.3em] text-sky-200/70 uppercase">Spider-Sense · {name}</div>
          <div className="mt-1 font-comic text-3xl text-white text-shadow-comic">{card.title}</div>
          <p className="mt-2 text-sm text-white/85">{card.text}</p>
          <p className="mt-3 text-[10px] text-white/40">tap to close</p>
        </div>
      </motion.div>
    </motion.div>
  )
}

export function CenterStage({ state, me, showActions, animating }: { state: GameState; me: string; showActions: boolean; animating: boolean }) {
  const current = state.players.find((p) => p.id === state.current)
  const reactions = useStore((s) => s.reactions)
  const [card, setCard] = useState<CardEvent | null>(null)
  const seenCard = useRef(state.lastCard?.seq ?? 0)

  useEffect(() => {
    const c = state.lastCard
    if (!c || c.seq === seenCard.current) return
    seenCard.current = c.seq
    // Let the token finish walking onto the ? tile first
    const show = setTimeout(() => {
      sfx.card()
      setCard(c)
    }, 1400)
    const hide = setTimeout(() => setCard((x) => (x?.seq === c.seq ? null : x)), 5000)
    return () => {
      clearTimeout(show)
      clearTimeout(hide)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastCard?.seq])

  const rolledSeq = state.rollSeq
  return (
    <div className="flex size-full flex-col items-center justify-between p-[3%] text-white">
      {/* Turn banner */}
      <div className="flex w-full items-center justify-between gap-2">
        <div className="font-comic text-[clamp(16px,2.6vw,34px)] leading-none tracking-wider text-red-500 text-shadow-comic">WEBOPOLY</div>
        {state.pot > 0 && state.settings.stashPot && (
          <div className="glass flex items-center gap-1 rounded-full px-2.5 py-1 text-xs" title="Spider-Sense Stash pot">
            Stash <Coins value={state.pot} />
          </div>
        )}
      </div>

      {current && (
        <motion.div
          key={current.id}
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="glass flex items-center gap-3 rounded-full py-1 pr-3 pl-1"
          style={{ boxShadow: `0 0 24px -6px ${playerColor(current.avatar)}` }}
        >
          <PlayerAvatar player={current} className="size-8" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">{current.id === me ? 'Your turn' : `${current.name}'s turn`}</div>
            <TurnTimer state={state} />
          </div>
        </motion.div>
      )}

      <Dice dice={state.dice} seq={rolledSeq} size={showActions ? 60 : 38} className="my-1" />

      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        {showActions && <ActionPanel state={state} me={me} animating={animating} />}
      </div>

      <AnimatePresence>{card && <CardPopup card={card} name={state.players.find((p) => p.id === card.playerId)?.name ?? ''} onClose={() => setCard(null)} />}</AnimatePresence>

      {/* Emoji reactions float up from the bottom */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <AnimatePresence>
          {reactions.map((r) => {
            const p = state.players.find((x) => x.id === r.from)
            return (
              <motion.div
                key={r.id}
                initial={{ y: 40, opacity: 0, x: `${(r.id * 37) % 70}%` }}
                animate={{ y: -260, opacity: [0, 1, 1, 0] }}
                transition={{ duration: 2.5, ease: 'easeOut' }}
                className="absolute bottom-0 left-[10%] flex flex-col items-center"
              >
                <span className="text-4xl drop-shadow-lg">{r.emoji}</span>
                <span className="rounded bg-black/60 px-1 text-[10px]">{p?.name}</span>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
