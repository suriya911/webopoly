// Peer-to-peer voice chat (WebRTC mesh, fine for up to 6 players).
// The game server only relays signaling messages; audio flows directly between browsers.

import { useStore } from '@/store'
import { socket } from './socket'

type Signal = { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }

interface Peer {
  pc: RTCPeerConnection
  audio: HTMLAudioElement
  pending: RTCIceCandidateInit[]
  stopMeter?: () => void
}

let iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
let localStream: MediaStream | null = null
let stopLocalMeter: (() => void) | null = null
const peers = new Map<string, Peer>()
let meterCtx: AudioContext | null = null

async function loadIce() {
  try {
    const res = await fetch(`${import.meta.env.VITE_SERVER_URL ?? ''}/api/ice`)
    if (res.ok) iceServers = (await res.json()).iceServers
  } catch {
    /* keep defaults */
  }
}

function setSpeaking(id: string, on: boolean) {
  const cur = useStore.getState().speaking
  if (!!cur[id] === on) return
  useStore.setState({ speaking: { ...cur, [id]: on } })
}

/** Watches a stream's volume and flags the player as speaking. */
function meter(stream: MediaStream, id: string): () => void {
  meterCtx ??= new AudioContext()
  const ctx = meterCtx
  if (ctx.state === 'suspended') void ctx.resume()
  const src = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  src.connect(analyser)
  const data = new Uint8Array(analyser.fftSize)
  let raf = 0
  let lastLoud = 0
  const tick = () => {
    analyser.getByteTimeDomainData(data)
    let sum = 0
    for (const v of data) sum += (v - 128) ** 2
    const rms = Math.sqrt(sum / data.length)
    const now = performance.now()
    if (rms > 6) lastLoud = now
    setSpeaking(id, now - lastLoud < 250)
    raf = requestAnimationFrame(tick)
  }
  tick()
  return () => {
    cancelAnimationFrame(raf)
    src.disconnect()
    setSpeaking(id, false)
  }
}

function createPeer(id: string, initiator: boolean): Peer {
  const pc = new RTCPeerConnection({ iceServers })
  const audio = new Audio()
  audio.autoplay = true
  audio.muted = useStore.getState().deafened
  const peer: Peer = { pc, audio, pending: [] }
  peers.set(id, peer)

  localStream?.getTracks().forEach((t) => pc.addTrack(t, localStream!))

  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('voice:signal', { to: id, data: { candidate: e.candidate.toJSON() } satisfies Signal })
  }
  pc.ontrack = (e) => {
    const [stream] = e.streams
    audio.srcObject = stream
    void audio.play().catch(() => {})
    peer.stopMeter?.()
    peer.stopMeter = meter(stream, id)
  }
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') pc.restartIce()
  }
  if (initiator) {
    pc.onnegotiationneeded = async () => {
      try {
        await pc.setLocalDescription(await pc.createOffer())
        socket.emit('voice:signal', { to: id, data: { sdp: pc.localDescription!.toJSON() } satisfies Signal })
      } catch (err) {
        console.warn('voice offer failed', err)
      }
    }
  }
  return peer
}

function closePeer(id: string) {
  const peer = peers.get(id)
  if (!peer) return
  peer.stopMeter?.()
  peer.pc.close()
  peer.audio.srcObject = null
  peers.delete(id)
}

socket.on('voice:peers', (ids: string[]) => {
  for (const id of ids) {
    closePeer(id)
    createPeer(id, true)
  }
})

socket.on('voice:signal', async ({ from, data }: { from: string; data: Signal }) => {
  if (!localStream) return
  let peer = peers.get(from)
  try {
    if (data.sdp) {
      if (data.sdp.type === 'offer') {
        closePeer(from)
        peer = createPeer(from, false)
      }
      if (!peer) return
      await peer.pc.setRemoteDescription(data.sdp)
      for (const c of peer.pending.splice(0)) await peer.pc.addIceCandidate(c)
      if (data.sdp.type === 'offer') {
        await peer.pc.setLocalDescription(await peer.pc.createAnswer())
        socket.emit('voice:signal', { to: from, data: { sdp: peer.pc.localDescription!.toJSON() } satisfies Signal })
      }
    } else if (data.candidate && peer) {
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate)
      else peer.pending.push(data.candidate)
    }
  } catch (err) {
    console.warn('voice signal failed', err)
  }
})

socket.on('voice:left', (id: string) => closePeer(id))

// Server restarts / reconnects drop everyone out of voice.
socket.on('disconnect', () => {
  if (localStream) leaveVoice()
})

export async function joinVoice() {
  if (localStream) return
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Voice needs HTTPS and a modern browser')
  await loadIce()
  localStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  const { muted, me } = useStore.getState()
  localStream.getAudioTracks().forEach((t) => (t.enabled = !muted))
  if (me) stopLocalMeter = meter(localStream, me)
  useStore.setState({ inVoice: true })
  socket.emit('voice:join', { muted })
}

export function leaveVoice() {
  for (const id of [...peers.keys()]) closePeer(id)
  stopLocalMeter?.()
  stopLocalMeter = null
  localStream?.getTracks().forEach((t) => t.stop())
  localStream = null
  useStore.setState({ inVoice: false })
  if (socket.connected) socket.emit('voice:leave')
}

export function setMuted(muted: boolean) {
  localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted))
  useStore.setState({ muted })
  socket.emit('voice:mute', muted)
}

export function setDeafened(deafened: boolean) {
  for (const p of peers.values()) p.audio.muted = deafened
  useStore.setState({ deafened })
}
