import confetti from 'canvas-confetti'
import { useEffect, useRef } from 'react'
import { Flag, LogOut, Trophy, Volume2, VolumeX } from 'lucide-react'
import { toast } from 'sonner'
import type { GameState } from '@shared/types.ts'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMediaQuery } from '@/hooks/misc'
import { useTokenPositions } from '@/hooks/useTokenPositions'
import { sfx } from '@/lib/sfx'
import { act, useStore } from '@/store'
import { ActionPanel } from './game/ActionPanel'
import { Coins, PlayerAvatar } from './game/bits'
import { Board } from './game/Board'
import { CenterStage } from './game/CenterStage'
import { Chat, GameLog } from './game/LogChat'
import { PlayersPanel } from './game/PlayersPanel'
import { MyStuff, PropertyDialog } from './game/Properties'
import { Trades } from './game/Trades'
import { VoiceControls } from './game/VoiceControls'
import { RulesDialog, TileRulesDialog } from './Rules'

function useGameFeedback(state: GameState, me: string) {
  const prevCurrent = useRef(state.current)
  const prevRoll = useRef(state.rollSeq)
  const prevJail = useRef(state.players.find((p) => p.id === me)?.inJail)
  const prevStatus = useRef(state.status)
  const prevTrades = useRef(new Set(state.trades.map((t) => t.id)))
  const prevLeases = useRef(new Set(state.leaseOffers.map((o) => o.id)))

  useEffect(() => {
    if (state.rollSeq !== prevRoll.current) sfx.dice()
    prevRoll.current = state.rollSeq

    if (state.current !== prevCurrent.current && state.current === me && state.status === 'playing') {
      setTimeout(() => sfx.yourTurn(), 600)
      toast('Your turn!', { icon: '🕷️', duration: 2000 })
    }
    prevCurrent.current = state.current

    const jailed = state.players.find((p) => p.id === me)?.inJail
    if (jailed && !prevJail.current) setTimeout(() => sfx.jail(), 900)
    prevJail.current = jailed

    for (const t of state.trades) {
      if (!prevTrades.current.has(t.id) && t.to === me) {
        const from = state.players.find((p) => p.id === t.from)
        toast(`${from?.name} sent you a trade offer`, { icon: '🤝' })
      }
    }
    prevTrades.current = new Set(state.trades.map((t) => t.id))

    for (const o of state.leaseOffers) {
      if (!prevLeases.current.has(o.id) && o.from !== me && (o.lessor === me || o.lessee === me)) {
        const from = state.players.find((p) => p.id === o.from)
        toast(`${from?.name} sent you a lease offer`, { icon: '📜' })
      }
    }
    prevLeases.current = new Set(state.leaseOffers.map((o) => o.id))

    if (state.status === 'finished' && prevStatus.current !== 'finished') {
      sfx.win()
      const end = Date.now() + 2500
      const frame = () => {
        confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0 }, colors: ['#ef4444', '#3b82f6', '#fbbf24'] })
        confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1 }, colors: ['#ef4444', '#3b82f6', '#fbbf24'] })
        if (Date.now() < end) requestAnimationFrame(frame)
      }
      frame()
    }
    prevStatus.current = state.status
  }, [state, me])
}

function useShortcuts(state: GameState, me: string, animating: boolean) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input,textarea,[role=dialog],[role=alertdialog]') || state.current !== me || animating) return
      if (e.code === 'Space' && state.phase === 'fate') {
        e.preventDefault()
        act({ type: 'rollFate' }).catch((err: Error) => toast.error(err.message))
      } else if (e.code === 'Space' && (state.phase === 'roll' || state.phase === 'jail')) {
        e.preventDefault()
        act({ type: 'roll' }).catch((err: Error) => toast.error(err.message))
      } else if (e.key === 'Enter' && state.phase === 'manage') {
        e.preventDefault()
        act({ type: 'endTurn' }).catch((err: Error) => toast.error(err.message))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, me, animating])
}

function WinnerDialog({ state }: { state: GameState }) {
  const leave = useStore((s) => s.leave)
  if (state.status !== 'finished' || !state.ranking) return null
  const winner = state.players.find((p) => p.id === state.winner)
  return (
    <Dialog open>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader className="items-center text-center">
          <Trophy className="size-12 text-amber-300 drop-shadow-[0_0_20px_rgb(251_191_36/0.7)]" />
          <DialogTitle className="font-comic text-4xl tracking-wider">{winner?.name} rules the web!</DialogTitle>
          <DialogDescription>Final standings by net worth</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {state.ranking.map((r, i) => {
            const p = state.players.find((x) => x.id === r.id)!
            return (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border bg-white/[0.03] p-2">
                <span className="w-6 text-center font-comic text-2xl text-white/60">{i + 1}</span>
                <PlayerAvatar player={p} className="size-9" showSpeaking={false} />
                <span className="flex-1 font-semibold">{p.name}</span>
                {p.bankrupt ? <Badge variant="destructive">Bankrupt</Badge> : <Coins value={r.worth} className="text-amber-200" />}
              </div>
            )
          })}
        </div>
        <Button onClick={leave} className="w-full">
          Back to menu
        </Button>
      </DialogContent>
    </Dialog>
  )
}

