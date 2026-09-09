import {describe, expect, it} from "vitest"

import {ProtocolErrorCode, SYNC_PROTOCOL_VERSION, SyncServerErrorCode} from "@daily/protocol"
import {listDevices} from "@daily/server/devices/DeviceStore"
import {ensureClaimCode} from "@daily/server/identity/ServerIdentityStore"

import {DailySyncClient} from "@core/storage/sync/server/DailySyncClient"
import {isPrivateServerAddress, probeTransport} from "@core/storage/sync/server/serverTransport"
import {bootHttpsSyncServer, bootSyncServer, claimFirstDevice, openEnrollmentWindow} from "../../../helpers/syncServer"

import type {RevisionProbe} from "@daily/protocol"

/** Flips one hex byte of a `AA:BB:...` fingerprint so the result differs from the input in exactly one byte, as TC-5 requires. */
function corruptFingerprint(fingerprint: string): string {
  const parts = fingerprint.split(":")
  const lastIndex = parts.length - 1
  parts[lastIndex] = parts[lastIndex] === "00" ? "01" : "00"
  return parts.join(":")
}

describe("isPrivateServerAddress", () => {
  it("classifies_TC-3_private_ranges_by_the_resolved_address_and_a_public_literal_as_public", async () => {
    const privateAddresses = [
      "http://localhost:8787",
      "http://127.0.0.1:8787",
      "http://10.0.0.4:8787",
      "http://192.168.1.9:8787",
      "http://100.100.1.1:8787",
      "http://[::1]:8787",
    ]

    for (const address of privateAddresses) {
      await expect(isPrivateServerAddress(address)).resolves.toBe(true)
    }

    await expect(isPrivateServerAddress("http://93.184.216.34:8787")).resolves.toBe(false)
  })
})

describe("probeTransport", () => {
  it("reports_TC-4_plain_with_no_fingerprint_and_self_signed_with_the_certificates_real_sha256_read_independently", async () => {
    const plain = await bootSyncServer()
    const secure = await bootHttpsSyncServer()

    try {
      const plainProbe = await probeTransport(plain.baseUrl)
      expect(plainProbe.transport.mode).toBe("plain")
      expect(plainProbe.transport.fingerprint).toBeNull()
      expect(plainProbe.info.protocol).toBe(SYNC_PROTOCOL_VERSION)
      expect(plainProbe.info.claimed).toBe(false)
      expect(plainProbe.info.serverId).toBeTruthy()

      const secureProbe = await probeTransport(secure.baseUrl)
      expect(secureProbe.transport.mode).toBe("self-signed")
      expect(secureProbe.transport.fingerprint).toBe(secure.fingerprint)
      expect(secureProbe.info.protocol).toBe(SYNC_PROTOCOL_VERSION)
      expect(secureProbe.info.claimed).toBe(false)
      expect(secureProbe.info.serverId).toBeTruthy()
    } finally {
      await plain.close()
      await secure.close()
    }
  })
})

describe("fingerprint pinning", () => {
  it("refuses_TC-5_a_connection_whose_certificate_differs_by_one_byte_before_any_request_reaches_the_server", async () => {
    const secure = await bootHttpsSyncServer()

    try {
      const pinnedCorrectly = new DailySyncClient({baseUrl: secure.baseUrl, token: null, fingerprint: secure.fingerprint})
      await expect(pinnedCorrectly.serverInfo()).resolves.toMatchObject({claimed: false})

      const attemptsBefore = readClaimAttempts(secure)

      const pinnedWrong = new DailySyncClient({baseUrl: secure.baseUrl, token: null, fingerprint: corruptFingerprint(secure.fingerprint)})
      const rejection = await pinnedWrong.claim("000000", "Intruder").then(
        () => null,
        (error: unknown) => error,
      )

      expect(rejection).toMatchObject({code: SyncServerErrorCode.FINGERPRINT_MISMATCH})
      expect(readClaimAttempts(secure)).toBe(attemptsBefore)
      expect(listDevices(secure.store)).toHaveLength(0)
    } finally {
      await secure.close()
    }
  })
})

describe("claiming a server through the client", () => {
  it("claims_TC-6_an_unclaimed_server_once_and_refuses_every_later_claim_as_ALREADY_CLAIMED", async () => {
    const server = await bootSyncServer()

    try {
      const code = ensureClaimCode(server.store)
      if (!code) throw new Error("expected an unclaimed server to hold a claim code")

      const client = new DailySyncClient({baseUrl: server.baseUrl, token: null, fingerprint: null})

      const before = await client.serverInfo()
      expect(before).toMatchObject({protocol: SYNC_PROTOCOL_VERSION, claimed: false})

      const issued = await client.claim(code, "MacBook Air")
      expect(issued.device.name).toBe("MacBook Air")
      expect(issued.token).toBeTruthy()

      const authenticated = new DailySyncClient({baseUrl: server.baseUrl, token: issued.token, fingerprint: null})
      await expect(authenticated.readSnapshot()).resolves.toEqual({snapshot: null, revision: null})

      const after = await client.serverInfo()
      expect(after.claimed).toBe(true)

      const secondAttempt = await client.claim(code, "Mac mini").then(
        () => null,
        (error: unknown) => error,
      )
      expect(secondAttempt).toMatchObject({code: ProtocolErrorCode.ALREADY_CLAIMED, status: 409})
    } finally {
      await server.close()
    }
  })
})

