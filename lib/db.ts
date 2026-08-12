import { neon } from "@neondatabase/serverless"
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http"

import * as authSchema from "./schema"
import * as appSchema from "./schema-app"

const schema = { ...authSchema, ...appSchema }

type Database = NeonHttpDatabase<typeof schema>

let instance: Database | null = null

function connect(): Database {
  if (instance) {
    return instance
  }

  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in."
    )
  }

  instance = drizzle(neon(url), { schema })
  return instance
}

/**
 * Lazy on purpose. Reading DATABASE_URL at module scope means any import of this
 * file — including one Next pulls in while collecting page data at build time —
 * throws before a single query is attempted. The proxy defers the read to first
 * use, so a build without database credentials still succeeds and only real
 * queries fail, with a message that says what to do.
 *
 * Methods are bound to the live instance: handing back an unbound function would
 * lose `this` and break every builder chain off `db`.
 */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const database = connect()
    const value = Reflect.get(database, property, database)
    return typeof value === "function" ? value.bind(database) : value
  },
})

export type { Database }
