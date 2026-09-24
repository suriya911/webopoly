import { Loader2 } from 'lucide-react'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { GameScreen } from '@/components/GameScreen'
import { Home } from '@/components/Home'
import { Lobby } from '@/components/Lobby'
import { useStore } from '@/store'

function Screen() {
  const state = useStore((s) => s.state)
  const me = useStore((s) => s.me)
  const resuming = useStore((s) => s.resuming)
  const connected = useStore((s) => s.connected)

  if (resuming) {
    return (
      <div className="grid min-h-dvh place-items-center text-muted-foreground">
        <Loader2 className="size-8 animate-spin text-red-500" />
      </div>
    )
  }
  if (!state || !me || !state.players.some((p) => p.id === me)) return <Home />
  return (
    <>
      {!connected && (
        <div className="fixed inset-x-0 top-0 z-50 bg-amber-500 py-1 text-center text-sm font-medium text-black">Reconnecting…</div>
      )}
      {state.status === 'lobby' ? <Lobby state={state} me={me} /> : <GameScreen state={state} me={me} />}
    </>
  )
}

export default function App() {
  return (
    <TooltipProvider delayDuration={250}>
      <Screen />
      <Toaster theme="dark" position="top-center" richColors closeButton />
    </TooltipProvider>
  )
}
