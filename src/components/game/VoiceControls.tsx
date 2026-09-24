import { useEffect, useState } from 'react'
import { Headphones, HeadphoneOff, Mic, MicOff, PhoneCall, PhoneOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { joinVoice, leaveVoice, setDeafened, setMuted } from '@/lib/voice'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'

export function VoiceControls({ compact }: { compact?: boolean }) {
  const inVoice = useStore((s) => s.inVoice)
  const muted = useStore((s) => s.muted)
  const deafened = useStore((s) => s.deafened)
  const me = useStore((s) => s.me)
  const speaking = useStore((s) => (me ? s.speaking[me] : false))
  const others = useStore((s) => s.voice.filter((v) => v.id !== s.me).length)
  const [joining, setJoining] = useState(false)

  // "M" toggles the mic when not typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'm' || !useStore.getState().inVoice) return
      const el = e.target as HTMLElement
      if (el.closest('input,textarea,[contenteditable=true]')) return
      setMuted(!useStore.getState().muted)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const join = async () => {
    setJoining(true)
    try {
      await joinVoice()
      toast.success('Voice connected. Press M to mute')
    } catch (err) {
      const e = err as Error
      toast.error(e.name === 'NotAllowedError' ? 'Microphone permission denied' : e.message || 'Could not start voice')
    } finally {
      setJoining(false)
    }
  }

  if (!inVoice) {
    return (
      <Button onClick={join} disabled={joining} className="bg-emerald-600 text-white hover:bg-emerald-500">
        <PhoneCall /> {compact ? 'Voice' : `Join voice${others ? ` (${others})` : ''}`}
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/30 p-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
            className={cn(
              'rounded-full transition',
              muted ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-emerald-600 text-white hover:bg-emerald-500',
              !muted && speaking && 'speaking',
            )}
          >
            {muted ? <MicOff /> : <Mic />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{muted ? 'Unmute' : 'Mute'} (M)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant="ghost" className="rounded-full" onClick={() => setDeafened(!deafened)} aria-label={deafened ? 'Undeafen' : 'Deafen'}>
            {deafened ? <HeadphoneOff className="text-red-400" /> : <Headphones />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{deafened ? 'Hear others' : 'Silence others'}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant="ghost" className="rounded-full text-red-400" onClick={leaveVoice} aria-label="Leave voice">
            <PhoneOff />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Leave voice</TooltipContent>
      </Tooltip>
    </div>
  )
}
