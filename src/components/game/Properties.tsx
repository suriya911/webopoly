import { useState } from 'react'
import { Building2, Sparkles, Undo2 } from 'lucide-react'
import { GROUPS, TILES, groupMembers, type GroupId } from '@shared/board.ts'
import type { GameState, Items, Player } from '@shared/types.ts'
import {
  ROUND_TILES,
  SET_BONUS,
  SET_BONUS_MIN_CARDS,
  buildBlocker,
  buildCost,
  holding,
  leasedBy,
  ownedInGroup,
  propertiesOf,
  rentCollector,
} from '@shared/rules.ts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useStore } from '@/store'
import { useAct } from './ActionPanel'
import { PlayerAvatar } from './bits'
import { PropertyCard } from './PropertyCard'

const FREE_PHASES = ['roll', 'manage']

function withTip(tip: string | null, node: React.ReactNode) {
  return tip ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{node}</span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  ) : (
    node
  )
}

function PropertyActions({ state, me, tile, size = 'sm' }: { state: GameState; me: string; tile: number; size?: 'sm' | 'default' }) {
  const { run, busy } = useAct()
  const h = holding(state, tile)
  if (h.owner !== me || state.status !== 'playing') return null
  if (h.lease) return <div className="text-xs text-muted-foreground">Leased out. It can’t be changed until the lease ends.</div>
  const myTurn = state.current === me
  const canBuild = myTurn && FREE_PHASES.includes(state.phase)
  const offTurn = !myTurn ? 'Only on your turn' : null
  const blocker = buildBlocker(state, me, tile)

  return (
    <div className="flex flex-wrap gap-1.5">
      {withTip(
        offTurn ?? (canBuild ? blocker : 'Finish your current decision first'),
        <Button size={size} disabled={busy || !canBuild || !!blocker} onClick={() => run({ type: 'build', tile })}>
          <Building2 /> Build <span className="font-mono">{buildCost(tile).toLocaleString('en-US')}</span>
        </Button>,
      )}
    </div>
  )
}

