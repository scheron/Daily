import {randomUUID} from "node:crypto"
import {rmSync} from "node:fs"
import {onTestFinished} from "vitest"

import {createStorageCore} from "@daily/core/storage/createStorageCore"
import {WorkStorage} from "@daily/core/storage/WorkStorage"

import {createTestDatabase} from "../../../core/tests/helpers/db"

import type {Changeset, SqliteDriver} from "@daily/core"
import type {ActorSource} from "@daily/protocol"
import type {ToolClock, ToolContext, ToolFilesPort} from "../../src/types"

function makeClock(): ToolClock {
  return {
    timeZone: "UTC",
    today: () => "2026-03-24",
    time: () => "09:00:00",
    scheduledNow: () => ({date: "2026-03-24", time: "09:00:00", timezone: "UTC"}),
    dayStart: (date) => `${date}T00:00:00.000Z`,
    dayEndExclusive: (date) => `${date}T23:59:59.999Z`,
  }
}

function makeFilesPort(): ToolFilesPort {
  return {
    async isPresent() {
      return false
    },
    async read() {
      throw new Error("no file bytes in this harness")
    },
    afterSave(_file, effect) {
      return effect()
    },
  }
}

export function makeRealWorkspace(source: ActorSource = {kind: "agent"}): {
  db: SqliteDriver
  workStorage: WorkStorage
  ctx: ToolContext
  changesets: Changeset[]
} {
  const root = `/tmp/daily-tools-test-${randomUUID()}`
  onTestFinished(() => rmSync(root, {recursive: true, force: true}))

  const db = createTestDatabase()
  const core = createStorageCore(db, {
    appDataRoot: () => root,
    dbPath: () => `${root}/db`,
    assetsDir: () => `${root}/assets`,
    remoteSyncPath: () => `${root}/remote`,
  })
  const changesets: Changeset[] = []
  const workStorage = new WorkStorage(core, db, (changeset) => changesets.push(changeset))

  const ctx: ToolContext = {workStorage, clock: makeClock(), source, files: makeFilesPort()}

  return {db, workStorage, ctx, changesets}
}
