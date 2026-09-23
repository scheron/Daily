import {describe, expect, it} from "vitest"

import {SnapshotVersionAheadError} from "@daily/protocol"

import {assertKnownSnapshotVersion, KNOWN_SNAPSHOT_VERSION} from "@core/utils/sync/snapshot/assertKnownSnapshotVersion"
import {buildSnapshot} from "@core/utils/sync/snapshot/buildSnapshot"

describe("assertKnownSnapshotVersion", () => {
  it("throws SnapshotVersionAheadError for a snapshot from the future", () => {
    expect(() => assertKnownSnapshotVersion({version: KNOWN_SNAPSHOT_VERSION + 1, docs: {}, meta: {}})).toThrow(SnapshotVersionAheadError)
  })

  it("exposes the remote version on the error", () => {
    try {
      assertKnownSnapshotVersion({version: 11})
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(SnapshotVersionAheadError)
      expect((err as SnapshotVersionAheadError).remoteVersion).toBe(11)
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

  it("accepts version 10 and aborts with SnapshotVersionAheadError for version 11", () => {
    expect(() => assertKnownSnapshotVersion({version: 10})).not.toThrow()
    expect(() => assertKnownSnapshotVersion({version: 11})).toThrow(SnapshotVersionAheadError)
  })

  it("TC-8: buildSnapshot writes version 10, and assertKnownSnapshotVersion accepts that version but aborts on 11", () => {
    const emptyDocs = {tasks: [], tags: [], branches: [], milestones: [], relations: [], comments: [], files: [], events: []}
    const built = buildSnapshot(emptyDocs)

    expect(built.version).toBe(10)
    expect(KNOWN_SNAPSHOT_VERSION).toBe(10)
    expect(() => assertKnownSnapshotVersion({version: built.version})).not.toThrow()
    expect(() => assertKnownSnapshotVersion({version: 11})).toThrow(SnapshotVersionAheadError)
  })
})
