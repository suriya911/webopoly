import { io, type Socket } from 'socket.io-client'

// Same origin in production; Vite proxies /socket.io to the game server in dev.
export const socket: Socket = io(import.meta.env.VITE_SERVER_URL ?? undefined, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
})

type AckResult<T> = { ok: true; data?: T } | { ok: false; error: string }

export function emit<T = unknown>(event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, payload, (err: Error | null, res: AckResult<T>) => {
      if (err) return reject(new Error('Server did not respond'))
      if (!res.ok) return reject(new Error(res.error))
      resolve(res.data as T)
    })
  })
}
