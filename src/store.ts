import { create } from 'zustand'
import type { ChatMessage, GameState, VoicePeerState } from '@shared/types.ts'
import type { RuleTopic } from '@/components/Rules'
import { session } from '@/lib/session'
import { emit, socket } from '@/lib/socket'

export interface Reaction {
  id: number
  from: string
  emoji: string
}

interface JoinResult {
  code: string
  token: string
  playerId: string
}

interface Store {
  connected: boolean
  resuming: boolean
  state: GameState | null
  me: string | null
  chat: ChatMessage[]
  unread: number
  voice: VoicePeerState[]
  speaking: Record<string, boolean>
  inVoice: boolean
  muted: boolean
  deafened: boolean
  reactions: Reaction[]
  selectedTile: number | null
  /** Special spot whose rules are open in a dialog */
  ruleTopic: RuleTopic | null
  /** Player whose cards are shown in the profile dialog */
  profileId: string | null
  soundOn: boolean
  set: (patch: Partial<Store>) => void
  create: (name: string, avatar?: string) => Promise<void>
  join: (code: string, name: string, avatar?: string) => Promise<void>
  leave: () => Promise<void>
}

export const useStore = create<Store>((set) => ({
  connected: socket.connected,
  resuming: !!session.get(),
  state: null,
  me: null,
  chat: [],
  unread: 0,
  voice: [],
  speaking: {},
  inVoice: false,
  muted: false,
  deafened: false,
  reactions: [],
  selectedTile: null,
  ruleTopic: null,
  profileId: null,
  soundOn: true,
  set: (patch) => set(patch),
  create: async (name, avatar) => {
    const res = await emit<JoinResult>('room:create', { name, avatar })
    session.set({ code: res.code, token: res.token })
    set({ me: res.playerId })
  },
  join: async (code, name, avatar) => {
    const res = await emit<JoinResult>('room:join', { code, name, avatar })
    session.set({ code: res.code, token: res.token })
    set({ me: res.playerId })
  },
  leave: async () => {
    try {
      await emit('room:leave')
    } finally {
      session.clear()
      set({ state: null, me: null, chat: [], voice: [], unread: 0 })
      history.replaceState(null, '', '/')
    }
  },
}))

// ---------------------------------------------------------------- socket wiring

async function resume() {
  const s = session.get()
  if (!s) {
    useStore.setState({ resuming: false })
    return
  }
  try {
    const res = await emit<JoinResult>('room:resume', s)
    useStore.setState({ me: res.playerId })
  } catch {
    session.clear()
    useStore.setState({ state: null, me: null })
  } finally {
    useStore.setState({ resuming: false })
  }
}

socket.on('connect', () => {
  useStore.setState({ connected: true })
  void resume()
})
socket.on('disconnect', () => useStore.setState({ connected: false }))
socket.on('state', (state: GameState) => {
  useStore.setState({ state })
  if (state.code && location.pathname !== `/room/${state.code}`) history.replaceState(null, '', `/room/${state.code}`)
})
socket.on('kicked', () => {
  session.clear()
  useStore.setState({ state: null, me: null })
  history.replaceState(null, '', '/')
})
socket.on('chat:history', (chat: ChatMessage[]) => useStore.setState({ chat }))
socket.on('chat', (msg: ChatMessage) =>
  useStore.setState((s) => ({ chat: [...s.chat.slice(-99), msg], unread: msg.from === s.me ? s.unread : s.unread + 1 })),
)
socket.on('voice:state', (voice: VoicePeerState[]) => useStore.setState({ voice }))

let reactionSeq = 0
socket.on('react', (r: { from: string; emoji: string }) => {
  const id = ++reactionSeq
  useStore.setState((s) => ({ reactions: [...s.reactions, { id, ...r }] }))
  setTimeout(() => useStore.setState((s) => ({ reactions: s.reactions.filter((x) => x.id !== id) })), 2600)
})

export const act = (action: import('@shared/types.ts').GameAction) => emit('game:act', action)
