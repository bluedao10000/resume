import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { runtimeDefaults } from '../config/runtime-defaults.mjs'
import type { BillingEnv } from './billing'

// Runs the deployed DDL and real SQL, rather than matching SQL strings in mocks.
export function testBillingDb() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys=ON')
  sqlite.exec(readFileSync('migrations/0001_better_auth.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0002_billing.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0003_wechat_pay.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0004_alipay.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0005_billing_test_grants.sql', 'utf8'))
  sqlite.exec(`INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt)
    VALUES ('user-a','Fixture A','a@example.invalid',1,0,0),('user-b','Fixture B','b@example.invalid',1,0,0)`)
  type Value = string | number | null | Uint8Array
  function prepare(sql: string, values: Value[] = []) {
    return {
      bind: (...bindings: Value[]) => prepare(sql, bindings),
      first: async () => sqlite.prepare(sql).get(...values) ?? null,
      all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
      run: async () => {
        const result = sqlite.prepare(sql).run(...values)
        return { success: true, meta: { changes: Number(result.changes) } }
      },
    }
  }
  const DB = {
    prepare,
    batch: async (statements: ReturnType<typeof prepare>[]) => {
      sqlite.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.run())
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  } as unknown as D1Database
  const env = {
    ...runtimeDefaults('global'),
    ...parseEnv(readFileSync('.env.example', 'utf8')),
    APP_MARKET: 'global',
    AI_MODEL: 'gpt-6.1-sol',
    DB,
  } as unknown as BillingEnv
  return { env, sqlite, close: () => sqlite.close() }
}
