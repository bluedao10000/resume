import { createServerFn } from '@tanstack/react-start'

// Resolve the session during SSR so signed-in visitors never see the landing
// page first. Failures (missing auth config, unmigrated local D1) mean
// "signed out"; the client session hook still corrects that after hydration.
export const fetchSession = createServerFn({ method: 'GET' }).handler(
  async () => {
    try {
      const [{ getRequestHeaders }, { getAuth }] = await Promise.all([
        import('@tanstack/react-start/server'),
        import('./auth'),
      ])
      return await getAuth().api.getSession({ headers: getRequestHeaders() })
    } catch {
      return null
    }
  },
)