describe("peer enrollment through the client", () => {
  it("enrolls_TC-7_a_peer_by_approval_and_refuses_a_denied_one_with_nothing_created", async () => {
    const server = await bootSyncServer()

    try {
      const first = await claimFirstDevice(server, "MacBook Air")
      const boundClient = new DailySyncClient({baseUrl: server.baseUrl, token: first.token, fingerprint: null})
      const askingClient = new DailySyncClient({baseUrl: server.baseUrl, token: null, fingerprint: null})

      openEnrollmentWindow(server)
      const requested = await askingClient.requestEnrollment("Mac mini")
      expect(requested.code).toMatch(/^\d{6}$/)
      expect(requested.requestId).toBeTruthy()
      expect(Date.parse(requested.expiresAt)).toBeGreaterThan(Date.now())

      const pending = await boundClient.pendingEnrollment()
      expect(pending).toMatchObject({requestId: requested.requestId, code: requested.code, deviceName: "Mac mini"})

      const beforeApproval = await askingClient.enrollmentStatus(requested.pollToken)
      expect(beforeApproval).toEqual({state: "pending"})

      await boundClient.approveEnrollment(requested.requestId, requested.code)

      const afterApproval = await askingClient.enrollmentStatus(requested.pollToken)
      if (afterApproval.state !== "approved") throw new Error(`expected an approved status, got ${afterApproval.state}`)
      expect(afterApproval.device.name).toBe("Mac mini")
      expect(afterApproval.token).toBeTruthy()

      const newDeviceClient = new DailySyncClient({baseUrl: server.baseUrl, token: afterApproval.token, fingerprint: null})
      await expect(newDeviceClient.readSnapshot()).resolves.toEqual({snapshot: null, revision: null})

      expect(listDevices(server.store).map((device) => device.name)).toEqual(["MacBook Air", "Mac mini"])

      openEnrollmentWindow(server)
      const secondRequest = await askingClient.requestEnrollment("Mac Studio")
      await boundClient.denyEnrollment(secondRequest.requestId)

      const denied = await askingClient.enrollmentStatus(secondRequest.pollToken)
      expect(denied).toEqual({state: "denied"})
      expect(listDevices(server.store).map((device) => device.name)).toEqual(["MacBook Air", "Mac mini"])
    } finally {
      await server.close()
    }
  })
})

function readClaimAttempts(server: Awaited<ReturnType<typeof bootHttpsSyncServer>>): number {
  return (server.store.db.prepare("SELECT claim_attempts FROM server_identity WHERE id = 1").get() as {claim_attempts: number}).claim_attempts
}

/**
 * `probeRevision()` takes no argument today; phase 4 gives it one (the revision this device
 * already knows) but the plan does not freeze that parameter's name or type ("Frozen for later
 * phases" is empty for phase 4). This local type is the test-writer's own guess at the eventual
 * shape, cast onto the real client so these cases drive a real HTTP round trip rather than a
 * mock — flagged in the report as an assumption, not a decision the plan took.
 */
type ProbesAKnownRevision = {probeRevision: (known?: string | null) => Promise<RevisionProbe>}

function snapshotDocument(hash: string): Record<string, unknown> {
  return {version: 4, meta: {updatedAt: new Date().toISOString(), hash}, docs: {tasks: {}}}
}

describe("probeRevision holds for a known revision and answers ordinarily once the hold ends", () => {
  it("waits_TC-12_for_the_revision_the_client_already_knows_and_settles_the_moment_it_moves", async () => {
    const server = await bootSyncServer()

    try {
      const first = await claimFirstDevice(server, "MacBook Air")
      const client = new DailySyncClient({baseUrl: server.baseUrl, token: first.token, fingerprint: null}) as unknown as DailySyncClient &
        ProbesAKnownRevision

      await client.writeSnapshot(snapshotDocument("hash-a"), null)
      const knownRevision = (await client.probeRevision(null)).revision
      if (!knownRevision) throw new Error("expected a revision after the first write")

      let settled = false
      const held = client.probeRevision(knownRevision).then((probe) => {
        settled = true
        return probe
      })

      await new Promise((resolve) => setTimeout(resolve, 1500))
      expect(settled).toBe(false)

      const newRevision = (await client.writeSnapshot(snapshotDocument("hash-b"), knownRevision)).revision

      const probe = await held
      expect(probe.revision).toBe(newRevision)
    } finally {
      await server.close()
    }
  }, 20000)

  it("loops_TC-16_on_an_expired_hold_by_asking_again_without_the_wait_ever_becoming_an_error", async () => {
    const server = await bootSyncServer()

    try {
      const first = await claimFirstDevice(server, "MacBook Air")
      const client = new DailySyncClient({baseUrl: server.baseUrl, token: first.token, fingerprint: null}) as unknown as DailySyncClient &
        ProbesAKnownRevision

      await client.writeSnapshot(snapshotDocument("hash-a"), null)
      const known = (await client.probeRevision(null)).revision
      if (!known) throw new Error("expected a revision after the write")

      // The plan's own "How" names the hold at 45 seconds; this waits it out rather than guessing shorter.
      const startedAt = Date.now()
      const firstAnswer = await client.probeRevision(known)
      const elapsedMs = Date.now() - startedAt

      expect(elapsedMs).toBeGreaterThan(40000)
      expect(firstAnswer.revision).toBe(known)

      // An ended hold is treated as an ordinary answer: the very next call succeeds too, not a rejection.
      const secondAnswer = await client.probeRevision(known)
      expect(secondAnswer.revision).toBe(known)
    } finally {
      await server.close()
    }
  }, 120000)
})
