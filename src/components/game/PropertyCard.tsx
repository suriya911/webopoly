import { GROUPS, LEVEL_LABELS, TILES } from '@shared/board.ts'
import type { GameState } from '@shared/types.ts'
import { buildCost, holding, ownsFullGroup } from '@shared/rules.ts'
import { cn } from '@/lib/utils'
import { CoinIcon } from './bits'

/** A property card styled after the printed deck. */
export function PropertyCard({ tile, state, compact }: { tile: number; state: GameState; compact?: boolean }) {
  const t = TILES[tile]
  const card = t.card
  if (!card) return null
  const g = GROUPS[card.group]
  const h = holding(state, tile)
  const fullSet = h.owner ? ownsFullGroup(state, h.owner, card.group) : false
  const rows = LEVEL_LABELS.map((label, i) => ({ label: i === 0 ? 'Rent' : label, rent: card.rent[i], lease: card.lease[i] }))

  return (
    <div
      className="relative flex overflow-hidden rounded-xl border bg-black text-white shadow-2xl"
      style={{ borderColor: g.color, boxShadow: `0 0 0 1px ${g.color}, 0 10px 40px -10px ${g.glow}` }}
    >
      <div
        className="flex w-10 shrink-0 items-center justify-center"
        style={{ background: `linear-gradient(180deg, ${g.color}33, transparent)` }}
      >
        <span
          className="font-comic text-2xl whitespace-nowrap text-shadow-comic [writing-mode:vertical-rl] rotate-180"
          style={{ color: g.color }}
        >
          {card.name}
        </span>
      </div>
      {!compact && (
        <div className="relative hidden w-28 shrink-0 sm:block">
          <img src={`/tiles/t${String(tile).padStart(2, '0')}.webp`} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black" />
        </div>
      )}
      <div className="flex-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] tracking-widest uppercase opacity-60">{g.name}</div>
            <div className="font-comic text-3xl leading-none" style={{ color: g.color }}>
              <span className="inline-flex items-center gap-1">
                <CoinIcon className="size-6" />
                {card.price.toLocaleString('en-US')}
              </span>
            </div>
          </div>
          <div
            className="grid size-9 place-items-center rounded-md font-comic text-2xl"
            style={{ color: g.color, textShadow: `0 0 10px ${g.glow}` }}
          >
            {card.group}
          </div>
        </div>
        <div className="mt-1 text-xs opacity-80">
          Build <span className="font-mono">{buildCost(state, tile).toLocaleString('en-US')}</span> / level
        </div>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase opacity-60">
              <th className="text-left font-normal">Level</th>
              <th className="text-right font-normal">Rent</th>
              <th className="text-right font-normal">Lease</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((r, i) => {
              const active = h.owner && h.level === i
              return (
                <tr key={r.label} className={cn('border-t border-white/5', active && 'bg-white/10 font-bold')}>
                  <td className="py-0.5 font-sans">
                    {r.label}
                    {i === 0 && fullSet && <span className="ml-1 text-[10px] text-amber-300">x2 full set</span>}
                  </td>
                  <td className="text-right" style={{ color: active ? g.color : undefined }}>
                    {r.rent.toLocaleString('en-US')}
                  </td>
                  <td className="text-right opacity-70">{r.lease.toLocaleString('en-US')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
