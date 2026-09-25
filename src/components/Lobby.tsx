import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Check, Copy, Crown, LogOut, Play, UserX } from 'lucide-react'
import { toast } from 'sonner'
import { STARTING_CASH_MAX, STARTING_CASH_MIN, STARTING_CASH_STEP } from '@shared/rules.ts'
import type { GameState, Settings } from '@shared/types.ts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { emit } from '@/lib/socket'
import { sfx } from '@/lib/sfx'
import { useStore } from '@/store'
import { Coins, PlayerAvatar } from './game/bits'
import { Chat } from './game/LogChat'
import { VoiceControls } from './game/VoiceControls'
import { AvatarPicker } from './Home'
import { RulesDialog } from './Rules'

const call = (event: string, payload?: unknown) => emit(event, payload).catch((e: Error) => toast.error(e.message))

type Opt = { label: string; value: number }
const SETTING_FIELDS: { key: keyof Settings; label: string; hint: string; options: Opt[] }[] = [
  {
    key: 'salary',
    label: 'START salary',
    hint: 'Collected every time you pass START',
    options: [5_000, 10_000, 15_000, 20_000].map((v) => ({ label: v.toLocaleString('en-US'), value: v })),
  },
  {
    key: 'turnSeconds',
    label: 'Turn timer',
    hint: 'Auto-plays when a player idles',
    options: [
      { label: 'Off', value: 0 },
      { label: '45 s', value: 45 },
      { label: '90 s', value: 90 },
      { label: '2 min', value: 120 },
    ],
  },
  {
    key: 'timeLimitMinutes',
    label: 'Game length',
    hint: 'Richest wins when time runs out',
    options: [
      { label: 'Until 1 remains', value: 0 },
      { label: '30 min', value: 30 },
      { label: '45 min', value: 45 },
      { label: '60 min', value: 60 },
      { label: '90 min', value: 90 },
    ],
  },
]

function StartingCashSlider({ value, disabled }: { value: number; disabled: boolean }) {
  // Local value while dragging; the server is only told when the thumb is released.
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Starting coins</div>
          <div className="text-xs text-muted-foreground">WebCoins each player begins with</div>
        </div>
        <Coins value={draft} className="text-base font-semibold text-amber-200" />
      </div>
      <Slider
        min={STARTING_CASH_MIN}
        max={STARTING_CASH_MAX}
        step={STARTING_CASH_STEP}
        value={[draft]}
        disabled={disabled}
        onValueChange={([v]) => setDraft(v)}
        onValueCommit={([v]) => call('lobby:settings', { startingCash: v })}
        aria-label="Starting coins"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{STARTING_CASH_MIN.toLocaleString('en-US')}</span>
        <span>{STARTING_CASH_MAX.toLocaleString('en-US')}</span>
      </div>
    </div>
  )
}

export function Lobby({ state, me }: { state: GameState; me: string }) {
  const leave = useStore((s) => s.leave)
  const isHost = state.hostId === me
  const player = state.players.find((p) => p.id === me)
  const inviteUrl = `${location.origin}/room/${state.code}`
  const canStart = state.players.length >= 2

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      toast.success('Invite link copied')
    } catch {
      toast.message(inviteUrl)
    }
  }

  const setSetting = (key: keyof Settings, value: number | boolean) => call('lobby:settings', { [key]: value })

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-comic text-4xl tracking-wider text-shadow-comic">
          <span className="text-red-500">WEBO</span>POLY <span className="text-lg text-white/50">lobby</span>
        </div>
        <div className="flex items-center gap-2">
          <VoiceControls />
          <RulesDialog settings={state.settings} />
          <Button variant="ghost" size="sm" onClick={leave}>
            <LogOut /> Leave
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Card className="glass overflow-hidden">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
              <div>
                <div className="text-xs tracking-widest text-muted-foreground uppercase">Room code</div>
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="font-mono text-5xl font-bold tracking-[0.3em] text-white"
                >
                  {state.code}
                </motion.div>
                <div className="mt-1 text-xs text-muted-foreground">Share the code or the link. 2-6 players.</div>
              </div>
              <Button onClick={copy} size="lg" variant="secondary">
                <Copy /> Copy invite link
              </Button>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Players <Badge variant="secondary">{state.players.length}/6</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {state.players.map((p) => (
                <motion.div layout key={p.id} className="flex items-center gap-3 rounded-xl border bg-white/[0.03] p-2.5">
                  <PlayerAvatar player={p} className="size-11" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <span className="truncate">{p.name}</span>
                      {p.id === state.hostId && <Crown className="size-4 text-amber-300" />}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.ready ? <span className="text-emerald-400">Ready</span> : 'Not ready'}
                      {!p.connected && ' · offline'}
                    </div>
                  </div>
                  {isHost && p.id !== me && (
                    <Button size="icon-sm" variant="ghost" onClick={() => call('lobby:kick', p.id)} aria-label={`Kick ${p.name}`}>
                      <UserX />
                    </Button>
                  )}
                </motion.div>
              ))}
              {Array.from({ length: Math.max(0, 2 - state.players.length) }, (_, i) => (
                <div key={i} className="grid place-items-center rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  Waiting for a friend…
                </div>
              ))}
            </CardContent>
          </Card>

          {player && (
            <Card className="glass">
              <CardHeader>
                <CardTitle>Your spider</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <AvatarPicker
                  value={player.avatar}
                  taken={state.players.map((p) => p.avatar)}
                  onChange={(avatar) => call('lobby:profile', { avatar })}
                />
                <div className="flex items-center justify-between">
                  <Label htmlFor="ready">I’m ready</Label>
                  <Switch id="ready" checked={player.ready} onCheckedChange={(ready) => call('lobby:profile', { ready })} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="glass">
            <CardHeader>
              <CardTitle>House rules</CardTitle>
              <CardDescription>{isHost ? 'You are the host. Tune the game.' : 'Only the host can change these.'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <StartingCashSlider value={state.settings.startingCash} disabled={!isHost} />
              {SETTING_FIELDS.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{f.label}</div>
                    <div className="text-xs text-muted-foreground">{f.hint}</div>
                  </div>
                  <Select value={String(state.settings[f.key])} onValueChange={(v) => setSetting(f.key, Number(v))} disabled={!isHost}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {f.options.map((o) => (
                        <SelectItem key={o.value} value={String(o.value)}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Stash jackpot</div>
                  <div className="text-xs text-muted-foreground">Taxes & fines pile up on Spider-Sense Stash</div>
                </div>
                <Switch checked={state.settings.stashPot} disabled={!isHost} onCheckedChange={(v) => setSetting('stashPot', v)} />
              </div>
              {isHost ? (
                <Button
                  className="mt-2 h-12 w-full font-comic text-xl tracking-wider"
                  disabled={!canStart}
                  onClick={() => {
                    sfx.unlock()
                    void call('lobby:start')
                  }}
                >
                  <Play /> {canStart ? 'Start the game' : 'Need 2+ players'}
                </Button>
              ) : (
                <div className="mt-2 flex items-center justify-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  <Check className="size-4" /> Waiting for the host to start…
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass h-80">
            <CardContent className="h-full p-4">
              <Chat state={state} me={me} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
