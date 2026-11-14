import { getMigrations } from 'better-auth/db/migration'
import { DatabaseSync } from 'node:sqlite'
const migration = await getMigrations({
  database: new DatabaseSync(':memory:'),
  socialProviders: {
    google: { clientId: 'schema-only', clientSecret: 'schema-only' },
  },
})
// Print a candidate schema for review; never overwrite an already applied migration.
console.log(await migration.compileMigrations())
