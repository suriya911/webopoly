import { useEffect, useRef, useState } from 'react'
import type { GameState } from '@shared/types.ts'
import { sfx } from '@/lib/sfx'

const STEP_MS = 190
const DICE_SETTLE_MS = 850

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Replays server move events so tokens hop tile by tile instead of teleporting.
 * Returns the tile each player's token is currently drawn on.
 */
export function useTokenPositions(state: GameState) {
  const [pos, setPos] = useState<Record<string, number>>(() => Object.fromEntries(state.players.map((p) => [p.id, p.pos])))
  const [moving, setMoving] = useState<string | null>(null)
  const lastSeq = useRef(state.moves.at(-1)?.seq ?? 0)
  const lastRoll = useRef(state.rollSeq)
  const busy = useRef(false)
  const latest = useRef(state)
  latest.current = state

  useEffect(() => {
    const fresh = state.moves.filter((m) => m.seq > lastSeq.current)
    const rolled = state.rollSeq !== lastRoll.current
    lastRoll.current = state.rollSeq
    if (!fresh.length) {
      if (!busy.current) setPos(Object.fromEntries(state.players.map((p) => [p.id, p.pos])))
      return
    }
    lastSeq.current = fresh.at(-1)!.seq
    busy.current = true
    void (async () => {
      if (rolled) await wait(DICE_SETTLE_MS)
      for (const m of fresh) {
        setMoving(m.playerId)
        if (m.teleport) {
          sfx.thwip()
          setPos((p) => ({ ...p, [m.playerId]: m.path.at(-1)! }))
          await wait(450)
          continue
        }
        for (const tile of m.path) {
          setPos((p) => ({ ...p, [m.playerId]: tile }))
          sfx.step()
          await wait(STEP_MS)
        }
        await wait(120)
      }
      setMoving(null)
      busy.current = false
      setPos(Object.fromEntries(latest.current.players.map((p) => [p.id, p.pos])))
    })()
  }, [state])

  return { pos, moving, animating: moving !== null }
}
