import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import type { GameState } from '@shared/types.ts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { emit, socket } from '@/lib/socket'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import { playerColor } from './bits'

const KIND_COLOR: Record<string, string> = {
  money: 'text-amber-200/90',
  move: 'text-white/70',
  jail: 'text-sky-300',
  card: 'text-fuchsia-300',
  build: 'text-emerald-300',
  trade: 'text-orange-300',
  system: 'text-white/90 font-medium',
}

function useStickToBottom(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [dep])
  return ref
}

export function GameLog({ state }: { state: GameState }) {
  const ref = useStickToBottom(state.log.length)
  return (
    <div ref={ref} className="h-full space-y-1 overflow-y-auto pr-1 text-[13px] leading-snug">
      {state.log.map((l) => {
        const p = state.players.find((x) => x.id === l.player)
        return (
          <div key={l.id} className={cn('flex gap-2', KIND_COLOR[l.kind ?? 'system'])}>
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: p ? playerColor(p.avatar) : '#64748b' }} />
            <span>{l.text}</span>
          </div>
        )
      })}
    </div>
  )
}

const QUICK = ['👍', '😂', '😱', '🔥', '🕷️', '💸', '😈', '👏']

export function Chat({ state, me }: { state: GameState; me: string }) {
  const chat = useStore((s) => s.chat)
  const [text, setText] = useState('')
  const ref = useStickToBottom(chat.length)
  useEffect(() => {
    useStore.setState({ unread: 0 })
  }, [chat.length])

  const send = () => {
    const t = text.trim()
    if (!t) return
    void emit('chat:send', t)
    setText('')
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div ref={ref} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 text-sm">
        {chat.length === 0 && <div className="py-8 text-center text-muted-foreground">Say hi to your fellow spiders 👋</div>}
        {chat.map((m) => {
          const p = state.players.find((x) => x.id === m.from)
          return (
            <div key={m.id} className={cn('flex flex-col', m.from === me && 'items-end')}>
              <span className="text-[10px]" style={{ color: p ? playerColor(p.avatar) : undefined }}>
                {p?.name ?? 'Someone'}
              </span>
              <span className={cn('max-w-[85%] rounded-2xl px-3 py-1.5 break-words', m.from === me ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-white/10')}>
                {m.text}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-1">
        {QUICK.map((e) => (
          <button key={e} className="rounded-md px-1.5 py-0.5 text-lg transition hover:scale-125 hover:bg-white/10" onClick={() => socket.emit('react', e)} title="React">
            {e}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message…" maxLength={280} />
        <Button type="submit" size="icon" aria-label="Send">
          <Send />
        </Button>
      </form>
    </div>
  )
}
