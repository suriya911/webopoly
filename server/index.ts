import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { customAlphabet } from 'nanoid'
import { Server, type Socket } from 'socket.io'
import type { Ack, ChatMessage, GameAction, Settings } from '../shared/types.ts'
import { Game, GameError } from './game.ts'

const PORT = Number(process.env.PORT ?? 3001)
const ROOM_IDLE_MS = 30 * 60_000
const makeCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 5)

interface Room {
  game: Game
  /** player id -> socket id */
  sockets: Map<string, string>
  /** player id -> voice state, for players currently in voice chat */
  voice: Map<string, { muted: boolean }>
  chat: ChatMessage[]
  idleSince: number | null
}

interface SocketData {
  code?: string
  playerId?: string
}

const rooms = new Map<string, Room>()

const app = express()
const server = createServer(app)
const io = new Server<Record<string, (...args: any[]) => void>, Record<string, (...args: any[]) => void>, Record<string, never>, SocketData>(server, {
  cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? true },
  pingInterval: 10_000,
  pingTimeout: 8_000,
})

app.get('/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size })
})

// ICE servers for WebRTC voice. Add a TURN server in production so players behind strict NATs can talk.
app.get('/api/ice', (_req, res) => {
  const iceServers: RTCIceServerLike[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
  if (process.env.TURN_URLS) {
    iceServers.push({
      urls: process.env.TURN_URLS.split(','),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    })
  }
  res.json({ iceServers })
})

interface RTCIceServerLike {
  urls: string[]
  username?: string
  credential?: string
}

// Serve the built client in production
const here = path.dirname(fileURLToPath(import.meta.url))
const clientDir = [path.resolve(here, '../dist'), path.resolve(here, '../../dist')].find((d) => existsSync(path.join(d, 'index.html')))
if (clientDir) {
  app.use(express.static(clientDir, { maxAge: '1h', index: false }))
  app.get(/^(?!\/socket\.io).*/, (_req, res) => res.sendFile(path.join(clientDir, 'index.html')))
}

function broadcast(room: Room) {
  io.to(room.game.state.code).emit('state', room.game.state)
}

function createRoom(): Room {
  let code = makeCode()
  while (rooms.has(code)) code = makeCode()
  const room: Room = {
    sockets: new Map(),
    voice: new Map(),
    chat: [],
    idleSince: null,
    game: new Game(code, () => broadcast(room)),
  }
  rooms.set(code, room)
  return room
}

function fail(ack: Ack | undefined, err: unknown) {
  const message = err instanceof GameError ? err.message : 'Something went wrong'
  if (!(err instanceof GameError)) console.error(err)
  ack?.({ ok: false, error: message })
}

function attach(socket: Socket<any, any, any, SocketData>, room: Room, playerId: string) {
  const code = room.game.state.code
  const previous = room.sockets.get(playerId)
  if (previous && previous !== socket.id) io.sockets.sockets.get(previous)?.disconnect(true)
  socket.data.code = code
  socket.data.playerId = playerId
  room.sockets.set(playerId, socket.id)
  room.idleSince = null
  socket.join(code)
  room.game.setConnected(playerId, true)
  socket.emit('chat:history', room.chat)
  socket.emit('voice:state', voiceList(room))
}

function voiceList(room: Room) {
  return [...room.voice].map(([id, v]) => ({ id, muted: v.muted }))
}

function leaveVoice(room: Room, playerId: string) {
  if (!room.voice.delete(playerId)) return
  io.to(room.game.state.code).emit('voice:left', playerId)
  io.to(room.game.state.code).emit('voice:state', voiceList(room))
}

io.on('connection', (socket) => {
  const ctx = () => {
    const room = socket.data.code ? rooms.get(socket.data.code) : undefined
    const playerId = socket.data.playerId
    if (!room || !playerId) throw new GameError('Not in a room')
    return { room, playerId, game: room.game }
  }

  /** Runs a mutation, re-arms the turn timer and broadcasts the new state. */
  const mutate = (ack: Ack | undefined, fn: () => void) => {
    try {
      const { room, game } = ctx()
      fn()
      game.schedule()
      broadcast(room)
      ack?.({ ok: true })
    } catch (err) {
      fail(ack, err)
    }
  }

  socket.on('room:create', (p: { name: string; avatar?: string }, ack: Ack) => {
    try {
      const room = createRoom()
      const { player, token } = room.game.addPlayer(p?.name, p?.avatar)
      attach(socket, room, player.id)
      broadcast(room)
      ack({ ok: true, data: { code: room.game.state.code, token, playerId: player.id } })
    } catch (err) {
      fail(ack, err)
    }
  })

  socket.on('room:join', (p: { code: string; name: string; avatar?: string }, ack: Ack) => {
    try {
      const room = rooms.get(String(p?.code ?? '').toUpperCase().trim())
      if (!room) throw new GameError('Room not found. Check the code')
      const { player, token } = room.game.addPlayer(p.name, p.avatar)
      attach(socket, room, player.id)
      broadcast(room)
      ack({ ok: true, data: { code: room.game.state.code, token, playerId: player.id } })
    } catch (err) {
      fail(ack, err)
    }
  })

  socket.on('room:resume', (p: { code: string; token: string }, ack: Ack) => {
    try {
      const room = rooms.get(String(p?.code ?? '').toUpperCase())
      const playerId = room?.game.tokens.get(p?.token)
      if (!room || !playerId) throw new GameError('Session expired')
      attach(socket, room, playerId)
      room.game.schedule()
      broadcast(room)
      ack({ ok: true, data: { code: room.game.state.code, token: p.token, playerId } })
    } catch (err) {
      fail(ack, err)
    }
  })

  socket.on('room:leave', (_: unknown, ack?: Ack) => {
    try {
      const { room, playerId, game } = ctx()
      leaveVoice(room, playerId)
      room.sockets.delete(playerId)
      game.removePlayer(playerId)
      socket.leave(game.state.code)
      socket.data = {}
      if (game.state.players.every((p) => !room.sockets.has(p.id))) room.idleSince = Date.now()
      game.schedule()
      broadcast(room)
      ack?.({ ok: true })
    } catch (err) {
      fail(ack, err)
    }
  })

  socket.on('lobby:profile', (patch: { name?: string; avatar?: string; ready?: boolean }, ack?: Ack) =>
    mutate(ack, () => {
      const { game, playerId } = ctx()
      game.updateProfile(playerId, patch ?? {})
    }),
  )

  socket.on('lobby:settings', (patch: Partial<Settings>, ack?: Ack) =>
    mutate(ack, () => {
      const { game, playerId } = ctx()
      game.updateSettings(playerId, patch ?? {})
    }),
  )

  socket.on('lobby:kick', (targetId: string, ack?: Ack) =>
    mutate(ack, () => {
      const { game, playerId, room } = ctx()
      game.kick(playerId, targetId)
      const sid = room.sockets.get(targetId)
      room.sockets.delete(targetId)
      if (sid) {
        const s = io.sockets.sockets.get(sid)
        s?.emit('kicked')
        s?.leave(game.state.code)
        if (s) s.data = {}
      }
    }),
  )

  socket.on('lobby:start', (_: unknown, ack?: Ack) =>
    mutate(ack, () => {
      const { game, playerId } = ctx()
      game.start(playerId)
    }),
  )

  socket.on('game:act', (action: GameAction, ack?: Ack) =>
    mutate(ack, () => {
      const { game, playerId } = ctx()
      if (!action || typeof action.type !== 'string') throw new GameError('Bad action')
      game.act(playerId, action)
    }),
  )

  socket.on('chat:send', (text: string, ack?: Ack) => {
    try {
      const { room, playerId } = ctx()
      const clean = String(text ?? '').trim().slice(0, 280)
      if (!clean) return ack?.({ ok: true })
      const msg: ChatMessage = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, from: playerId, text: clean, t: Date.now() }
      room.chat.push(msg)
      if (room.chat.length > 100) room.chat.shift()
      io.to(room.game.state.code).emit('chat', msg)
      ack?.({ ok: true })
    } catch (err) {
      fail(ack, err)
    }
  })

  socket.on('react', (emoji: string) => {
    try {
      const { room, playerId } = ctx()
      if (typeof emoji !== 'string' || emoji.length > 8) return
      io.to(room.game.state.code).emit('react', { from: playerId, emoji })
    } catch {
      /* ignore */
    }
  })

  // ------------------------------------------------------------ voice signaling (WebRTC mesh)

  socket.on('voice:join', (p: { muted: boolean }) => {
    try {
      const { room, playerId } = ctx()
      const existing = [...room.voice.keys()].filter((id) => id !== playerId)
      room.voice.set(playerId, { muted: !!p?.muted })
      // The newcomer creates an offer for everyone already in voice.
      socket.emit('voice:peers', existing)
      io.to(room.game.state.code).emit('voice:state', voiceList(room))
    } catch {
      /* ignore */
    }
  })

  socket.on('voice:leave', () => {
    try {
      const { room, playerId } = ctx()
      leaveVoice(room, playerId)
    } catch {
      /* ignore */
    }
  })

  socket.on('voice:mute', (muted: boolean) => {
    try {
      const { room, playerId } = ctx()
      const v = room.voice.get(playerId)
      if (!v) return
      v.muted = !!muted
      io.to(room.game.state.code).emit('voice:state', voiceList(room))
    } catch {
      /* ignore */
    }
  })

  socket.on('voice:signal', (p: { to: string; data: unknown }) => {
    try {
      const { room, playerId } = ctx()
      const target = room.sockets.get(p?.to)
      if (target && room.voice.has(p.to)) io.to(target).emit('voice:signal', { from: playerId, data: p.data })
    } catch {
      /* ignore */
    }
  })

  socket.on('disconnect', () => {
    const room = socket.data.code ? rooms.get(socket.data.code) : undefined
    const playerId = socket.data.playerId
    if (!room || !playerId || room.sockets.get(playerId) !== socket.id) return
    room.sockets.delete(playerId)
    leaveVoice(room, playerId)
    const game = room.game
    if (game.state.status === 'lobby') {
      // Give lobby players a short grace period to refresh the page before dropping them.
      setTimeout(() => {
        if (room.sockets.has(playerId) || game.state.status !== 'lobby') return
        if (!game.state.players.some((p) => p.id === playerId)) return
        game.removePlayer(playerId)
        broadcast(room)
      }, 20_000)
    }
    game.setConnected(playerId, false)
    if (room.sockets.size === 0) room.idleSince = Date.now()
    game.schedule()
    broadcast(room)
  })
})

// Sweep abandoned rooms
setInterval(() => {
  const now = Date.now()
  for (const [code, room] of rooms) {
    if (room.idleSince && now - room.idleSince > ROOM_IDLE_MS) {
      room.game.dispose()
      rooms.delete(code)
    }
  }
}, 60_000).unref()

server.listen(PORT, () => {
  console.log(`🕸️  Webopoly server on http://localhost:${PORT}${clientDir ? ' (serving client)' : ''}`)
})
