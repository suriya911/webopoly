import { useId } from 'react'
import { avatarInfo } from '@shared/board.ts'
import type { Player } from '@shared/types.ts'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'

/** The WebCoin: a small spider-stamped gold coin. */
export function CoinIcon({ className }: { className?: string }) {
  const id = `coin${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <svg viewBox="0 0 24 24" className={cn('inline-block size-4 shrink-0', className)} aria-hidden>
      <defs>
        <radialGradient id={id} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset=".45" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#b45309" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill={`url(#${id})`} stroke="#92400e" strokeWidth="1" />
      <circle cx="12" cy="12" r="8" fill="none" stroke="#92400e" strokeOpacity=".5" strokeWidth=".8" />
      <g stroke="#7c2d12" strokeWidth="1.1" strokeLinecap="round" fill="none">
        <path d="M12 9 7.5 5.5M12 9l4.5-3.5M11 11 6 9.5M13 11l5-1.5M11 13l-5 2M13 13l5 2M11.5 14.5 9 18.5M12.5 14.5l2.5 4" />
      </g>
      <ellipse cx="12" cy="9.6" rx="1.5" ry="1.5" fill="#7c2d12" />
      <ellipse cx="12" cy="13" rx="2" ry="2.8" fill="#7c2d12" />
    </svg>
  )
}

export function Coins({ value, className, iconClass }: { value: number; className?: string; iconClass?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 font-mono tabular-nums', className)}>
      <CoinIcon className={iconClass} />
      {value.toLocaleString('en-US')}
    </span>
  )
}

export function PlayerAvatar({
  player,
  className,
  ring = true,
  showSpeaking = true,
}: {
  player: Pick<Player, 'id' | 'avatar' | 'name'>
  className?: string
  ring?: boolean
  showSpeaking?: boolean
}) {
  const speaking = useStore((s) => s.speaking[player.id])
  const info = avatarInfo(player.avatar)
  return (
    <div
      className={cn('relative size-10 shrink-0 rounded-full', showSpeaking && speaking && 'speaking', className)}
      style={ring ? { boxShadow: `0 0 0 2px ${info.color}` } : undefined}
      title={player.name}
    >
      <img src={`/avatars/${player.avatar}.webp`} alt={info.name} className="size-full rounded-full object-cover" draggable={false} />
    </div>
  )
}

export function playerColor(avatar: string) {
  return avatarInfo(avatar).color
}
