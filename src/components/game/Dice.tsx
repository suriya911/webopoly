import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// Which pips are filled on the 3x3 grid for each face value.
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

// Rotation that brings each face to the front. Faces: front 1, top 2, right 3, left 4, bottom 5, back 6.
const FACE_ROT: Record<number, [number, number]> = {
  1: [0, 0],
  2: [-90, 0],
  3: [0, -90],
  4: [0, 90],
  5: [90, 0],
  6: [0, 180],
}

function Face({ value, transform }: { value: number; transform: string }) {
  return (
    <div className="die-face" style={{ transform }}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={PIPS[value].includes(i) ? 'pip' : ''} />
      ))}
    </div>
  )
}

function Die({ value, seq, size, delay }: { value: number; seq: number; size: number; delay: number }) {
  const spins = useRef({ x: 0, y: 0 })
  const [rot, setRot] = useState(() => FACE_ROT[value])
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      setRot(FACE_ROT[value])
      return
    }
    spins.current.x += 720 + 360 * Math.floor(Math.random() * 2)
    spins.current.y += 720 + 360 * Math.floor(Math.random() * 2)
    const [fx, fy] = FACE_ROT[value]
    setRot([fx + spins.current.x, fy + spins.current.y])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq])

  const half = size / 2
  return (
    <div className="die-scene" style={{ width: size, height: size }}>
      <div
        className="die size-full"
        style={{ transform: `rotateX(${rot[0]}deg) rotateY(${rot[1]}deg)`, transitionDelay: `${delay}ms` }}
      >
        <Face value={1} transform={`translateZ(${half}px)`} />
        <Face value={6} transform={`rotateY(180deg) translateZ(${half}px)`} />
        <Face value={3} transform={`rotateY(90deg) translateZ(${half}px)`} />
        <Face value={4} transform={`rotateY(-90deg) translateZ(${half}px)`} />
        <Face value={2} transform={`rotateX(90deg) translateZ(${half}px)`} />
        <Face value={5} transform={`rotateX(-90deg) translateZ(${half}px)`} />
      </div>
    </div>
  )
}

export function Dice({ dice, seq, size = 56, className }: { dice: [number, number]; seq: number; size?: number; className?: string }) {
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <Die value={dice[0]} seq={seq} size={size} delay={0} />
      <Die value={dice[1]} seq={seq} size={size} delay={90} />
    </div>
  )
}
