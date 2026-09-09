import {describe, expect, it} from "vitest"

import {SnapshotVersionAheadError} from "@daily/protocol"

import {assertKnownSnapshotVersion, KNOWN_SNAPSHOT_VERSION} from "@core/utils/sync/snapshot/assertKnownSnapshotVersion"

describe("assertKnownSnapshotVersion", () => {
  it("throws SnapshotVersionAheadError for a snapshot from the future", () => {
    expect(() => assertKnownSnapshotVersion({version: KNOWN_SNAPSHOT_VERSION + 1, docs: {}, meta: {}})).toThrow(SnapshotVersionAheadError)
  })

  it("exposes the remote version on the error", () => {
    try {
      assertKnownSnapshotVersion({version: 9})
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(SnapshotVersionAheadError)
      expect((err as SnapshotVersionAheadError).remoteVersion).toBe(9)
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

  it("TC-8: the known version has moved to 6, so v5 and v6 both stay readable and only a newer version is rejected", () => {
    expect(KNOWN_SNAPSHOT_VERSION).toBe(6)
    expect(() => assertKnownSnapshotVersion({version: 5})).not.toThrow()
    expect(() => assertKnownSnapshotVersion({version: 6})).not.toThrow()
    expect(() => assertKnownSnapshotVersion({version: 7})).toThrow(SnapshotVersionAheadError)
  })

  it("TC-14: a version-7 snapshot, one past whatever version this build currently knows, aborts sync with SnapshotVersionAheadError", () => {
    expect(() => assertKnownSnapshotVersion({version: 7})).toThrow(SnapshotVersionAheadError)
  })
})
