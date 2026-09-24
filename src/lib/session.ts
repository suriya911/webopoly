// Each browser tab is its own player, so the reconnect token lives in sessionStorage.
// The display name is remembered across tabs in localStorage.

export interface Session {
  code: string
  token: string
}

const KEY = 'webopoly.session'
const NAME_KEY = 'webopoly.name'

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export const session = {
  get: (): Session | null => safe(() => JSON.parse(sessionStorage.getItem(KEY) ?? 'null'), null),
  set: (s: Session) => safe(() => sessionStorage.setItem(KEY, JSON.stringify(s)), undefined),
  clear: () => safe(() => sessionStorage.removeItem(KEY), undefined),
  getName: () => safe(() => localStorage.getItem(NAME_KEY) ?? '', ''),
  setName: (n: string) => safe(() => localStorage.setItem(NAME_KEY, n), undefined),
}
