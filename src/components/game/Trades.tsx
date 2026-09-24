import { useState } from 'react'
import { ArrowLeftRight, Check, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { GROUPS, TILES } from '@shared/board.ts'
import type { GameState, TradeOffer } from '@shared/types.ts'
import { holding, propertiesOf } from '@shared/rules.ts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { act } from '@/store'
import { useAct } from './ActionPanel'
import { Coins, PlayerAvatar } from './bits'

function PropList({ state, ids, selected, onToggle }: { state: GameState; ids: number[]; selected: number[]; onToggle: (i: number) => void }) {
  if (!ids.length) return <div className="py-3 text-center text-xs text-muted-foreground">No properties</div>
  return (
    <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
      {ids.map((i) => {
        const h = holding(state, i)
        return (
          <label key={i} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-white/5">
            <Checkbox checked={selected.includes(i)} onCheckedChange={() => onToggle(i)} />
            <span className="size-2.5 rounded-sm" style={{ background: GROUPS[TILES[i].card!.group].color }} />
            <span className="flex-1 truncate">{TILES[i].name}</span>
            <span className="text-[10px] text-muted-foreground">{h.leased ? 'leased' : h.level ? `L${h.level}` : ''}</span>
          </label>
        )
      })}
    </div>
  )
}

function NewTrade({ state, me }: { state: GameState; me: string }) {
  const others = state.players.filter((p) => p.id !== me && !p.bankrupt)
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState<string>(others[0]?.id ?? '')
  const [give, setGive] = useState<number[]>([])
  const [get, setGet] = useState<number[]>([])
  const [giveCash, setGiveCash] = useState('')
  const [getCash, setGetCash] = useState('')
  const toggle = (list: number[], set: (v: number[]) => void) => (i: number) => set(list.includes(i) ? list.filter((x) => x !== i) : [...list, i])
  const target = others.find((p) => p.id === to)

  const submit = async () => {
    try {
      await act({ type: 'proposeTrade', offer: { to, giveProps: give, getProps: get, giveCash: Number(giveCash) || 0, getCash: Number(getCash) || 0 } })
      toast.success(`Offer sent to ${target?.name}`)
      setOpen(false)
      setGive([])
      setGet([])
      setGiveCash('')
      setGetCash('')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" disabled={!others.length}>
          <Plus /> New trade offer
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-comic text-2xl tracking-wider">Make a deal</DialogTitle>
          <DialogDescription>Swap properties and coins. Buildings and leases travel with the property.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {others.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setTo(p.id)
                setGet([])
              }}
              className={`flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition ${to === p.id ? 'border-primary bg-primary/15' : 'border-border hover:bg-white/5'}`}
            >
              <PlayerAvatar player={p} className="size-6" showSpeaking={false} /> {p.name}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-lg border p-3">
            <div className="text-sm font-semibold">You give</div>
            <PropList state={state} ids={propertiesOf(state, me)} selected={give} onToggle={toggle(give, setGive)} />
            <Label className="text-xs">Coins</Label>
            <Input inputMode="numeric" placeholder="0" value={giveCash} onChange={(e) => setGiveCash(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <div className="text-sm font-semibold">You get from {target?.name ?? '…'}</div>
            <PropList state={state} ids={target ? propertiesOf(state, target.id) : []} selected={get} onToggle={toggle(get, setGet)} />
            <Label className="text-xs">Coins</Label>
            <Input inputMode="numeric" placeholder="0" value={getCash} onChange={(e) => setGetCash(e.target.value.replace(/\D/g, ''))} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!to}>
            <ArrowLeftRight /> Send offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Side({ props, cash }: { props: number[]; cash: number }) {
  if (!props.length && !cash) return <span className="text-muted-foreground">nothing</span>
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {props.map((i) => (
        <span key={i} className="rounded px-1 text-xs" style={{ background: `${GROUPS[TILES[i].card!.group].color}33`, color: GROUPS[TILES[i].card!.group].color }}>
          {TILES[i].name}
        </span>
      ))}
      {cash > 0 && <Coins value={cash} className="text-xs" />}
    </span>
  )
}

function OfferRow({ state, me, t }: { state: GameState; me: string; t: TradeOffer }) {
  const { run, busy } = useAct()
  const from = state.players.find((p) => p.id === t.from)!
  const to = state.players.find((p) => p.id === t.to)!
  const incoming = t.to === me
  return (
    <div className={`space-y-2 rounded-lg border p-2.5 text-sm ${incoming ? 'border-primary/50 bg-primary/5' : ''}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <PlayerAvatar player={from} className="size-5" showSpeaking={false} /> {from.name}
        <ArrowLeftRight className="size-3" />
        <PlayerAvatar player={to} className="size-5" showSpeaking={false} /> {to.name}
      </div>
      <div>
        <b>{from.name}</b> gives <Side props={t.giveProps} cash={t.giveCash} />
      </div>
      <div>
        <b>{to.name}</b> gives <Side props={t.getProps} cash={t.getCash} />
      </div>
      {incoming && (
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => run({ type: 'respondTrade', id: t.id, accept: true })}>
            <Check /> Accept
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run({ type: 'respondTrade', id: t.id, accept: false })}>
            <X /> Decline
          </Button>
        </div>
      )}
      {t.from === me && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ type: 'cancelTrade', id: t.id })}>
          Cancel offer
        </Button>
      )}
    </div>
  )
}

export function Trades({ state, me }: { state: GameState; me: string }) {
  const mine = state.trades.filter((t) => t.from === me || t.to === me)
  const others = state.trades.filter((t) => t.from !== me && t.to !== me)
  return (
    <div className="space-y-3">
      <NewTrade state={state} me={me} />
      {mine.map((t) => (
        <OfferRow key={t.id} state={state} me={me} t={t} />
      ))}
      {others.length > 0 && <div className="text-xs text-muted-foreground">{others.length} other offer(s) between players</div>}
      {!state.trades.length && <div className="py-6 text-center text-sm text-muted-foreground">No open offers. Trade to complete your sets!</div>}
    </div>
  )
}
