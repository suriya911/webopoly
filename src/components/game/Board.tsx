import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { GROUPS, TILES } from '@shared/board.ts'
import type { GameState } from '@shared/types.ts'
import { MAX_LEVEL, holding, rentFor } from '@shared/rules.ts'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CORNER, tileRect, tokenPoint, type Side } from '@/lib/geometry'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import { playerColor } from './bits'

const INNER_EDGE: Record<Exclude<Side, 'corner'>, string> = {
  top: 'bottom-0 inset-x-0 h-[14%] flex-row',
  bottom: 'top-0 inset-x-0 h-[14%] flex-row',
  left: 'right-0 inset-y-0 w-[14%] flex-col',
  right: 'left-0 inset-y-0 w-[14%] flex-col',
}

const TIP: Record<string, string> = {
  start: 'START · reward every round. Click for rules',
  uno: 'UNO ? · roll 2 dice for your fate. Click for rules',
  chance: 'CHANCE · This Way / That Way / Another Way. Click for rules',
  tax: 'Tax · per card, house and hotel. Click for rules',
  jail: 'Jail · up to 5 turns. Click for rules',
  shop: 'Token Shop · buy power cards. Click for rules',
  spiderverse: 'Spider-Verse · pay 15,000 for a power. Click for rules',
  lease: 'Lease · rent cards for 3 rounds. Click for rules',
}

function tileTip(state: GameState, i: number) {
  const t = TILES[i]
  if (t.kind !== 'property') return TIP[t.kind]
  const h = holding(state, i)
  const owner = state.players.find((p) => p.id === h.owner)
  const lessee = state.players.find((p) => p.id === h.lease?.lessee)
  return (
    <div className="space-y-0.5">
      <div className="font-semibold" style={{ color: GROUPS[t.card!.group].color }}>
        {t.name}
      </div>
      <div className="text-xs opacity-80">{GROUPS[t.card!.group].name}</div>
      <div className="text-xs">
        {owner ? `Owner: ${owner.name}` : lessee ? 'Unowned pile' : `For sale · ${t.card!.price.toLocaleString('en-US')}`}
        {lessee && ` · leased to ${lessee.name} (${h.lease!.paymentsLeft} rounds left)`}
      </div>
      {(owner || lessee) && <div className="text-xs">Rent {rentFor(state, i).toLocaleString('en-US')}</div>}
    </div>
  )
}

