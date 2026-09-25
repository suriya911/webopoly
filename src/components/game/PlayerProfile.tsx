import { GROUPS, TILES, groupMembers, type GroupId } from '@shared/board.ts'
import type { GameState, Items } from '@shared/types.ts'
import { ROUND_TILES, SET_BONUS_MIN_CARDS, holding, leasedBy, netWorth, ownedInGroup, propertiesOf } from '@shared/rules.ts'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useStore } from '@/store'
import { Coins, PlayerAvatar } from './bits'

const ITEM_NAMES: Record<keyof Items, string> = {
  startCard: 'Start card',
  ultimateStartCard: 'Ultimate Start card',
  jailCard: 'Jail card',
  taxCardFree: 'Tax for card',
  taxHouseFree: 'Tax for house & hotel',
  sinister: 'Sinister 6',
  web: 'Web',
  symbiote: 'Symbiote',
}

const levelText = (lvl: number) => (lvl === 4 ? 'Hotel' : lvl ? `${lvl}H` : 'Base')

function CardTile({ tile, state, note }: { tile: number; state: GameState; note?: string }) {
  const t = TILES[tile]
  const g = GROUPS[t.card!.group]
  const h = holding(state, tile)
  const set = useStore((s) => s.set)
  return (
    <button
      onClick={() => set({ selectedTile: tile, profileId: null })}
      className="group relative overflow-hidden rounded-lg border text-left transition hover:scale-[1.03]"
      style={{ borderColor: g.color, boxShadow: `0 0 12px -4px ${g.glow}` }}
    >
      <img src={`/tiles/t${String(t.art).padStart(2, '0')}.webp`} alt="" className="h-20 w-full object-cover opacity-80 group-hover:opacity-100" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-1.5">
        <div className="truncate font-comic text-sm leading-none tracking-wide" style={{ color: g.color }}>
          {t.name}
        </div>
        <div className="text-[10px] text-white/75">{note ?? (h.lease ? 'Leased out' : levelText(h.level))}</div>
      </div>
      <span className="absolute top-1 right-1 rounded bg-black/70 px-1 font-comic text-xs" style={{ color: g.color }}>
        {g.symbol}
      </span>
    </button>
  )
}

/** Opens when a player's row is clicked: everything they hold. */
export function PlayerProfile({ state }: { state: GameState }) {
  const id = useStore((s) => s.profileId)
  const set = useStore((s) => s.set)
  const p = state.players.find((x) => x.id === id)
  const owned = p ? propertiesOf(state, p.id) : []
  const renting = p ? leasedBy(state, p.id) : []
  const groups = [...new Set(owned.map((i) => TILES[i].card!.group))] as GroupId[]
  const items = p ? (Object.keys(ITEM_NAMES) as (keyof Items)[]).filter((k) => p.items[k] > 0) : []

  return (
    <Dialog open={!!p} onOpenChange={(o) => !o && set({ profileId: null })}>
      <DialogContent className="sm:max-w-2xl">
        {p && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <PlayerAvatar player={p} className="size-14" />
                <div>
                  <DialogTitle className="font-comic text-3xl tracking-wider">{p.name}</DialogTitle>
                  <DialogDescription className="flex flex-wrap items-center gap-2">
                    <Coins value={p.cash} className="text-amber-200" /> cash · net worth {netWorth(state, p.id).toLocaleString('en-US')}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="flex flex-wrap gap-1.5">
              {p.bankrupt && <Badge variant="destructive">Bankrupt</Badge>}
              {p.ultimateStart && <Badge>Ultimate START</Badge>}
              {p.inJail && <Badge variant="secondary">In jail · turn {p.jailTurns}/5</Badge>}
              {p.criminal && <Badge variant="destructive">Criminal card</Badge>}
              {p.reversing && <Badge variant="secondary">Spider-Verse trip (reversing)</Badge>}
              {p.glued && <Badge variant="secondary">Glued at {TILES[p.glued.tile].name} · {p.glued.turns} turns</Badge>}
              {p.effects.rentPayments > 0 && <Badge variant="secondary">Pays {p.effects.rentMult}x rent · next {p.effects.rentPayments}</Badge>}
              {p.effects.sinisterTiles > 0 && <Badge variant="secondary">Sinister 6 active · {Math.ceil(p.effects.sinisterTiles / ROUND_TILES)} round(s)</Badge>}
              {p.effects.setBoostTiles > 0 && <Badge variant="secondary">Set bonus +2,000 · {Math.ceil(p.effects.setBoostTiles / ROUND_TILES)} round(s)</Badge>}
              {p.effects.skipStart && <Badge variant="secondary">No START reward next time</Badge>}
              {p.effects.shopBan && <Badge variant="secondary">Token Shop ban</Badge>}
            </div>
            <ScrollArea className="max-h-[60vh] pr-3">
              <div className="space-y-4">
                {items.length > 0 && (
                  <div>
                    <div className="mb-1.5 font-comic text-lg tracking-wider text-amber-300">Power cards</div>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((k) => (
                        <Badge key={k} variant="outline" className="text-sm">
                          {ITEM_NAMES[k]} {p.items[k] > 1 ? `x${p.items[k]}` : ''}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {!owned.length && !renting.length && <div className="py-6 text-center text-sm text-muted-foreground">No cards yet.</div>}
                {groups.map((g) => {
                  const count = ownedInGroup(state, p.id, g)
                  return (
                    <div key={g}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="font-comic text-lg tracking-wider" style={{ color: GROUPS[g].color }}>
                          {GROUPS[g].name}
                        </span>
                        <span className={`text-xs ${count >= SET_BONUS_MIN_CARDS ? 'text-emerald-300' : 'text-muted-foreground'}`}>
                          {count}/{groupMembers(g).length}
                          {count >= SET_BONUS_MIN_CARDS ? ' · set bonus' : ''}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                        {owned
                          .filter((i) => TILES[i].card!.group === g)
                          .map((i) => (
                            <CardTile key={i} tile={i} state={state} />
                          ))}
                      </div>
                    </div>
                  )
                })}
                {renting.length > 0 && (
                  <div>
                    <div className="mb-1.5 font-comic text-lg tracking-wider text-sky-300">Leasing</div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {renting.map((i) => {
                        const l = holding(state, i).lease!
                        return <CardTile key={i} tile={i} state={state} note={`${l.paymentsLeft} round(s) left`} />
                      })}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
