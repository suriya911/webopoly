import { motion } from 'motion/react'
import { useState } from 'react'
import { ArrowRight, Loader2, Mic, Sparkles, Users } from 'lucide-react'
import { toast } from 'sonner'
import { AVATARS } from '@shared/board.ts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { session } from '@/lib/session'
import { sfx } from '@/lib/sfx'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import { RulesDialog } from './Rules'

export function AvatarPicker({ value, onChange, taken = [] }: { value: string; onChange: (id: string) => void; taken?: string[] }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {AVATARS.map((a) => {
        const isTaken = taken.includes(a.id) && a.id !== value
        return (
          <button
            key={a.id}
            type="button"
            disabled={isTaken}
            onClick={() => onChange(a.id)}
            className={cn(
              'group relative aspect-square overflow-hidden rounded-xl ring-2 ring-transparent transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-30',
              value === a.id && 'scale-105',
            )}
            style={value === a.id ? { boxShadow: `0 0 0 3px ${a.color}, 0 0 20px ${a.color}` } : undefined}
            title={a.name}
          >
            <img src={`/avatars/${a.id}.webp`} alt={a.name} className="size-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-[10px] font-medium">{a.name}</span>
          </button>
        )
      })}
    </div>
  )
}

function codeFromUrl() {
  const m = location.pathname.match(/^\/room\/([A-Za-z0-9]{4,8})/)
  return m ? m[1].toUpperCase() : ''
}

export function Home() {
  const { create, join, connected } = useStore()
  const [name, setName] = useState(session.getName())
  const [avatar, setAvatar] = useState<string>(AVATARS[Math.floor(Math.random() * AVATARS.length)].id)
  const [code, setCode] = useState(codeFromUrl())
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)

  const go = async (mode: 'create' | 'join') => {
    if (!name.trim()) return toast.error('Pick a hero name first')
    if (mode === 'join' && code.length < 4) return toast.error('Enter the room code')
    sfx.unlock()
    session.setName(name.trim())
    setBusy(mode)
    try {
      if (mode === 'create') await create(name.trim(), avatar)
      else await join(code, name.trim(), avatar)
      sfx.thwip()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <img src="/board-sm.webp" alt="" className="pointer-events-none absolute inset-0 size-full scale-110 object-cover opacity-25 blur-md" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
      <div className="web-bg absolute inset-0 opacity-50" />

      <div className="relative mx-auto grid min-h-dvh max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-[1.1fr_1fr]">
        <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-300">
            <Sparkles className="size-3.5" /> Multiplayer · 2-6 players · Voice chat
          </div>
          <h1 className="font-comic text-7xl leading-[0.9] tracking-wider text-shadow-comic sm:text-8xl">
            <span className="bg-gradient-to-b from-red-400 to-red-700 bg-clip-text text-transparent">WEBO</span>
            <span className="text-white">POLY</span>
          </h1>
          <p className="max-w-md text-lg text-white/75">
            Buy Spider-Man, Venom and the whole Sinister Six. Build Web HQs, lease to survive, trade to complete your sets, and bankrupt your friends.
          </p>
          <div className="flex flex-wrap gap-3 text-sm text-white/70">
            <span className="flex items-center gap-1.5"><Users className="size-4 text-sky-400" /> Private rooms</span>
            <span className="flex items-center gap-1.5"><Mic className="size-4 text-emerald-400" /> Built-in voice</span>
            <span className="flex items-center gap-1.5">🎲 Real 2-dice rolls</span>
          </div>
          <motion.img
            src="/board-sm.webp"
            alt="Board preview"
            className="hidden w-80 rotate-[-6deg] rounded-2xl shadow-[0_30px_60px_-10px_rgb(239_68_68/0.35)] ring-1 ring-white/10 lg:block"
            initial={{ rotate: -14, y: 20 }}
            animate={{ rotate: -6, y: 0 }}
            transition={{ type: 'spring', stiffness: 60 }}
          />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="glass space-y-5 rounded-3xl p-6 shadow-2xl">
          <div className="space-y-2">
            <Label htmlFor="name">Hero name</Label>
            <Input id="name" value={name} maxLength={18} onChange={(e) => setName(e.target.value)} placeholder="Peter P." className="h-11 text-base" />
          </div>
          <div className="space-y-2">
            <Label>Pick your spider</Label>
            <AvatarPicker value={avatar} onChange={setAvatar} />
          </div>
          <Button className="h-12 w-full font-comic text-xl tracking-wider" onClick={() => go('create')} disabled={!!busy || !connected}>
            {busy === 'create' ? <Loader2 className="animate-spin" /> : <Sparkles />} Create a room
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or join friends <span className="h-px flex-1 bg-border" />
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void go('join')
            }}
          >
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="ROOM CODE"
              className="h-11 text-center font-mono text-lg tracking-[0.4em] uppercase"
            />
            <Button type="submit" variant="secondary" className="h-11 px-5" disabled={!!busy || !connected}>
              {busy === 'join' ? <Loader2 className="animate-spin" /> : <ArrowRight />} Join
            </Button>
          </form>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className={cn('size-2 rounded-full', connected ? 'bg-emerald-500' : 'animate-pulse bg-amber-500')} />
              {connected ? 'Server online' : 'Connecting…'}
            </span>
            <RulesDialog />
          </div>
        </motion.div>
      </div>
    </div>
  )
}
