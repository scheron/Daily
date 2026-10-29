import {describe, expect, it} from "vitest"

import {SnapshotVersionAheadError} from "@daily/protocol"
import {isObject} from "@daily/std"

import {assertKnownSnapshotVersion, KNOWN_SNAPSHOT_VERSION} from "@core/utils/sync/snapshot/assertKnownSnapshotVersion"
import {buildSnapshot} from "@core/utils/sync/snapshot/buildSnapshot"

describe("assertKnownSnapshotVersion", () => {
  it("throws SnapshotVersionAheadError for a snapshot from the future", () => {
    expect(() => assertKnownSnapshotVersion({version: KNOWN_SNAPSHOT_VERSION + 1, docs: {}, meta: {}})).toThrow(SnapshotVersionAheadError)
  })

  it("exposes the remote version on the error", () => {
    try {
      assertKnownSnapshotVersion({version: 14})
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(SnapshotVersionAheadError)
      expect((err as SnapshotVersionAheadError).remoteVersion).toBe(14)
    }
  })

  it("accepts current and older versions", () => {
    expect(() => assertKnownSnapshotVersion({version: 3})).not.toThrow()
    expect(() => assertKnownSnapshotVersion({version: 2})).not.toThrow()
  })

  it("ignores non-objects and objects without a numeric version", () => {
    expect(() => assertKnownSnapshotVersion(null)).not.toThrow()
    expect(() => assertKnownSnapshotVersion("junk")).not.toThrow()
    expect(() => assertKnownSnapshotVersion({})).not.toThrow()
    expect(() => assertKnownSnapshotVersion({version: "4"})).not.toThrow()
  })

  it("accepts version 13 and aborts with SnapshotVersionAheadError for version 14", () => {
    expect(() => assertKnownSnapshotVersion({version: 13})).not.toThrow()
    expect(() => assertKnownSnapshotVersion({version: 14})).toThrow(SnapshotVersionAheadError)
  })

  it("TC-8: buildSnapshot writes version 13, and assertKnownSnapshotVersion accepts that version but aborts on 14", () => {
    const emptyDocs = {tasks: [], tags: [], branches: [], milestones: [], relations: [], comments: [], subtasks: [], files: [], events: []}
    const built = buildSnapshot(emptyDocs)

    expect(built.version).toBe(13)
    expect(KNOWN_SNAPSHOT_VERSION).toBe(13)
    expect(() => assertKnownSnapshotVersion({version: built.version})).not.toThrow()
    expect(() => assertKnownSnapshotVersion({version: 14})).toThrow(SnapshotVersionAheadError)
  })
})

it("refuses a v12 write in the frozen v11 client reader before its data can be applied", () => {
  const built = buildSnapshot({tasks: [], tags: [], branches: [], milestones: [], relations: [], comments: [], subtasks: [], files: [], events: []})
  expect(() => assertV11Reader(built)).toThrow(SnapshotVersionAheadError)
})

function assertV11Reader(parsed: unknown): void {
  const KNOWN_SNAPSHOT_VERSION = 11
  if (!isObject(parsed)) return
  const version = (parsed as {version?: unknown}).version
  if (typeof version === "number" && version > KNOWN_SNAPSHOT_VERSION) throw new SnapshotVersionAheadError(version)
}
