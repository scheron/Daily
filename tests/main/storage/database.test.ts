// @ts-nocheck
import {describe, expect, it} from "vitest"

import {createTestDatabase} from "../../helpers/db"

describe("test database", () => {
  it("creates an in-memory database with migrations applied", () => {
    const db = createTestDatabase()

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {name: string}[]

    const tableNames = tables.map((t) => t.name)

    expect(tableNames).toContain("tasks")
    expect(tableNames).toContain("tags")
    expect(tableNames).toContain("branches")
    expect(tableNames).toContain("settings")
    expect(tableNames).toContain("_migrations")

    db.close()
  })
})