function leaseLine(state: GameState, tile: number) {
  const l = holding(state, tile).lease
  if (!l) return null
  const lessee = state.players.find((p) => p.id === l.lessee)
  const lessor = state.players.find((p) => p.id === l.lessor)
  return `Leased to ${lessee?.name} from ${lessor?.name ?? 'the unowned pile'} · ${l.amount.toLocaleString('en-US')}/round · ${l.paymentsLeft} round${l.paymentsLeft === 1 ? '' : 's'} left`
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
              <DialogDescription className="flex flex-wrap items-center gap-2">
                {owner ? (
                  <>
                    <PlayerAvatar player={owner} className="size-5" /> Owned by {owner.name}
                  </>
                ) : (
                  'Unowned. Land on it to buy, or lease it at the Lease spot'
                )}
              </DialogDescription>
            </DialogHeader>
            <PropertyCard tile={tile} state={state} />
            {h?.lease && <Badge variant="secondary">{leaseLine(state, tile)}</Badge>}
            <p className="text-xs text-muted-foreground">
              You can only build here while your token stands on it. Holding {SET_BONUS_MIN_CARDS}+ of the {groupMembers(t.card.group).length} {GROUPS[t.card.group].name} gives each +
              {SET_BONUS.toLocaleString('en-US')} rent.
            </p>
            <PropertyActions state={state} me={me} tile={tile} size="default" />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

const ITEM_LABELS: Record<keyof Items, string> = {
  startCard: 'Start card',
  ultimateStartCard: 'Ultimate Start card',
  jailCard: 'Jail card',
  taxCardFree: 'Tax for card (free)',
  taxHouseFree: 'Tax for house & hotel (free)',
  sinister: 'Sinister 6 card',
  web: 'Web card',
  symbiote: 'Symbiote card',
}

function SymbioteDialog({ state, me, disabled }: { state: GameState; me: Player; disabled: boolean }) {
  const { run, busy } = useAct()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState('')
  const places = [...propertiesOf(state, me.id), ...leasedBy(state, me.id)].filter((i) => rentCollector(state, i) === me.id)
  const opponents = state.players.filter((p) => p.id !== me.id && !p.bankrupt && !p.inJail)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={disabled || !places.length || !opponents.length}>
          <Sparkles /> Use
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-comic text-2xl tracking-wider">Symbiote card</DialogTitle>
          <DialogDescription>Pull an opponent onto one of your places. They pay the rent.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {opponents.map((p) => (
            <button
              key={p.id}
              onClick={() => setTarget(p.id)}
              className={`flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm ${target === p.id ? 'border-primary bg-primary/15' : 'border-border hover:bg-white/5'}`}
            >
              <PlayerAvatar player={p} className="size-6" showSpeaking={false} /> {p.name}
            </button>
          ))}
        </div>
        <div className="grid gap-1.5">
          {places.map((i) => (
            <Button
              key={i}
              variant="outline"
              className="justify-between"
              disabled={busy || !target}
              onClick={async () => {
                await run({ type: 'useSymbiote', target, tile: i })
                setOpen(false)
              }}
            >
              <span>{TILES[i].name}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PowerCards({ state, player }: { state: GameState; player: Player }) {
  const { run, busy } = useAct()
  const it = player.items
  const e = player.effects
  const myTurn = state.current === player.id && FREE_PHASES.includes(state.phase)
  const held = (Object.keys(ITEM_LABELS) as (keyof Items)[]).filter((k) => it[k] > 0)
  const effects: string[] = []
  if (player.ultimateStart) effects.push('Ultimate START: 10,000 every round')
  if (e.rentPayments > 0) effects.push(`Pay ${e.rentMult}x rent on your next ${e.rentPayments} rent payment${e.rentPayments === 1 ? '' : 's'}`)
  if (player.reversing) effects.push('Spider-Verse trip: moving in reverse back to the Spider-Verse')
  if (e.setBoostTiles > 0) effects.push(`Set bonus +2,000 extra · ${Math.ceil(e.setBoostTiles / ROUND_TILES)} round(s) left`)
  if (e.sinisterTiles > 0) effects.push(`Sinister 6 active · ${Math.ceil(e.sinisterTiles / ROUND_TILES)} round(s) left`)
  if (e.skipStart) effects.push('No START reward next time')
  if (e.shopBan) effects.push('Banned from the Token Shop for 1 visit')
  if (player.glued) effects.push(`Glued at ${TILES[player.glued.tile].name} for ${player.glued.turns} more turn(s)`)
  if (!held.length && !effects.length) return null

  const use = (k: keyof Items) => {
    const disabled = busy || !myTurn
    switch (k) {
      case 'startCard':
      case 'ultimateStartCard':
        return (
          <Button size="sm" disabled={disabled} onClick={() => run({ type: 'useStartCard', ultimate: k === 'ultimateStartCard' })}>
            <Undo2 /> Go to START
          </Button>
        )
      case 'sinister':
        return (
          <Button size="sm" disabled={disabled} onClick={() => run({ type: 'activateSinister' })}>
            <Sparkles /> Activate
          </Button>
        )
      case 'symbiote':
        return <SymbioteDialog state={state} me={player} disabled={disabled} />
      default:
        return <span className="text-[11px] text-muted-foreground">auto</span>
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="font-comic text-base tracking-wider text-amber-300">Power cards & effects</div>
      {held.map((k) => (
        <div key={k} className="flex items-center justify-between gap-2 rounded-lg border bg-white/[0.03] px-2.5 py-1.5 text-sm">
          <span>
            {ITEM_LABELS[k]} {it[k] > 1 && <Badge variant="secondary">x{it[k]}</Badge>}
          </span>
          {use(k)}
        </div>
      ))}
      {effects.map((t) => (
        <div key={t} className="rounded-md bg-white/5 px-2.5 py-1 text-xs text-white/80">
          {t}
        </div>
      ))}
    </div>
  )
}

export function MyStuff({ state, me }: { state: GameState; me: string }) {
  const mine = propertiesOf(state, me)
  const renting = leasedBy(state, me)
  const player = state.players.find((p) => p.id === me)
  const set = useStore((s) => s.set)
  const groups = [...new Set(mine.map((i) => TILES[i].card!.group))] as GroupId[]
  return (
    <div className="space-y-4">
      {player && <PowerCards state={state} player={player} />}
      {!mine.length && !renting.length && (
        <div className="grid place-items-center gap-2 py-8 text-center text-sm text-muted-foreground">
          <Building2 className="size-8 opacity-40" />
          No cards yet. Land on one and buy it!
        </div>
      )}
      {groups.map((g) => {
        const count = ownedInGroup(state, me, g)
        return (
          <div key={g}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-comic text-base tracking-wider" style={{ color: GROUPS[g].color }}>
                {GROUPS[g].name}
              </span>
              <span className={count >= SET_BONUS_MIN_CARDS ? 'text-emerald-300' : 'text-muted-foreground'}>
                {count}/{groupMembers(g).length}
                {count >= SET_BONUS_MIN_CARDS ? ' · set bonus +2,000' : ''}
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
                        <span className="text-xs text-muted-foreground">{h.level === 4 ? 'Hotel' : h.level ? `${h.level} house${h.level > 1 ? 's' : ''}` : 'Base'}</span>
                      </button>
                      {h.lease && <div className="mt-1 text-[11px] text-sky-300">{leaseLine(state, i)}</div>}
                      <div className="mt-1.5">
                        <PropertyActions state={state} me={me} tile={i} />
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )
      })}
      {renting.length > 0 && (
        <div>
          <div className="mb-1 font-comic text-base tracking-wider text-sky-300">Cards I’m leasing</div>
          <div className="space-y-1.5">
            {renting.map((i) => (
              <button key={i} className="w-full rounded-lg border bg-white/[0.03] p-2 text-left text-sm hover:bg-white/5" onClick={() => set({ selectedTile: i })}>
                <div className="font-medium">{TILES[i].name}</div>
                <div className="text-[11px] text-muted-foreground">{leaseLine(state, i)}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
