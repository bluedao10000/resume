import { createFileRoute, redirect } from '@tanstack/react-router'
import { fetchSession } from '../../server/session'

export const Route = createFileRoute('/auth/callback')({
  loader: async () => {
    const session = await fetchSession()
    throw redirect({ href: session?.user.id ? '/' : '/?loginFailed=1' })
  },
})
