const storageKey = 'folio:pending-email-login'
const validityMs = 5 * 60_000

type PendingEmailLogin = {
  email: string
  expiresAt: number
}

export function readPendingEmailLogin(): PendingEmailLogin | null {
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<PendingEmailLogin> | null
    if (
      typeof value?.email === 'string' &&
      value.email &&
      typeof value.expiresAt === 'number' &&
      value.expiresAt > Date.now()
    )
      return { email: value.email, expiresAt: value.expiresAt }
  } catch {
    // The form still works in memory when session storage is unavailable.
  }
  clearPendingEmailLogin()
  return null
}

export function savePendingEmailLogin(email: string, sentAt: number) {
  try {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ email, expiresAt: sentAt + validityMs }),
    )
  } catch {
    // The current form can still verify the code.
  }
}

export function clearPendingEmailLogin() {
  try {
    sessionStorage.removeItem(storageKey)
  } catch {
    // Session storage is optional.
  }
}