export function GameScreen({ state, me }: { state: GameState; me: string }) {
  const leave = useStore((s) => s.leave)
  const soundOn = useStore((s) => s.soundOn)
  const unread = useStore((s) => s.unread)
  const set = useStore((s) => s.set)
  const wide = useMediaQuery('(min-width: 1024px)')
  const { pos, moving, animating } = useTokenPositions(state)
  useGameFeedback(state, me)
  useShortcuts(state, me, animating)

  const my = state.players.find((p) => p.id === me)
  const picking = state.phase === 'choose' && state.current === me && !animating ? state.choice?.tiles : undefined
  const incoming =
    state.trades.filter((t) => t.to === me).length +
    state.leaseOffers.filter((o) => o.from !== me && (o.lessor === me || o.lessee === me)).length

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1600px] flex-col gap-3 p-2 sm:p-3 lg:h-dvh">
      <header className="glass flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3 py-2">
        <div className="flex items-center gap-3">
          <span className="font-comic text-2xl tracking-wider text-shadow-comic">
            <span className="text-red-500">WEBO</span>POLY
          </span>
          <Badge variant="secondary" className="font-mono tracking-widest">
            {state.code}
          </Badge>
          {my && !my.bankrupt && (
            <span className="hidden items-center gap-2 text-sm sm:flex">
              <PlayerAvatar player={my} className="size-6" />
              <Coins value={my.cash} className="text-amber-200" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <VoiceControls compact={!wide} />
          <Button
            variant="ghost"
            size="icon"
            aria-label={soundOn ? 'Mute sounds' : 'Unmute sounds'}
            onClick={() => {
              sfx.setEnabled(!soundOn)
              set({ soundOn: !soundOn })
            }}
          >
            {soundOn ? <Volume2 /> : <VolumeX />}
          </Button>
          <RulesDialog settings={state.settings} />
          {state.status === 'playing' && my && !my.bankrupt ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Flag /> <span className="hidden sm:inline">Forfeit</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Forfeit the game?</AlertDialogTitle>
                  <AlertDialogDescription>Your properties return to the bank and you become a spectator. This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Stay</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => act({ type: 'forfeit' }).catch(() => {})}>
                    Forfeit
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button variant="ghost" size="sm" onClick={leave}>
              <LogOut /> Leave
            </Button>
          )}
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
          <div className="w-full max-w-[min(100%,calc(100dvh-5.5rem))]">
            <Board
              state={state}
              pos={pos}
              moving={moving}
              pickable={picking}
              onPick={(tile) => act({ type: 'choose', tile }).catch((e: Error) => toast.error(e.message))}
            >
              <CenterStage state={state} me={me} showActions={wide} animating={animating} />
            </Board>
          </div>
          {!wide && (
            <div className="glass w-full rounded-2xl p-3">
              <ActionPanel state={state} me={me} animating={animating} />
            </div>
          )}
        </section>

        <aside className="glass flex min-h-[28rem] w-full flex-col gap-3 rounded-2xl p-3 lg:w-[380px] lg:min-h-0">
          <PlayersPanel state={state} me={me} />
          <Tabs defaultValue="log" className="flex min-h-0 flex-1 flex-col" onValueChange={(v) => v === 'chat' && set({ unread: 0 })}>
            <TabsList className="w-full">
              <TabsTrigger value="log">Log</TabsTrigger>
              <TabsTrigger value="chat">
                Chat {unread > 0 && <Badge className="ml-1 h-4 min-w-4 px-1 text-[10px]">{unread}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="mine">My Stuff</TabsTrigger>
              <TabsTrigger value="trade">
                Trade {incoming > 0 && <Badge className="ml-1 h-4 min-w-4 px-1 text-[10px]">{incoming}</Badge>}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="log" className="min-h-0 flex-1 overflow-hidden">
              <GameLog state={state} />
            </TabsContent>
            <TabsContent value="chat" className="min-h-0 flex-1 overflow-hidden">
              <Chat state={state} me={me} />
            </TabsContent>
            <TabsContent value="mine" className="min-h-0 flex-1 overflow-y-auto pr-1">
              <MyStuff state={state} me={me} />
            </TabsContent>
            <TabsContent value="trade" className="min-h-0 flex-1 overflow-y-auto pr-1">
              <Trades state={state} me={me} />
            </TabsContent>
          </Tabs>
        </aside>
      </main>

      <PropertyDialog state={state} me={me} />
      <TileRulesDialog settings={state.settings} />
      <WinnerDialog state={state} />
    </div>
  )
}
