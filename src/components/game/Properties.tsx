import { Building2, HandCoins, Undo2 } from 'lucide-react'
import { GROUPS, TILES, groupMembers, type GroupId } from '@shared/board.ts'
import type { GameState } from '@shared/types.ts'
import { buildBlocker, buildCost, holding, leasePayout, ownedInGroup, propertiesOf, unleaseCost } from '@shared/rules.ts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useStore } from '@/store'
import { useAct } from './ActionPanel'
import { PlayerAvatar } from './bits'
import { PropertyCard } from './PropertyCard'

const MANAGE_PHASES = ['roll', 'jail', 'manage']
const LEASE_PHASES = ['roll', 'jail', 'manage', 'debt', 'buy']

function PropertyActions({ state, me, tile, size = 'sm' }: { state: GameState; me: string; tile: number; size?: 'sm' | 'default' }) {
  const { run, busy } = useAct()
  const h = holding(state, tile)
  if (h.owner !== me || state.status !== 'playing') return null
  const myTurn = state.current === me
  const canManage = myTurn && MANAGE_PHASES.includes(state.phase)
  const canLease = myTurn && LEASE_PHASES.includes(state.phase)
  const blocker = buildBlocker(state, me, tile)
  const offTurn = !myTurn ? 'Only on your turn' : null

  const withTip = (tip: string | null, node: React.ReactNode) =>
    tip ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>{node}</span>
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    ) : (
      node
    )

  return (
    <div className="flex flex-wrap gap-1.5">
      {!h.leased &&
        withTip(
          offTurn ?? (canManage ? blocker : 'Finish your current decision first'),
          <Button size={size} disabled={busy || !canManage || !!blocker} onClick={() => run({ type: 'build', tile })}>
            <Building2 /> Build <span className="font-mono">{buildCost(state, tile).toLocaleString('en-US')}</span>
          </Button>,
        )}
      {!h.leased &&
        withTip(
          offTurn,
          <Button size={size} variant="secondary" disabled={busy || !canLease} onClick={() => run({ type: 'lease', tile })}>
            <HandCoins /> Lease <span className="font-mono text-emerald-300">+{leasePayout(state, tile).toLocaleString('en-US')}</span>
          </Button>,
        )}
      {h.leased &&
        withTip(
          offTurn,
          <Button size={size} variant="secondary" disabled={busy || !canManage} onClick={() => run({ type: 'unlease', tile })}>
            <Undo2 /> Buy back <span className="font-mono">{unleaseCost(state, tile).toLocaleString('en-US')}</span>
          </Button>,
        )}
    </div>
  )
}

export function PropertyDialog({ state, me }: { state: GameState; me: string }) {
  const tile = useStore((s) => s.selectedTile)
  const set = useStore((s) => s.set)
  const t = tile !== null ? TILES[tile] : null
  const h = tile !== null ? holding(state, tile) : null
  const owner = h?.owner ? state.players.find((p) => p.id === h.owner) : null
  return (
    <Dialog open={tile !== null && !!t?.card} onOpenChange={(o) => !o && set({ selectedTile: null })}>
      <DialogContent className="sm:max-w-lg">
        {t?.card && tile !== null && (
          <>
            <DialogHeader>
              <DialogTitle className="font-comic text-2xl tracking-wider">{t.name}</DialogTitle>
              <DialogDescription className="flex items-center gap-2">
                {owner ? (
                  <>
                    <PlayerAvatar player={owner} className="size-5" /> Owned by {owner.name}
                    {h?.leased && <Badge variant="secondary">Leased</Badge>}
                  </>
                ) : (
                  'Unclaimed. Land on it to buy'
                )}
              </DialogDescription>
            </DialogHeader>
            <PropertyCard tile={tile} state={state} />
            <p className="text-xs text-muted-foreground">
              Build as soon as you own it. Owning all {groupMembers(t.card.group).length} {GROUPS[t.card.group].name} doubles land rent.
              Leasing pays the Lease column now; buying back costs +10%.
            </p>
            <PropertyActions state={state} me={me} tile={tile} size="default" />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function MyStuff({ state, me }: { state: GameState; me: string }) {
  const mine = propertiesOf(state, me)
  const player = state.players.find((p) => p.id === me)
  const set = useStore((s) => s.set)
  if (!mine.length) {
    return (
      <div className="grid place-items-center gap-2 py-10 text-center text-sm text-muted-foreground">
        <Building2 className="size-8 opacity-40" />
        No properties yet. Land on one and buy it!
        {player && player.jailCards > 0 && <Badge>Pardon cards: {player.jailCards}</Badge>}
      </div>
    )
  }
  const groups = [...new Set(mine.map((i) => TILES[i].card!.group))] as GroupId[]
  return (
    <div className="space-y-3">
      {player && player.jailCards > 0 && <Badge className="w-full justify-center">Get out of The Raft free × {player.jailCards}</Badge>}
      {groups.map((g) => (
        <div key={g}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-comic text-base tracking-wider" style={{ color: GROUPS[g].color }}>
              {GROUPS[g].name}
            </span>
            <span className="text-muted-foreground">
              {ownedInGroup(state, me, g)}/{groupMembers(g).length} owned
            </span>
          </div>
          <div className="space-y-1.5">
            {mine
              .filter((i) => TILES[i].card!.group === g)
              .map((i) => {
                const h = holding(state, i)
                return (
                  <div key={i} className="rounded-lg border bg-white/[0.03] p-2" style={{ borderLeft: `3px solid ${GROUPS[g].color}` }}>
                    <button className="flex w-full items-center justify-between text-left text-sm font-medium hover:underline" onClick={() => set({ selectedTile: i })}>
                      <span>{TILES[i].name}</span>
                      <span className="text-xs text-muted-foreground">
                        {h.leased ? 'Leased' : h.level === 4 ? 'Web HQ' : h.level ? `${h.level} house${h.level > 1 ? 's' : ''}` : 'Land'}
                      </span>
                    </button>
                    <div className="mt-1.5">
                      <PropertyActions state={state} me={me} tile={i} />
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      ))}
    </div>
  )
}
