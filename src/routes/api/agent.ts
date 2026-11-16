import { createFileRoute } from '@tanstack/react-router'
import { agentPost, durableStatus } from '../../server/agent-handler'
export const Route = createFileRoute('/api/agent')({
  server: {
    handlers: {
      GET: ({ request }) => durableStatus(request),
      DELETE: ({ request }) => durableStatus(request),
      POST: ({ request }) => agentPost(request),
    },
  },
})
