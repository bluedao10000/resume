import { z } from 'zod'

// WeChat cannot execute dynamically generated functions. Configure before any
// domain schemas are instantiated; App and Page bundles have separate modules.
z.config({ jitless: true })
