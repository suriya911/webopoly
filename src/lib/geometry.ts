// Tile rectangles on the board art, in percent of the board size.
// The art is 2000px square: corners are 323px, the 9 side tiles share the rest.

export const CORNER = (323 / 2000) * 100
export const SIDE = (100 - 2 * CORNER) / 9

export type Side = 'top' | 'right' | 'bottom' | 'left' | 'corner'

export interface Rect {
  left: number
  top: number
  width: number
  height: number
  side: Side
}

export function tileRect(i: number): Rect {
  const far = 100 - CORNER
  if (i === 0) return { left: 0, top: 0, width: CORNER, height: CORNER, side: 'corner' }
  if (i < 10) return { left: CORNER + (i - 1) * SIDE, top: 0, width: SIDE, height: CORNER, side: 'top' }
  if (i === 10) return { left: far, top: 0, width: CORNER, height: CORNER, side: 'corner' }
  if (i < 20) return { left: far, top: CORNER + (i - 11) * SIDE, width: CORNER, height: SIDE, side: 'right' }
  if (i === 20) return { left: far, top: far, width: CORNER, height: CORNER, side: 'corner' }
  if (i < 30) return { left: far - (i - 20) * SIDE, top: far, width: SIDE, height: CORNER, side: 'bottom' }
  if (i === 30) return { left: 0, top: far, width: CORNER, height: CORNER, side: 'corner' }
  return { left: 0, top: far - (i - 30) * SIDE, width: CORNER, height: SIDE, side: 'left' }
}

/** Where a token sits on a tile, spread out when several players share it. */
export function tokenPoint(i: number, slot: number, count: number): { x: number; y: number } {
  const r = tileRect(i)
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  if (count <= 1) return { x: cx, y: cy }
  const spread = Math.min(r.width, r.height) * 0.28
  const angle = (slot / count) * Math.PI * 2 - Math.PI / 2
  return { x: cx + Math.cos(angle) * spread, y: cy + Math.sin(angle) * spread }
}
