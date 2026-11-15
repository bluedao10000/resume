import { runtimeConfig } from '../../config/runtime-defaults.mjs'
import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { authConfigured, authMethods } from '../../server/auth'
import { plans } from '../../server/billing'
export const Route = createFileRoute('/api/config')({
  server: {
    handlers: {
      GET: () => {
        const config = runtimeConfig(env) as unknown as Record<string, string>
        return Response.json({
          mode: config.APP_MODE === 'live' ? 'live' : 'demo',
          importLimits: {
            maxFileBytes: Number(config.IMPORT_MAX_FILE_BYTES),
            maxPages: Number(config.IMPORT_MAX_PDF_PAGES),
            maxTextCharacters: Number(config.IMPORT_MAX_TEXT_CHARACTERS),
            timeoutMs: Number(config.IMPORT_TIMEOUT_MS),
            maxExpandedBytes: Number(config.IMPORT_MAX_EXPANDED_BYTES),
          },
          billingPlans: plans(config),
          runtime:
            config.AGENT_RUNTIME === 'pi-durable' ? 'pi-durable' : 'pi-ai',
          market: config.APP_MARKET === 'cn' ? 'cn' : 'global',
          authMethods: authMethods(config),
          authConfigured: authConfigured(config),
        })
      },
    },
  },
})