export function Board({
  state,
  children,
  pickable,
  onPick,
  pos,
  moving,
}: {
  state: GameState
  /** Animated token positions from useTokenPositions */
  pos: Record<string, number>
  moving: string | null
  children?: ReactNode
  /** Tiles that can be clicked for a pending choice (e.g. the portal) */
  pickable?: number[]
  onPick?: (tile: number) => void
}) {
  const openTile = (i: number) => {
    const t = TILES[i]
    if (t.kind === 'property') useStore.getState().set({ selectedTile: i })
    else useStore.getState().set({ ruleTopic: t.kind })
  }
  const current = state.players.find((p) => p.id === state.current)
  const alive = state.players.filter((p) => !p.bankrupt)

  // Group tokens by tile so they fan out instead of stacking
  const byTile = new Map<number, string[]>()
  for (const p of alive) {
    const t = pos[p.id] ?? p.pos
    byTile.set(t, [...(byTile.get(t) ?? []), p.id])
  }

  return (
    <div className="relative aspect-square w-full select-none overflow-hidden rounded-2xl shadow-[0_30px_80px_-20px_rgb(0_0_0/0.9)] ring-1 ring-white/10">
      <img src="/board.webp" alt="Webopoly board" className="absolute inset-0 size-full" draggable={false} />

      {/* Tiles */}
      {TILES.map((t) => {
        const r = tileRect(t.index)
        const h = holding(state, t.index)
        const owner = h.owner ? state.players.find((p) => p.id === h.owner) : undefined
        const lessee = h.lease ? state.players.find((p) => p.id === h.lease!.lessee) : undefined
        const marker = owner ?? lessee
        const level = h.lease && !h.owner ? h.lease.level : h.level
        const canPick = pickable?.includes(t.index)
        const here = current && (pos[current.id] ?? current.pos) === t.index && !moving
        return (
          <Tooltip key={t.index}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t.name}
                onClick={() => (canPick ? onPick?.(t.index) : openTile(t.index))}
                className={cn(
                  'absolute outline-none transition-[box-shadow,background-color] duration-300 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-sky-400',
                  canPick && 'tile-pick z-10',
                  pickable && !canPick && 'bg-black/55',
                  here && 'shadow-[inset_0_0_0_2px_rgb(255_255_255/0.85),0_0_22px_rgb(255_255_255/0.35)]',
                )}
                style={{ left: `${r.left}%`, top: `${r.top}%`, width: `${r.width}%`, height: `${r.height}%` }}
              >
                {lessee && (
                  <span className="absolute inset-0 grid place-items-center bg-black/35">
                    <span
                      className="-rotate-12 rounded border px-1 font-comic text-[clamp(7px,1.1vw,13px)] tracking-widest text-white"
                      style={{ borderColor: playerColor(lessee.avatar), background: 'rgb(0 0 0 / .65)' }}
                    >
                      LEASED
                    </span>
                  </span>
                )}
                {marker && r.side !== 'corner' && (
                  <span
                    className={cn('absolute flex items-center justify-center gap-[6%]', INNER_EDGE[r.side])}
                    style={{
                      background: owner
                        ? playerColor(owner.avatar)
                        : `repeating-linear-gradient(45deg, ${playerColor(marker.avatar)} 0 4px, transparent 4px 8px)`,
                      boxShadow: `0 0 10px ${playerColor(marker.avatar)}`,
                    }}
                  >
                    {level > 0 && level < MAX_LEVEL &&
                      Array.from({ length: level }, (_, k) => (
                        <span key={k} className="aspect-square h-[60%] max-h-[60%] max-w-[60%] rounded-[2px] bg-white shadow ring-1 ring-black/40" />
                      ))}
                    {level === MAX_LEVEL && (
                      <span className="aspect-square h-[85%] max-h-[85%] max-w-[85%] rounded-full bg-gradient-to-b from-yellow-200 to-amber-500 ring-1 ring-black/50" />
                    )}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-56">
              {tileTip(state, t.index)}
            </TooltipContent>
          </Tooltip>
        )
      })}

      {/* Center stage */}
      <div className="absolute overflow-hidden" style={{ inset: `${CORNER}%` }}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgb(0_0_0/0.25),rgb(0_0_0/0.8))]" />
        <div className="relative size-full">{children}</div>
      </div>

      {/* Tokens */}
      {alive.map((p) => {
        const tile = pos[p.id] ?? p.pos
        const group = byTile.get(tile) ?? [p.id]
        const pt = tokenPoint(tile, group.indexOf(p.id), group.length)
        const isMoving = moving === p.id
        const isCurrent = state.current === p.id
        return (
          <motion.div
            key={p.id}
            className="pointer-events-none absolute z-20"
            initial={false}
            animate={{ left: `${pt.x}%`, top: `${pt.y}%` }}
            transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.6 }}
            style={{ width: '4.6%', height: '4.6%', translateX: '-50%', translateY: '-50%' }}
          >
            <motion.div
              key={isMoving ? `${tile}` : 'idle'}
              initial={isMoving ? { y: '-45%', scale: 1.15 } : false}
              animate={{ y: 0, scale: isCurrent ? 1.12 : 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              className="size-full"
            >
              <img
                src={`/avatars/${p.avatar}.webp`}
                alt={p.name}
                className={cn('size-full rounded-full object-cover shadow-[0_6px_14px_rgb(0_0_0/0.7)]', p.inJail && 'grayscale')}
                style={{ boxShadow: `0 0 0 2.5px ${playerColor(p.avatar)}, 0 6px 14px rgb(0 0 0 / .7)` }}
                draggable={false}
              />
            </motion.div>
          </motion.div>
        )
      })}
    </div>
  )
}
