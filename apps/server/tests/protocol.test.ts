import {createHash} from "node:crypto"
import {existsSync, mkdtempSync, readdirSync, rmSync, unlinkSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {Readable} from "node:stream"
import {gzipSync} from "node:zlib"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {SYNC_PROTOCOL_CONFIG, SYNC_PROTOCOL_PATHS, SYNC_PROTOCOL_VERSION} from "@daily/protocol"

import {writeAsset} from "../src/assets/AssetStore"
import {resolveServerConfig} from "../src/config/resolveServerConfig"
import {authenticateRequest} from "../src/devices/authenticateRequest"
import {listDevices, revokeDevice} from "../src/devices/DeviceStore"
import {createConsoleEnrollment} from "../src/enrollment/EnrollmentStore"
import {createHttpServer} from "../src/http/createHttpServer"
import {HEALTH_PATH} from "../src/http/routes/health"
import {ensureClaimCode, openEnrollmentWindow, regenerateClaimCode} from "../src/identity/ServerIdentityStore"
import {readSnapshot as readStoredSnapshot} from "../src/snapshot/SnapshotStore"
import {openServerStore} from "../src/store/instance"

import type {
  AssetManifestResponse,
  AssetUploadResponse,
  ClaimResponse,
  ConsoleEnrollResponse,
  DeviceListResponse,
  EnrollmentStatus,
  EnrollRequestResponse,
  IssuedCredential,
  PendingEnrollmentResponse,
  RevisionProbe,
  ServerInfo,
  SnapshotReadResponse,
  SnapshotWriteResponse,
} from "@daily/protocol"
import type {IncomingMessage} from "node:http"
import type {AddressInfo} from "node:net"
import type {ServerConfigOptions} from "../src/config/resolveServerConfig"
import type {ServerStore} from "../src/store/instance"

type BootedServer = {
  baseUrl: string
  store: ServerStore
  close(): Promise<void>
}

function bearer(token: string): IncomingMessage {
  return {headers: {authorization: `Bearer ${token}`}} as IncomingMessage
}

function bootServer(dataDir: string, overrides: ServerConfigOptions = {}): Promise<BootedServer> {
  const config = resolveServerConfig({dataDir, host: "127.0.0.1", port: 0, ...overrides})
  const store = openServerStore(config.dataDir)
  const server = createHttpServer(store, config)

  return new Promise((resolve) => {
    server.listen(config.port, config.host, () => {
      const {port} = server.address() as AddressInfo
      resolve({
        baseUrl: `http://${config.host}:${port}`,
        store,
        close: () =>
          new Promise((res) => {
            server.close(() => {
              store.close()
              res()
            })
          }),
      })
    })
  })
}

describe("protocol http surface", () => {
  let dataDir: string
  let booted: BootedServer

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-protocol-"))
    booted = await bootServer(dataDir)
  })

  afterEach(async () => {
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  it("TC-3: GET /v1/server answers without credentials with the server's identity", async () => {
    const res = await fetch(`${booted.baseUrl}/v1/server`)

    expect(res.status).toBe(200)

    const json = await res.json()
    const row = booted.store.db.prepare("SELECT server_id FROM server_identity WHERE id = 1").get() as {server_id: string}

    expect(json).toEqual({
      ok: true,
      data: {protocol: SYNC_PROTOCOL_VERSION, serverId: row.server_id, name: expect.any(String), claimed: false},
    })
  })

  it("TC-4: an unknown path, a wrong method, a non-JSON body and an oversized body are each refused with a stable code, and the server keeps serving", async () => {
    const unknownPath = await fetch(`${booted.baseUrl}/v1/nope`)
    expect(unknownPath.status).toBe(404)
    expect(await unknownPath.json()).toEqual({ok: false, error: {code: "UNKNOWN_ROUTE", message: expect.any(String)}})

    const wrongMethod = await fetch(`${booted.baseUrl}/v1/server`, {method: "POST", body: JSON.stringify({})})
    expect(wrongMethod.status).toBe(405)
    expect(await wrongMethod.json()).toEqual({ok: false, error: {code: "METHOD_NOT_ALLOWED", message: expect.any(String)}})

    const notJson = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {method: "POST", body: "not json"})
    expect(notJson.status).toBe(400)
    expect(await notJson.json()).toEqual({ok: false, error: {code: "MALFORMED_REQUEST", message: expect.any(String)}})

    const oversizedBody = "x".repeat(SYNC_PROTOCOL_CONFIG.maxControlRequestBodyBytes + 1024)
    const tooLarge = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {method: "POST", body: oversizedBody})
    expect(tooLarge.status).toBe(413)
    expect(await tooLarge.json()).toEqual({ok: false, error: {code: "PAYLOAD_TOO_LARGE", message: expect.any(String)}})

    const stillServing = await fetch(`${booted.baseUrl}/v1/server`)
    expect(stillServing.status).toBe(200)
  })
})

describe("health route", () => {
  let dataDir: string
  let booted: BootedServer

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-health-"))
    booted = await bootServer(dataDir)
  })

  afterEach(async () => {
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  it("answers without credentials, outside the protocol envelope", async () => {
    const res = await fetch(`${booted.baseUrl}${HEALTH_PATH}`)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({status: "ok"})
  })

  it("says the same thing before and after the server is claimed, so it never reveals what /v1/server does", async () => {
    const before = await (await fetch(`${booted.baseUrl}${HEALTH_PATH}`)).json()

    const claimed = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code: ensureClaimCode(booted.store), deviceName: "a-mac"}),
    })
    expect(claimed.status).toBe(200)

    const after = await (await fetch(`${booted.baseUrl}${HEALTH_PATH}`)).json()

    expect(after).toEqual(before)
    expect(JSON.stringify(after)).not.toContain("claimed")
    expect(JSON.stringify(after)).not.toContain("serverId")
  })

  it("is not a protocol path, so raising the protocol version cannot move it", () => {
    expect(Object.values(SYNC_PROTOCOL_PATHS)).not.toContain(HEALTH_PATH)
  })
})

describe("claiming a server", () => {
  let dataDir: string
  let booted: BootedServer

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-claim-"))
    booted = await bootServer(dataDir)
  })

  afterEach(async () => {
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  function claim(body: unknown): Promise<Response> {
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {method: "POST", body: JSON.stringify(body)})
  }

  it("TC-6: the console's claim code binds the first device once, and every later claim is refused ALREADY_CLAIMED", async () => {
    const code = ensureClaimCode(booted.store)
    expect(code).toMatch(/^\d{6}$/)

    const first = await claim({code, deviceName: "MacBook Air"})
    expect(first.status).toBe(200)

    const claimed = (await first.json()) as {ok: true; data: ClaimResponse}
    expect(claimed.ok).toBe(true)
    expect(claimed.data.device.name).toBe("MacBook Air")
    expect(claimed.data.device.id).toBeTruthy()
    expect(claimed.data.token).toBeTruthy()

    const info = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.server}`)
    expect(((await info.json()) as {ok: true; data: ServerInfo}).data.claimed).toBe(true)

    const second = await claim({code, deviceName: "Mac mini"})
    expect(second.status).toBe(409)
    expect(await second.json()).toEqual({ok: false, error: {code: "ALREADY_CLAIMED", message: expect.any(String)}})

    const devices = listDevices(booted.store)
    expect(devices).toHaveLength(1)
    expect(devices[0].name).toBe("MacBook Air")

    expect(authenticateRequest(booted.store, bearer(claimed.data.token)).id).toBe(claimed.data.device.id)
  })

  it("TC-7: wrong codes count against the cap, the cap locks even the correct code, and regenerating clears the lock", async () => {
    const code = ensureClaimCode(booted.store)
    const wrongCode = code === "000000" ? "111111" : "000000"

    for (let attempt = 1; attempt <= SYNC_PROTOCOL_CONFIG.claimAttemptLimit; attempt++) {
      const wrong = await claim({code: wrongCode, deviceName: "Stranger"})
      expect(wrong.status).toBe(401)
      expect(await wrong.json()).toEqual({ok: false, error: {code: "INVALID_CLAIM_CODE", message: expect.any(String)}})
    }

    const pastTheCap = await claim({code: wrongCode, deviceName: "Stranger"})
    expect(pastTheCap.status).toBe(403)
    expect(await pastTheCap.json()).toEqual({ok: false, error: {code: "CLAIM_CODE_LOCKED", message: expect.any(String)}})

    const correctWhileLocked = await claim({code, deviceName: "MacBook Air"})
    expect(correctWhileLocked.status).toBe(403)
    expect(await correctWhileLocked.json()).toEqual({ok: false, error: {code: "CLAIM_CODE_LOCKED", message: expect.any(String)}})
    expect(listDevices(booted.store)).toHaveLength(0)

    let regenerated = regenerateClaimCode(booted.store)
    while (regenerated === code) regenerated = regenerateClaimCode(booted.store)

    const withOldCode = await claim({code, deviceName: "MacBook Air"})
    expect(withOldCode.status).toBe(401)
    expect(await withOldCode.json()).toEqual({ok: false, error: {code: "INVALID_CLAIM_CODE", message: expect.any(String)}})

    const withNewCode = await claim({code: regenerated, deviceName: "MacBook Air"})
    expect(withNewCode.status).toBe(200)
    expect(listDevices(booted.store)).toHaveLength(1)
  })
})

describe("peer enrollment", () => {
  let dataDir: string
  let booted: BootedServer

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-enroll-"))
    booted = await bootServer(dataDir)
  })

  afterEach(async () => {
    vi.useRealTimers()
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  async function claimFirstDevice(): Promise<ClaimResponse> {
    const code = ensureClaimCode(booted.store)
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName: "MacBook Air"}),
    })

    return ((await res.json()) as {ok: true; data: ClaimResponse}).data
  }

  /** This block is not about the enrollment window, so every request opens it fresh rather than tracking its lifecycle by hand. */
  function requestEnrollment(deviceName: string): Promise<Response> {
    openEnrollmentWindow(booted.store)
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollRequest}`, {method: "POST", body: JSON.stringify({deviceName})})
  }

  function readStatus(pollToken: string): Promise<Response> {
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollStatus}`, {headers: {authorization: `Bearer ${pollToken}`}})
  }

  function readPending(token: string): Promise<Response> {
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollPending}`, {headers: {authorization: `Bearer ${token}`}})
  }

  function approve(token: string, body: unknown): Promise<Response> {
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollApprove}`, {
      method: "POST",
      headers: {authorization: `Bearer ${token}`},
      body: JSON.stringify(body),
    })
  }

  function deny(token: string, body: unknown): Promise<Response> {
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollDeny}`, {
      method: "POST",
      headers: {authorization: `Bearer ${token}`},
      body: JSON.stringify(body),
    })
  }

  async function readData<T>(res: Response): Promise<T> {
    return ((await res.json()) as {ok: true; data: T}).data
  }

  it("TC-8: an unbound device is enrolled by a peer's approval, and its credential stays collectable on a repeated poll", async () => {
    const first = await claimFirstDevice()

    const requested = await requestEnrollment("Mac mini")
    expect(requested.status).toBe(200)

    const request = await readData<EnrollRequestResponse>(requested)
    expect(request.requestId).toBeTruthy()
    expect(request.code).toMatch(/^\d{6}$/)
    expect(request.pollToken).toBeTruthy()
    expect(Date.parse(request.expiresAt)).toBeGreaterThan(Date.now())

    expect(await readData<EnrollmentStatus>(await readStatus(request.pollToken))).toEqual({state: "pending"})

    const waiting = await readData<PendingEnrollmentResponse>(await readPending(first.token))
    expect(waiting.request).toEqual({
      requestId: request.requestId,
      code: request.code,
      deviceName: "Mac mini",
      requestedAt: expect.any(String),
      expiresAt: request.expiresAt,
      requestedFrom: {address: "127.0.0.1", isPrivate: true},
    })

    const approved = await approve(first.token, {requestId: request.requestId, code: request.code})
    expect(approved.status).toBe(204)

    const collected = await readData<EnrollmentStatus>(await readStatus(request.pollToken))
    if (collected.state !== "approved") throw new Error(`expected an approved status, got ${collected.state}`)
    expect(collected.device.name).toBe("Mac mini")
    expect(collected.token).toBeTruthy()

    const recollected = await readData<EnrollmentStatus>(await readStatus(request.pollToken))
    if (recollected.state !== "approved") throw new Error(`expected an approved status on the retry, got ${recollected.state}`)
    expect(recollected.device.id).toBe(collected.device.id)
    expect(recollected.token).toBe(collected.token)

    expect(authenticateRequest(booted.store, bearer(collected.token)).id).toBe(collected.device.id)

    // The newly enrolled device is a Child, and only the Parent may read the waiting request.
    const fromTheNewDevice = await readPending(collected.token)
    expect(fromTheNewDevice.status).toBe(403)
    expect(await fromTheNewDevice.json()).toEqual({ok: false, error: {code: "NOT_PARENT", message: expect.any(String)}})
  })

  it("TC-9: only one request is live at a time, a lapsed request expires without blocking a fresh one, and an uncollected approval expires too", async () => {
    const first = await claimFirstDevice()
    const request = await readData<EnrollRequestResponse>(await requestEnrollment("Mac mini"))

    const concurrent = await requestEnrollment("Mac Studio")
    expect(concurrent.status).toBe(409)
    expect(await concurrent.json()).toEqual({ok: false, error: {code: "ENROLLMENT_IN_PROGRESS", message: expect.any(String)}})

    vi.useFakeTimers({toFake: ["Date"]})
    vi.setSystemTime(Date.parse(request.expiresAt) + 1000)

    expect(await readData<EnrollmentStatus>(await readStatus(request.pollToken))).toEqual({state: "expired"})
    expect(await readData<PendingEnrollmentResponse>(await readPending(first.token))).toEqual({request: null})

    const lateApproval = await approve(first.token, {requestId: request.requestId, code: request.code})
    expect(lateApproval.status).toBe(409)
    expect(await lateApproval.json()).toEqual({ok: false, error: {code: "ENROLLMENT_NOT_PENDING", message: expect.any(String)}})

    const afterTheLapse = await requestEnrollment("Mac Studio")
    expect(afterTheLapse.status).toBe(200)

    const second = await readData<EnrollRequestResponse>(afterTheLapse)
    expect((await approve(first.token, {requestId: second.requestId, code: second.code})).status).toBe(204)

    const collected = await readData<EnrollmentStatus>(await readStatus(second.pollToken))
    expect(collected.state).toBe("approved")

    vi.setSystemTime(Date.now() + SYNC_PROTOCOL_CONFIG.enrollmentTtlMs + 1000)

    expect(await readData<EnrollmentStatus>(await readStatus(second.pollToken))).toEqual({state: "expired"})
    expect(listDevices(booted.store).map((device) => device.name)).toEqual(["MacBook Air", "Mac Studio"])
  })

  it("the collected credential's plaintext is dropped once the pickup window closes, without that request being polled again", async () => {
    const first = await claimFirstDevice()
    const request = await readData<EnrollRequestResponse>(await requestEnrollment("Mac mini"))
    await approve(first.token, {requestId: request.requestId, code: request.code})

    const collected = await readData<EnrollmentStatus>(await readStatus(request.pollToken))
    if (collected.state !== "approved") throw new Error(`expected an approved status, got ${collected.state}`)

    const readIssuedToken = (): string | null =>
      (booted.store.db.prepare(`SELECT issued_token FROM enrollment_requests WHERE id = ?`).get(request.requestId) as {issued_token: string | null})
        .issued_token

    expect(readIssuedToken()).toBe(collected.token)

    vi.useFakeTimers({toFake: ["Date"]})
    vi.setSystemTime(Date.now() + SYNC_PROTOCOL_CONFIG.enrollmentTtlMs + 1000)

    expect((await readPending(first.token)).status).toBe(200)

    expect(readIssuedToken()).toBeNull()
    expect(authenticateRequest(booted.store, bearer(collected.token)).id).toBe(collected.device.id)
    expect(listDevices(booted.store).map((device) => device.name)).toEqual(["MacBook Air", "Mac mini"])
  })

  it("TC-10: a mismatched code leaves the request pending, and a denied request is handed nothing", async () => {
    const first = await claimFirstDevice()
    const request = await readData<EnrollRequestResponse>(await requestEnrollment("Mac mini"))
    const wrongCode = request.code === "000000" ? "111111" : "000000"

    const mismatched = await approve(first.token, {requestId: request.requestId, code: wrongCode})
    expect(mismatched.status).toBe(409)
    expect(await mismatched.json()).toEqual({ok: false, error: {code: "ENROLLMENT_CODE_MISMATCH", message: expect.any(String)}})

    expect(listDevices(booted.store)).toHaveLength(1)
    expect(await readData<EnrollmentStatus>(await readStatus(request.pollToken))).toEqual({state: "pending"})
    expect((await readData<PendingEnrollmentResponse>(await readPending(first.token))).request?.requestId).toBe(request.requestId)

    expect((await deny(first.token, {requestId: request.requestId})).status).toBe(204)

    const fresh = await readData<EnrollRequestResponse>(await requestEnrollment("Mac Studio"))
    expect((await deny(first.token, {requestId: fresh.requestId})).status).toBe(204)

    expect(await readData<EnrollmentStatus>(await readStatus(fresh.pollToken))).toEqual({state: "denied"})
    expect(listDevices(booted.store)).toHaveLength(1)

    const pollTokenAsCredential = await readPending(fresh.pollToken)
    expect(pollTokenAsCredential.status).toBe(401)
    expect(await pollTokenAsCredential.json()).toEqual({ok: false, error: {code: "UNAUTHORIZED", message: expect.any(String)}})

    expect(await readData<PendingEnrollmentResponse>(await readPending(first.token))).toEqual({request: null})
  })
})

describe("console recovery", () => {
  let dataDir: string
  let booted: BootedServer

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-console-"))
    booted = await bootServer(dataDir)
  })

  afterEach(async () => {
    vi.useRealTimers()
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  async function claimFirstDevice(): Promise<ClaimResponse> {
    const code = ensureClaimCode(booted.store)
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName: "MacBook Air"}),
    })

    return ((await res.json()) as {ok: true; data: ClaimResponse}).data
  }

  function consoleEnroll(body: unknown): Promise<Response> {
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollConsole}`, {method: "POST", body: JSON.stringify(body)})
  }

  it("TC-11: a console-issued token binds one device and never a second, and an expired token is refused the same way", async () => {
    const first = await claimFirstDevice()
    revokeDevice(booted.store, first.device.id)

    const issued = createConsoleEnrollment(booted.store)

    const bound = await consoleEnroll({token: issued.token, deviceName: "Recovery Mac"})
    expect(bound.status).toBe(200)

    const credential = ((await bound.json()) as {ok: true; data: ConsoleEnrollResponse}).data
    expect(credential.device.name).toBe("Recovery Mac")
    expect(authenticateRequest(booted.store, bearer(credential.token)).id).toBe(credential.device.id)
    expect(listDevices(booted.store)).toHaveLength(2)

    const reused = await consoleEnroll({token: issued.token, deviceName: "Second Mac"})
    expect(reused.status).toBe(401)
    expect(await reused.json()).toEqual({ok: false, error: {code: "INVALID_ENROLLMENT_TOKEN", message: expect.any(String)}})
    expect(listDevices(booted.store)).toHaveLength(2)

    const fresh = createConsoleEnrollment(booted.store)
    vi.useFakeTimers({toFake: ["Date"]})
    vi.setSystemTime(Date.parse(fresh.expiresAt) + 1000)

    const expired = await consoleEnroll({token: fresh.token, deviceName: "Too Late"})
    expect(expired.status).toBe(401)
    expect(await expired.json()).toEqual({ok: false, error: {code: "INVALID_ENROLLMENT_TOKEN", message: expect.any(String)}})
    expect(listDevices(booted.store)).toHaveLength(2)
  })
})

describe("snapshot and revision http surface", () => {
  let dataDir: string
  let booted: BootedServer

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-snapshot-http-"))
    booted = await bootServer(dataDir)
  })

  afterEach(async () => {
    vi.useRealTimers()
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  async function claimFirstDevice(deviceName = "MacBook Air"): Promise<ClaimResponse> {
    const code = ensureClaimCode(booted.store)
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName}),
    })

    return ((await res.json()) as {ok: true; data: ClaimResponse}).data
  }

  async function bindSecondDevice(deviceName: string): Promise<IssuedCredential> {
    const issued = createConsoleEnrollment(booted.store)
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollConsole}`, {
      method: "POST",
      body: JSON.stringify({token: issued.token, deviceName}),
    })

    return readData<IssuedCredential>(res)
  }

  async function readData<T>(res: Response): Promise<T> {
    return ((await res.json()) as {ok: true; data: T}).data
  }

  function readSnapshot(token: string): Promise<Response> {
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {headers: {authorization: `Bearer ${token}`}})
  }

  function writeSnapshot(token: string, snapshot: unknown, expectedRevision: string | null): Promise<Response> {
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {
      method: "POST",
      headers: {authorization: `Bearer ${token}`, "content-type": "application/json"},
      body: JSON.stringify({snapshot, expectedRevision}),
    })
  }

  function readRevision(token: string): Promise<Response> {
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.revision}`, {headers: {authorization: `Bearer ${token}`}})
  }

  function snapshotDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      version: 4,
      meta: {updatedAt: "2026-08-10T12:00:00.000Z", hash: "hash-a"},
      docs: {tasks: {}},
      ...overrides,
    }
  }

  it("TC-8: a bound device's first read reports two nulls when nothing has ever been written", async () => {
    const first = await claimFirstDevice()

    const res = await readSnapshot(first.token)
    expect(res.status).toBe(200)
    expect(await readData<SnapshotReadResponse>(res)).toEqual({snapshot: null, revision: null})
  })

  it("TC-9: a conditional write is accepted from whichever bound device read the current revision, and refused from the one that did not", async () => {
    const first = await claimFirstDevice("MacBook Air")
    const second = await bindSecondDevice("Mac mini")

    const doc1 = snapshotDocument({meta: {updatedAt: "2026-08-10T12:00:00.000Z", hash: "hash-a"}})
    const firstWrite = await writeSnapshot(first.token, doc1, null)
    expect(firstWrite.status).toBe(200)
    expect(await readData<SnapshotWriteResponse>(firstWrite)).toEqual({revision: "1"})

    const firstRead = await readData<SnapshotReadResponse>(await readSnapshot(first.token))
    const secondRead = await readData<SnapshotReadResponse>(await readSnapshot(second.token))
    expect(firstRead).toEqual({snapshot: doc1, revision: "1"})
    expect(secondRead).toEqual({snapshot: doc1, revision: "1"})

    const doc2 = snapshotDocument({meta: {updatedAt: "2026-08-11T12:00:00.000Z", hash: "hash-b"}})
    const secondWrite = await writeSnapshot(second.token, doc2, secondRead.revision)
    expect(secondWrite.status).toBe(200)
    expect(await readData<SnapshotWriteResponse>(secondWrite)).toEqual({revision: "2"})

    const staleWrite = await writeSnapshot(first.token, snapshotDocument(), firstRead.revision)
    expect(staleWrite.status).toBe(409)
    expect(await staleWrite.json()).toEqual({ok: false, error: {code: "REVISION_CONFLICT", message: expect.any(String)}})

    const finalRead = await readData<SnapshotReadResponse>(await readSnapshot(first.token))
    expect(finalRead).toEqual({snapshot: doc2, revision: "2"})
  })

  it("TC-10: a write whose declared version is behind the stored one is refused, and a read afterwards is unchanged", async () => {
    const first = await claimFirstDevice()
    const doc = snapshotDocument({version: 4})
    const written = await writeSnapshot(first.token, doc, null)
    const {revision} = await readData<SnapshotWriteResponse>(written)

    const behind = await writeSnapshot(first.token, snapshotDocument({version: 3}), revision)
    expect(behind.status).toBe(409)
    expect(await behind.json()).toEqual({ok: false, error: {code: "SNAPSHOT_VERSION_BEHIND", message: expect.any(String)}})

    const after = await readData<SnapshotReadResponse>(await readSnapshot(first.token))
    expect(after).toEqual({snapshot: doc, revision})
  })

  it("TC-11: an invalid snapshot, a non-JSON body and an oversized body are each refused with their own code while the server keeps serving", async () => {
    const capped = await bootServer(dataDir, {maxSnapshotBodyBytes: 4096})

    try {
      const code = ensureClaimCode(capped.store)
      const claimRes = await fetch(`${capped.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
        method: "POST",
        body: JSON.stringify({code, deviceName: "MacBook Air"}),
      })
      const first = ((await claimRes.json()) as {ok: true; data: ClaimResponse}).data

      const doc = snapshotDocument()
      const seeded = await fetch(`${capped.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {
        method: "POST",
        headers: {authorization: `Bearer ${first.token}`},
        body: JSON.stringify({snapshot: doc, expectedRevision: null}),
      })
      const {revision} = await readData<SnapshotWriteResponse>(seeded)

      const notASnapshot = await fetch(`${capped.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {
        method: "POST",
        headers: {authorization: `Bearer ${first.token}`},
        body: JSON.stringify({snapshot: {nope: 1}, expectedRevision: revision}),
      })
      expect(notASnapshot.status).toBe(400)
      expect(await notASnapshot.json()).toEqual({ok: false, error: {code: "INVALID_SNAPSHOT", message: expect.any(String)}})

      const notJson = await fetch(`${capped.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {
        method: "POST",
        headers: {authorization: `Bearer ${first.token}`},
        body: "not json",
      })
      expect(notJson.status).toBe(400)
      expect(await notJson.json()).toEqual({ok: false, error: {code: "MALFORMED_REQUEST", message: expect.any(String)}})

      const oversized = await fetch(`${capped.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {
        method: "POST",
        headers: {authorization: `Bearer ${first.token}`},
        body: JSON.stringify({snapshot: snapshotDocument({docs: {tasks: {blob: "x".repeat(8192)}}}), expectedRevision: revision}),
      })
      expect(oversized.status).toBe(413)
      expect(await oversized.json()).toEqual({ok: false, error: {code: "PAYLOAD_TOO_LARGE", message: expect.any(String)}})

      const stillServing = await fetch(`${capped.baseUrl}${SYNC_PROTOCOL_PATHS.server}`)
      expect(stillServing.status).toBe(200)

      const after = await readData<SnapshotReadResponse>(
        await fetch(`${capped.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {headers: {authorization: `Bearer ${first.token}`}}),
      )
      expect(after).toEqual({snapshot: doc, revision})
    } finally {
      await capped.close()
    }
  })

  it("TC-12: a gzip-encoded write is stored correctly, and a gzip-accepting read comes back compressed while a plain read stays uncompressed", async () => {
    const first = await claimFirstDevice()
    const doc = snapshotDocument({
      docs: {tasks: {}, padding: "x".repeat(4096)},
      meta: {updatedAt: "2026-08-10T12:00:00.000Z", hash: "hash-gzip"},
    })

    const gzippedBody = gzipSync(Buffer.from(JSON.stringify({snapshot: doc, expectedRevision: null})))
    const written = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {
      method: "POST",
      headers: {authorization: `Bearer ${first.token}`, "content-encoding": "gzip", "content-type": "application/json"},
      body: gzippedBody,
    })
    expect(written.status).toBe(200)
    expect(await readData<SnapshotWriteResponse>(written)).toEqual({revision: "1"})

    const gzipRead = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {
      headers: {authorization: `Bearer ${first.token}`, "accept-encoding": "gzip"},
    })
    expect(gzipRead.headers.get("content-encoding")).toBe("gzip")
    expect((await readData<SnapshotReadResponse>(gzipRead)).snapshot).toEqual(doc)

    const plainRead = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {
      headers: {authorization: `Bearer ${first.token}`, "accept-encoding": "identity"},
    })
    expect(plainRead.headers.get("content-encoding")).not.toBe("gzip")
    expect((await readData<SnapshotReadResponse>(plainRead)).snapshot).toEqual(doc)
  })

  it("TC-13: the probe carries exactly revision, pendingEnrollment, protocol and role, and the revision moves only when the snapshot is written", async () => {
    const first = await claimFirstDevice()

    const beforeAnyWrite = await readData<RevisionProbe>(await readRevision(first.token))
    expect(Object.keys(beforeAnyWrite).sort()).toEqual(["pendingEnrollment", "protocol", "revision", "role"])
    expect(beforeAnyWrite).toEqual({revision: null, pendingEnrollment: false, protocol: SYNC_PROTOCOL_VERSION, role: "parent"})

    const doc = snapshotDocument()
    const written = await writeSnapshot(first.token, doc, null)
    const {revision} = await readData<SnapshotWriteResponse>(written)

    const afterWrite = await readData<RevisionProbe>(await readRevision(first.token))
    expect(Object.keys(afterWrite).sort()).toEqual(["pendingEnrollment", "protocol", "revision", "role"])
    expect(afterWrite.revision).toBe(revision)

    const currentSnapshot = await readData<SnapshotReadResponse>(await readSnapshot(first.token))
    expect(afterWrite.revision).toBe(currentSnapshot.revision)

    await readSnapshot(first.token)
    const afterPlainRead = await readData<RevisionProbe>(await readRevision(first.token))
    expect(afterPlainRead.revision).toBe(revision)

    await writeAsset(booted.store, "abc123.png", Readable.from(Buffer.from("attachment-bytes")), first.device.id, 10 * 1024 * 1024)
    const afterAssetUpload = await readData<RevisionProbe>(await readRevision(first.token))
    expect(afterAssetUpload.revision).toBe(revision)
  })

  it("TC-14: pendingEnrollment is true while a peer request waits and false once it is resolved", async () => {
    const first = await claimFirstDevice()

    openEnrollmentWindow(booted.store)
    const requested = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollRequest}`, {
      method: "POST",
      body: JSON.stringify({deviceName: "Mac mini"}),
    })
    const request = await readData<EnrollRequestResponse>(requested)

    const whileWaiting = await readData<RevisionProbe>(await readRevision(first.token))
    expect(whileWaiting.pendingEnrollment).toBe(true)

    const denied = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollDeny}`, {
      method: "POST",
      headers: {authorization: `Bearer ${first.token}`},
      body: JSON.stringify({requestId: request.requestId}),
    })
    expect(denied.status).toBe(204)

    const afterResolution = await readData<RevisionProbe>(await readRevision(first.token))
    expect(afterResolution.pendingEnrollment).toBe(false)
  })

  it("TC-17: every snapshot and revision endpoint refuses no credential and a revoked one, and touches nothing", async () => {
    const first = await claimFirstDevice()
    const doc = snapshotDocument()
    const written = await writeSnapshot(first.token, doc, null)
    const {revision} = await readData<SnapshotWriteResponse>(written)

    revokeDevice(booted.store, first.device.id)

    const endpoints: {method: "GET" | "POST"; url: string; body?: unknown}[] = [
      {method: "GET", url: SYNC_PROTOCOL_PATHS.snapshot},
      {method: "POST", url: SYNC_PROTOCOL_PATHS.snapshot, body: {snapshot: snapshotDocument(), expectedRevision: revision}},
      {method: "GET", url: SYNC_PROTOCOL_PATHS.revision},
    ]

    for (const endpoint of endpoints) {
      const noAuth = await fetch(`${booted.baseUrl}${endpoint.url}`, {
        method: endpoint.method,
        body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
      })
      expect(noAuth.status).toBe(401)
      expect(await noAuth.json()).toEqual({ok: false, error: {code: "UNAUTHORIZED", message: expect.any(String)}})

      const revokedAuth = await fetch(`${booted.baseUrl}${endpoint.url}`, {
        method: endpoint.method,
        headers: {authorization: `Bearer ${first.token}`},
        body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
      })
      expect(revokedAuth.status).toBe(403)
      expect(await revokedAuth.json()).toEqual({ok: false, error: {code: "DEVICE_REVOKED", message: expect.any(String)}})
    }

    const untouched = readStoredSnapshot(booted.store)
    expect(untouched?.revision).toBe(revision)
    expect(untouched?.document).toEqual(doc)
  })
})

describe("asset http surface", () => {
  let dataDir: string
  let booted: BootedServer

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-assets-http-"))
    booted = await bootServer(dataDir)
  })

  afterEach(async () => {
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  async function claimFirstDevice(deviceName = "MacBook Air"): Promise<ClaimResponse> {
    const code = ensureClaimCode(booted.store)
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName}),
    })

    return ((await res.json()) as {ok: true; data: ClaimResponse}).data
  }

  async function bindSecondDevice(deviceName: string): Promise<IssuedCredential> {
    const issued = createConsoleEnrollment(booted.store)
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollConsole}`, {
      method: "POST",
      body: JSON.stringify({token: issued.token, deviceName}),
    })

    return readData<IssuedCredential>(res)
  }

  async function readData<T>(res: Response): Promise<T> {
    return ((await res.json()) as {ok: true; data: T}).data
  }

  function assetUrl(baseUrl: string, name: string): string {
    return `${baseUrl}${SYNC_PROTOCOL_PATHS.assetItem}${name}`
  }

  function uploadAsset(token: string, name: string, bytes: Buffer): Promise<Response> {
    return fetch(assetUrl(booted.baseUrl, name), {method: "PUT", headers: {authorization: `Bearer ${token}`}, body: bytes})
  }

  function downloadAsset(token: string, name: string): Promise<Response> {
    return fetch(assetUrl(booted.baseUrl, name), {headers: {authorization: `Bearer ${token}`}})
  }

  function listManifest(token: string): Promise<Response> {
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.assets}`, {headers: {authorization: `Bearer ${token}`}})
  }

  function payload(byteLength: number): Buffer {
    return Buffer.from(Array.from({length: byteLength}, (_, i) => i % 256))
  }

  it("TC-15: an upload no snapshot mentions is accepted, listed once, and downloads byte-identical from another device", async () => {
    const first = await claimFirstDevice()
    const second = await bindSecondDevice("Mac mini")

    const bytes = payload(4096)
    const uploaded = await uploadAsset(first.token, "abc123.png", bytes)
    expect(uploaded.status).toBe(200)

    const expectedHash = createHash("sha256").update(bytes).digest("hex")
    const uploadData = await readData<AssetUploadResponse>(uploaded)
    expect(uploadData).toEqual({name: "abc123.png", size: bytes.length, sha256: expectedHash, uploadedAt: expect.any(String)})

    const manifestFromFirst = await readData<AssetManifestResponse>(await listManifest(first.token))
    const manifestFromSecond = await readData<AssetManifestResponse>(await listManifest(second.token))
    expect(manifestFromFirst.assets).toHaveLength(1)
    expect(manifestFromFirst.assets[0]).toEqual(uploadData)
    expect(manifestFromSecond.assets).toEqual(manifestFromFirst.assets)

    const downloaded = await downloadAsset(second.token, "abc123.png")
    expect(downloaded.status).toBe(200)
    const downloadedBytes = Buffer.from(await downloaded.arrayBuffer())
    expect(downloadedBytes.equals(bytes)).toBe(true)
  })

  it("TC-16: a never-uploaded name, a missing blob, a path-escaping name and an oversized upload are each refused with their own code", async () => {
    const capped = await bootServer(dataDir, {maxAssetBytes: 4096})

    try {
      const code = ensureClaimCode(capped.store)
      const claimRes = await fetch(`${capped.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
        method: "POST",
        body: JSON.stringify({code, deviceName: "MacBook Air"}),
      })
      const first = ((await claimRes.json()) as {ok: true; data: ClaimResponse}).data

      const bytes = payload(1024)
      const uploaded = await fetch(assetUrl(capped.baseUrl, "abc123.png"), {
        method: "PUT",
        headers: {authorization: `Bearer ${first.token}`},
        body: bytes,
      })
      expect(uploaded.status).toBe(200)

      unlinkSync(join(dataDir, "assets", "abc123.png"))

      const neverUploaded = await fetch(assetUrl(capped.baseUrl, "never-uploaded.png"), {
        headers: {authorization: `Bearer ${first.token}`},
      })
      expect(neverUploaded.status).toBe(404)
      expect(await neverUploaded.json()).toEqual({ok: false, error: {code: "ASSET_NOT_FOUND", message: expect.any(String)}})

      const missingBlob = await fetch(assetUrl(capped.baseUrl, "abc123.png"), {
        headers: {authorization: `Bearer ${first.token}`},
      })
      expect(missingBlob.status).toBe(404)
      expect(await missingBlob.json()).toEqual({ok: false, error: {code: "ASSET_NOT_FOUND", message: expect.any(String)}})

      const escaping = await fetch(`${capped.baseUrl}${SYNC_PROTOCOL_PATHS.assetItem}..%2Fescape.png`, {
        method: "PUT",
        headers: {authorization: `Bearer ${first.token}`},
        body: Buffer.from("x"),
      })
      expect(escaping.status).toBe(400)
      expect(await escaping.json()).toEqual({ok: false, error: {code: "INVALID_ASSET_NAME", message: expect.any(String)}})

      const oversized = await fetch(assetUrl(capped.baseUrl, "oversized.png"), {
        method: "PUT",
        headers: {authorization: `Bearer ${first.token}`},
        body: payload(8192),
      })
      expect(oversized.status).toBe(413)
      expect(await oversized.json()).toEqual({ok: false, error: {code: "PAYLOAD_TOO_LARGE", message: expect.any(String)}})

      const stillServing = await fetch(`${capped.baseUrl}${SYNC_PROTOCOL_PATHS.server}`)
      expect(stillServing.status).toBe(200)

      const manifest = await readData<AssetManifestResponse>(
        await fetch(`${capped.baseUrl}${SYNC_PROTOCOL_PATHS.assets}`, {headers: {authorization: `Bearer ${first.token}`}}),
      )
      expect(manifest.assets.map((entry) => entry.name)).toContain("abc123.png")

      expect(existsSync(join(dataDir, "assets", "oversized.png"))).toBe(false)
      expect(existsSync(join(dataDir, "escape.png"))).toBe(false)
      const remainingFiles = readdirSync(join(dataDir, "assets"))
      expect(remainingFiles.some((entry) => entry.startsWith(".tmp-"))).toBe(false)
      expect(remainingFiles).toEqual([])
    } finally {
      await capped.close()
    }
  })

  it("TC-18: every asset endpoint refuses no credential and a revoked one, and leaves the asset directory unchanged", async () => {
    const first = await claimFirstDevice()
    const bytes = payload(512)
    await uploadAsset(first.token, "abc123.png", bytes)

    revokeDevice(booted.store, first.device.id)

    const before = readdirSync(join(dataDir, "assets")).sort()

    const attempts: {method: "GET" | "PUT"; url: string; body?: Buffer}[] = [
      {method: "GET", url: SYNC_PROTOCOL_PATHS.assets},
      {method: "GET", url: `${SYNC_PROTOCOL_PATHS.assetItem}abc123.png`},
      {method: "PUT", url: `${SYNC_PROTOCOL_PATHS.assetItem}abc123.png`, body: Buffer.from("nope")},
    ]

    for (const attempt of attempts) {
      const noAuth = await fetch(`${booted.baseUrl}${attempt.url}`, {method: attempt.method, body: attempt.body})
      expect(noAuth.status).toBe(401)
      expect(await noAuth.json()).toEqual({ok: false, error: {code: "UNAUTHORIZED", message: expect.any(String)}})

      const revokedAuth = await fetch(`${booted.baseUrl}${attempt.url}`, {
        method: attempt.method,
        headers: {authorization: `Bearer ${first.token}`},
        body: attempt.body,
      })
      expect(revokedAuth.status).toBe(403)
      expect(await revokedAuth.json()).toEqual({ok: false, error: {code: "DEVICE_REVOKED", message: expect.any(String)}})
    }

    expect(readdirSync(join(dataDir, "assets")).sort()).toEqual(before)
  })
})

describe("the revision probe reports the protocol it speaks — TC-1, TC-15", () => {
  let dataDir: string
  let booted: BootedServer

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-protocol-revision-"))
    booted = await bootServer(dataDir)
  })

  afterEach(async () => {
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  async function claimFirstDevice(): Promise<ClaimResponse> {
    const code = ensureClaimCode(booted.store)
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName: "MacBook Air"}),
    })
    return ((await res.json()) as {ok: true; data: ClaimResponse}).data
  }

  it("TC-1: the answer to a revision request carries the protocol version this server was built with", async () => {
    const first = await claimFirstDevice()

    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.revision}`, {headers: {authorization: `Bearer ${first.token}`}})
    expect(res.status).toBe(200)

    const probe = ((await res.json()) as {ok: true; data: RevisionProbe & {protocol?: number}}).data
    expect(probe.protocol).toBe(SYNC_PROTOCOL_VERSION)
  })

  it("TC-15: a request that names no revision it already knows is answered immediately", async () => {
    const first = await claimFirstDevice()

    const startedAt = Date.now()
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.revision}`, {headers: {authorization: `Bearer ${first.token}`}})
    const elapsedMs = Date.now() - startedAt

    expect(res.status).toBe(200)
    expect(elapsedMs).toBeLessThan(1000)
  })
})

/**
 * The plan freezes `RevisionProbe`'s post-phase-1 shape and the 45-second hold duration
 * ("How", phase 4), but not the wire mechanism a client uses to say "I already know this
 * revision" — phase 4's own "Frozen for later phases" is empty. `knownRevision` as a query
 * parameter is this suite's own choice, made so these cases have something concrete to drive
 * the HTTP surface with; it is flagged in the test-writer's report as an assumption phase 4
 * may need to rename this suite to match, not a decision the plan itself took.
 */
describe("the revision probe holds a request naming a known revision — TC-12, TC-13, TC-14, TC-16", () => {
  let dataDir: string
  let booted: BootedServer

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-protocol-hold-"))
    booted = await bootServer(dataDir)
  })

  afterEach(async () => {
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  async function claimFirstDevice(deviceName = "MacBook Air"): Promise<ClaimResponse> {
    const code = ensureClaimCode(booted.store)
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {method: "POST", body: JSON.stringify({code, deviceName})})
    return ((await res.json()) as {ok: true; data: ClaimResponse}).data
  }

  async function bindSecondDevice(deviceName: string): Promise<IssuedCredential> {
    const issued = createConsoleEnrollment(booted.store)
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollConsole}`, {
      method: "POST",
      body: JSON.stringify({token: issued.token, deviceName}),
    })
    return ((await res.json()) as {ok: true; data: IssuedCredential}).data
  }

  function readRevisionKnowing(token: string, knownRevision: string | null): Promise<Response> {
    const query = knownRevision === null ? "" : `?knownRevision=${encodeURIComponent(knownRevision)}`
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.revision}${query}`, {headers: {authorization: `Bearer ${token}`}})
  }

  async function writeSnapshotAs(token: string, expectedRevision: string | null): Promise<string> {
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {
      method: "POST",
      headers: {authorization: `Bearer ${token}`, "content-type": "application/json"},
      body: JSON.stringify({
        snapshot: {version: 4, meta: {updatedAt: new Date().toISOString(), hash: `hash-${Date.now()}-${Math.random()}`}, docs: {tasks: {}}},
        expectedRevision,
      }),
    })
    if (!res.ok) throw new Error(`Could not write a test snapshot: ${res.status} ${await res.text()}`)
    return ((await res.json()) as {ok: true; data: {revision: string}}).data.revision
  }

  it("TC-12: a request naming the revision the client already knows does not come back at once", async () => {
    const first = await claimFirstDevice()
    const knownRevision = await writeSnapshotAs(first.token, null)

    let settled = false
    const pending = readRevisionKnowing(first.token, knownRevision).then((res) => {
      settled = true
      return res
    })

    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect(settled).toBe(false)

    // Move the revision so the still-open request resolves and this test can close cleanly.
    await writeSnapshotAs(first.token, knownRevision)
    const res = await pending
    expect(res.status).toBe(200)
  }, 15000)

  it("TC-13: a held request answers at once, carrying the new revision, when another client writes a new snapshot", async () => {
    const first = await claimFirstDevice("MacBook Air")
    const second = await bindSecondDevice("Mac mini")
    const knownRevision = await writeSnapshotAs(first.token, null)

    const pending = readRevisionKnowing(first.token, knownRevision)
    await new Promise((resolve) => setTimeout(resolve, 300))

    const newRevision = await writeSnapshotAs(second.token, knownRevision)

    const res = await pending
    expect(res.status).toBe(200)
    const probe = ((await res.json()) as {ok: true; data: RevisionProbe}).data
    expect(probe.revision).toBe(newRevision)
    expect(probe.revision).not.toBe(knownRevision)
  }, 15000)

  it("TC-14: a held request answers at once, saying one is waiting, when an enrollment request starts waiting", async () => {
    const first = await claimFirstDevice()
    const knownRevision = await writeSnapshotAs(first.token, null)

    const pending = readRevisionKnowing(first.token, knownRevision)
    await new Promise((resolve) => setTimeout(resolve, 300))

    openEnrollmentWindow(booted.store)
    await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollRequest}`, {method: "POST", body: JSON.stringify({deviceName: "Mac Studio"})})

    const res = await pending
    expect(res.status).toBe(200)
    const probe = ((await res.json()) as {ok: true; data: RevisionProbe}).data
    expect(probe.pendingEnrollment).toBe(true)
  }, 15000)

  it("TC-16: a hold that reaches its end with nothing changed answers as an ordinary response, not an error", async () => {
    const first = await claimFirstDevice()
    const knownRevision = await writeSnapshotAs(first.token, null)

    // The plan's own "How" names the hold at 45 seconds; this waits it out rather than guessing shorter.
    const startedAt = Date.now()
    const res = await readRevisionKnowing(first.token, knownRevision)
    const elapsedMs = Date.now() - startedAt

    // Answering fast would just be "no hold happened"; TC-16 is specifically about a hold that ran to its
    // full 45-second end. Without this, an unheld immediate answer would satisfy every assertion below too.
    expect(elapsedMs).toBeGreaterThan(40000)

    expect(res.status).toBe(200)
    const probe = ((await res.json()) as {ok: true; data: RevisionProbe}).data
    expect(probe.revision).toBe(knownRevision)

    // The caller (a client whose hold just ended) simply asks again, exactly as it would after any answer.
    const again = await readRevisionKnowing(first.token, knownRevision)
    expect(again.status).toBe(200)
  }, 120000)
})

/**
 * The plan freezes the four wire codes phase 1 adds to `ProtocolErrorCode`
 * (`NOT_PARENT`, `ENROLLMENT_WINDOW_CLOSED`, `DEVICE_NOT_FOUND`, `CANNOT_REVOKE_PARENT`) but not
 * the HTTP status each one answers at — `ProtocolError`'s `STATUS` table is not part of the
 * plan's frozen wire contract. The suites below assume each new code lands in the same family as
 * the existing code it reads closest to: `NOT_PARENT` beside `DEVICE_REVOKED`/`CLAIM_CODE_LOCKED`
 * (403 — the caller is known, the action is refused), `ENROLLMENT_WINDOW_CLOSED` and
 * `CANNOT_REVOKE_PARENT` beside `SERVER_NOT_CLAIMED`/`ENROLLMENT_IN_PROGRESS`/`ALREADY_CLAIMED`
 * (409 — the system's own state forbids this right now), and `DEVICE_NOT_FOUND` beside
 * `ENROLLMENT_NOT_FOUND`/`ASSET_NOT_FOUND` (404 — the literal, established convention for a
 * "no such thing" code in this file). Flagged here rather than settled silently: if an
 * implementer's `STATUS` table disagrees, the fix is in `ProtocolError`, not in these numbers.
 */
describe("only the Parent may act on a waiting enrollment — TC-5", () => {
  let dataDir: string
  let booted: BootedServer

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-membership-approve-"))
    booted = await bootServer(dataDir)
  })

  afterEach(async () => {
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  async function claimFirstDevice(): Promise<ClaimResponse> {
    const code = ensureClaimCode(booted.store)
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName: "MacBook Air"}),
    })
    return ((await res.json()) as {ok: true; data: ClaimResponse}).data
  }

  async function bindSecondDevice(deviceName: string): Promise<IssuedCredential> {
    const issued = createConsoleEnrollment(booted.store)
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollConsole}`, {
      method: "POST",
      body: JSON.stringify({token: issued.token, deviceName}),
    })
    return ((await res.json()) as {ok: true; data: IssuedCredential}).data
  }

  async function readData<T>(res: Response): Promise<T> {
    return ((await res.json()) as {ok: true; data: T}).data
  }

  it("TC-5: a Child is refused NOT_PARENT reading, approving or denying the waiting request, which stays pending; the Parent's own calls are answered", async () => {
    const parent = await claimFirstDevice()
    const child = await bindSecondDevice("Mac mini")

    await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollWindowOpen}`, {method: "POST", headers: {authorization: `Bearer ${parent.token}`}})
    const request = await readData<EnrollRequestResponse>(
      await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollRequest}`, {method: "POST", body: JSON.stringify({deviceName: "Mac Studio"})}),
    )

    const childPending = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollPending}`, {headers: {authorization: `Bearer ${child.token}`}})
    expect(childPending.status).toBe(403)
    expect(await childPending.json()).toEqual({ok: false, error: {code: "NOT_PARENT", message: expect.any(String)}})

    const childApprove = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollApprove}`, {
      method: "POST",
      headers: {authorization: `Bearer ${child.token}`},
      body: JSON.stringify({requestId: request.requestId, code: request.code}),
    })
    expect(childApprove.status).toBe(403)
    expect(await childApprove.json()).toEqual({ok: false, error: {code: "NOT_PARENT", message: expect.any(String)}})

    const childDeny = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollDeny}`, {
      method: "POST",
      headers: {authorization: `Bearer ${child.token}`},
      body: JSON.stringify({requestId: request.requestId}),
    })
    expect(childDeny.status).toBe(403)
    expect(await childDeny.json()).toEqual({ok: false, error: {code: "NOT_PARENT", message: expect.any(String)}})

    const stillPending = await readData<PendingEnrollmentResponse>(
      await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollPending}`, {headers: {authorization: `Bearer ${parent.token}`}}),
    )
    expect(stillPending.request?.requestId).toBe(request.requestId)

    const parentApprove = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollApprove}`, {
      method: "POST",
      headers: {authorization: `Bearer ${parent.token}`},
      body: JSON.stringify({requestId: request.requestId, code: request.code}),
    })
    expect(parentApprove.status).toBe(204)
  })
})

describe("the revision probe reports each device's own role and scopes the waiting enrollment to the Parent — TC-6", () => {
  let dataDir: string
  let booted: BootedServer

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-membership-role-probe-"))
    booted = await bootServer(dataDir)
  })

  afterEach(async () => {
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  async function claimFirstDevice(): Promise<ClaimResponse> {
    const code = ensureClaimCode(booted.store)
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName: "MacBook Air"}),
    })
    return ((await res.json()) as {ok: true; data: ClaimResponse}).data
  }

  async function bindSecondDevice(deviceName: string): Promise<IssuedCredential> {
    const issued = createConsoleEnrollment(booted.store)
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollConsole}`, {
      method: "POST",
      body: JSON.stringify({token: issued.token, deviceName}),
    })
    return ((await res.json()) as {ok: true; data: IssuedCredential}).data
  }

  async function readData<T>(res: Response): Promise<T> {
    return ((await res.json()) as {ok: true; data: T}).data
  }

  it("TC-6: each device is told its own role on the revision probe, and only the Parent is told an enrollment is waiting", async () => {
    const parent = await claimFirstDevice()
    const child = await bindSecondDevice("Mac mini")

    await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollWindowOpen}`, {method: "POST", headers: {authorization: `Bearer ${parent.token}`}})
    await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollRequest}`, {method: "POST", body: JSON.stringify({deviceName: "Mac Studio"})})

    const parentProbe = await readData<RevisionProbe>(
      await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.revision}`, {headers: {authorization: `Bearer ${parent.token}`}}),
    )
    expect(parentProbe.role).toBe("parent")
    expect(parentProbe.pendingEnrollment).toBe(true)

    const childProbe = await readData<RevisionProbe>(
      await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.revision}`, {headers: {authorization: `Bearer ${child.token}`}}),
    )
    expect(childProbe.role).toBe("child")
    expect(childProbe.pendingEnrollment).toBe(false)
  })
})

describe("the enrollment window gates asking to enroll — TC-7, TC-8", () => {
  let dataDir: string
  let booted: BootedServer

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-enroll-window-"))
    booted = await bootServer(dataDir)
  })

  afterEach(async () => {
    vi.useRealTimers()
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  async function claimFirstDevice(): Promise<ClaimResponse> {
    const code = ensureClaimCode(booted.store)
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName: "MacBook Air"}),
    })
    return ((await res.json()) as {ok: true; data: ClaimResponse}).data
  }

  async function bindSecondDevice(deviceName: string): Promise<IssuedCredential> {
    const issued = createConsoleEnrollment(booted.store)
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollConsole}`, {
      method: "POST",
      body: JSON.stringify({token: issued.token, deviceName}),
    })
    return ((await res.json()) as {ok: true; data: IssuedCredential}).data
  }

  it("TC-7: an enrollment request is refused until the Parent opens a window, accepted while it is open, and refused again once that window has run out", async () => {
    const parent = await claimFirstDevice()

    const beforeWindow = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollRequest}`, {
      method: "POST",
      body: JSON.stringify({deviceName: "Mac mini"}),
    })
    expect(beforeWindow.status).toBe(409)
    expect(await beforeWindow.json()).toEqual({ok: false, error: {code: "ENROLLMENT_WINDOW_CLOSED", message: expect.any(String)}})

    await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollWindowOpen}`, {method: "POST", headers: {authorization: `Bearer ${parent.token}`}})

    const duringWindow = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollRequest}`, {
      method: "POST",
      body: JSON.stringify({deviceName: "Mac mini"}),
    })
    expect(duringWindow.status).toBe(200)
    const request = ((await duringWindow.json()) as {ok: true; data: EnrollRequestResponse}).data

    // Denied so the second attempt below is refused only because the window has run out, not because a request is already pending.
    await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollDeny}`, {
      method: "POST",
      headers: {authorization: `Bearer ${parent.token}`},
      body: JSON.stringify({requestId: request.requestId}),
    })

    vi.useFakeTimers({toFake: ["Date"]})
    vi.setSystemTime(Date.now() + SYNC_PROTOCOL_CONFIG.enrollmentWindowMs + 1000)

    const afterWindow = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollRequest}`, {
      method: "POST",
      body: JSON.stringify({deviceName: "Mac Studio"}),
    })
    expect(afterWindow.status).toBe(409)
    expect(await afterWindow.json()).toEqual({ok: false, error: {code: "ENROLLMENT_WINDOW_CLOSED", message: expect.any(String)}})
  })

  it("TC-8: a Child cannot open the enrollment window, and no window opens from its attempt", async () => {
    await claimFirstDevice()
    const child = await bindSecondDevice("Mac mini")

    const opened = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollWindowOpen}`, {
      method: "POST",
      headers: {authorization: `Bearer ${child.token}`},
    })
    expect(opened.status).toBe(403)
    expect(await opened.json()).toEqual({ok: false, error: {code: "NOT_PARENT", message: expect.any(String)}})

    const stillClosed = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollRequest}`, {
      method: "POST",
      body: JSON.stringify({deviceName: "Mac Studio"}),
    })
    expect(stillClosed.status).toBe(409)
    expect(await stillClosed.json()).toEqual({ok: false, error: {code: "ENROLLMENT_WINDOW_CLOSED", message: expect.any(String)}})
  })
})

describe("the enrollment window gates asking, never approving — TC-9", () => {
  let dataDir: string
  let booted: BootedServer

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-window-lifecycle-"))
    booted = await bootServer(dataDir)
  })

  afterEach(async () => {
    vi.useRealTimers()
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  async function claimFirstDevice(): Promise<ClaimResponse> {
    const code = ensureClaimCode(booted.store)
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName: "MacBook Air"}),
    })
    return ((await res.json()) as {ok: true; data: ClaimResponse}).data
  }

  async function readData<T>(res: Response): Promise<T> {
    return ((await res.json()) as {ok: true; data: T}).data
  }

  function openWindow(token: string): Promise<Response> {
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollWindowOpen}`, {method: "POST", headers: {authorization: `Bearer ${token}`}})
  }

  function requestEnrollment(deviceName: string): Promise<Response> {
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollRequest}`, {method: "POST", body: JSON.stringify({deviceName})})
  }

  it("TC-9: approving the one request waiting closes the enrollment window", async () => {
    const parent = await claimFirstDevice()
    await openWindow(parent.token)
    const request = await readData<EnrollRequestResponse>(await requestEnrollment("Mac mini"))

    const approved = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollApprove}`, {
      method: "POST",
      headers: {authorization: `Bearer ${parent.token}`},
      body: JSON.stringify({requestId: request.requestId, code: request.code}),
    })
    expect(approved.status).toBe(204)

    const afterApproval = await requestEnrollment("Mac Studio")
    expect(afterApproval.status).toBe(409)
    expect(await afterApproval.json()).toEqual({ok: false, error: {code: "ENROLLMENT_WINDOW_CLOSED", message: expect.any(String)}})
  })

  it("TC-9: denying the one request waiting leaves the enrollment window open, so the other Mac can ask again", async () => {
    const parent = await claimFirstDevice()
    await openWindow(parent.token)
    const request = await readData<EnrollRequestResponse>(await requestEnrollment("Mac mini"))

    const denied = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollDeny}`, {
      method: "POST",
      headers: {authorization: `Bearer ${parent.token}`},
      body: JSON.stringify({requestId: request.requestId}),
    })
    expect(denied.status).toBe(204)

    const retried = await requestEnrollment("Mac mini")
    expect(retried.status).toBe(200)
  })

  it("TC-9: a request made inside a window stays approvable for its own lifetime after that window has run out, because the window gates asking and never approving", async () => {
    const parent = await claimFirstDevice()

    vi.useFakeTimers({toFake: ["Date"]})
    const openedAt = Date.now()

    await openWindow(parent.token)

    vi.setSystemTime(openedAt + 2000)
    const request = await readData<EnrollRequestResponse>(await requestEnrollment("Mac mini"))

    vi.setSystemTime(openedAt + SYNC_PROTOCOL_CONFIG.enrollmentWindowMs + 1000)

    const stillClosed = await requestEnrollment("Mac Studio")
    expect(stillClosed.status).toBe(409)
    expect(await stillClosed.json()).toEqual({ok: false, error: {code: "ENROLLMENT_WINDOW_CLOSED", message: expect.any(String)}})

    const approved = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollApprove}`, {
      method: "POST",
      headers: {authorization: `Bearer ${parent.token}`},
      body: JSON.stringify({requestId: request.requestId, code: request.code}),
    })
    expect(approved.status).toBe(204)
  })
})

describe("reading and revoking the device list — TC-10, TC-11", () => {
  let dataDir: string
  let booted: BootedServer

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-devices-http-"))
    booted = await bootServer(dataDir)
  })

  afterEach(async () => {
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  async function claimFirstDevice(): Promise<ClaimResponse> {
    const code = ensureClaimCode(booted.store)
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName: "MacBook Air"}),
    })
    return ((await res.json()) as {ok: true; data: ClaimResponse}).data
  }

  async function bindSecondDevice(deviceName: string): Promise<IssuedCredential> {
    const issued = createConsoleEnrollment(booted.store)
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollConsole}`, {
      method: "POST",
      body: JSON.stringify({token: issued.token, deviceName}),
    })
    return ((await res.json()) as {ok: true; data: IssuedCredential}).data
  }

  async function readData<T>(res: Response): Promise<T> {
    return ((await res.json()) as {ok: true; data: T}).data
  }

  it("TC-10: the Parent reads every device — active oldest-first, then revoked — each with its role and timestamps, plus the enrollment window; a Child is refused NOT_PARENT", async () => {
    const parent = await claimFirstDevice()
    // Created before the active Child below, so a listing that just kept creation order (rather than
    // sorting revoked devices after active ones) would put this one in the middle, not last.
    const toRevoke = await bindSecondDevice("iMac")
    const activeChild = await bindSecondDevice("Mac mini")
    revokeDevice(booted.store, toRevoke.device.id)

    await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollWindowOpen}`, {method: "POST", headers: {authorization: `Bearer ${parent.token}`}})

    const parentRead = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.devices}`, {headers: {authorization: `Bearer ${parent.token}`}})
    expect(parentRead.status).toBe(200)
    const listing = await readData<DeviceListResponse>(parentRead)

    expect(listing.devices.map((d) => d.name)).toEqual(["MacBook Air", "Mac mini", "iMac"])
    expect(listing.devices.map((d) => d.role)).toEqual(["parent", "child", "child"])
    expect(listing.devices.every((d) => typeof d.createdAt === "string" && d.createdAt.length > 0)).toBe(true)
    expect(listing.devices.find((d) => d.id === parent.device.id)?.lastSeenAt).toBeTruthy()
    expect(listing.devices.find((d) => d.id === activeChild.device.id)?.revokedAt).toBeNull()
    expect(listing.devices.find((d) => d.id === toRevoke.device.id)?.revokedAt).toBeTruthy()
    expect(listing.enrollmentWindow?.expiresAt).toBeTruthy()

    const childRead = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.devices}`, {headers: {authorization: `Bearer ${activeChild.token}`}})
    expect(childRead.status).toBe(403)
    expect(await childRead.json()).toEqual({ok: false, error: {code: "NOT_PARENT", message: expect.any(String)}})
  })

  it("TC-11: the Parent revokes a Child over the wire, cannot revoke itself, and an unknown id is refused — each answer carries the list as it now stands", async () => {
    const parent = await claimFirstDevice()
    const child = await bindSecondDevice("Mac mini")

    const revoked = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.deviceRevoke}`, {
      method: "POST",
      headers: {authorization: `Bearer ${parent.token}`, "content-type": "application/json"},
      body: JSON.stringify({deviceId: child.device.id}),
    })
    expect(revoked.status).toBe(200)
    const afterRevoke = await readData<DeviceListResponse>(revoked)
    expect(afterRevoke.devices.find((d) => d.id === child.device.id)?.revokedAt).toBeTruthy()

    const childRequest = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.revision}`, {headers: {authorization: `Bearer ${child.token}`}})
    expect(childRequest.status).toBe(403)
    expect(await childRequest.json()).toEqual({ok: false, error: {code: "DEVICE_REVOKED", message: expect.any(String)}})

    const selfRevoke = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.deviceRevoke}`, {
      method: "POST",
      headers: {authorization: `Bearer ${parent.token}`, "content-type": "application/json"},
      body: JSON.stringify({deviceId: parent.device.id}),
    })
    expect(selfRevoke.status).toBe(409)
    expect(await selfRevoke.json()).toEqual({ok: false, error: {code: "CANNOT_REVOKE_PARENT", message: expect.any(String)}})

    const stillBound = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.revision}`, {headers: {authorization: `Bearer ${parent.token}`}})
    expect(stillBound.status).toBe(200)

    const unknown = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.deviceRevoke}`, {
      method: "POST",
      headers: {authorization: `Bearer ${parent.token}`, "content-type": "application/json"},
      body: JSON.stringify({deviceId: "not-a-real-device-id"}),
    })
    expect(unknown.status).toBe(404)
    expect(await unknown.json()).toEqual({ok: false, error: {code: "DEVICE_NOT_FOUND", message: expect.any(String)}})
  })
})

describe("the approval card knows where a request came from, and a new device knows who approved it — TC-12, TC-13", () => {
  let dataDir: string
  let booted: BootedServer

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-request-origin-"))
    booted = await bootServer(dataDir)
  })

  afterEach(async () => {
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  async function claimFirstDevice(): Promise<ClaimResponse> {
    const code = ensureClaimCode(booted.store)
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName: "MacBook Air"}),
    })
    return ((await res.json()) as {ok: true; data: ClaimResponse}).data
  }

  async function readData<T>(res: Response): Promise<T> {
    return ((await res.json()) as {ok: true; data: T}).data
  }

  function requestFrom(remoteAddress: string, forwardedFor?: string): IncomingMessage {
    return {socket: {remoteAddress}, headers: forwardedFor ? {"x-forwarded-for": forwardedFor} : {}} as unknown as IncomingMessage
  }

  /**
   * `readRequestOrigin`'s "public peer" branch cannot be driven through `fetch()` against this
   * suite's own loopback-bound server — the immediate TCP peer of any request made here is always
   * `127.0.0.1`, itself private, so there is no honest way to make a *real* request arrive from a
   * public address. That branch is exercised directly against the frozen `readRequestOrigin(req)`
   * function instead, with a minimal fabricated `IncomingMessage` — the same fabrication
   * `store.test.ts` already uses for `authenticateRequest`'s request shape. The "private peer"
   * branch, and the recording/reporting `then` clause, are driven through the real booted server.
   */
  it("TC-12: a request from a private peer carrying a forwarding header is recorded at the forwarded address; a public peer's header is ignored and its own address is used instead; each carries whether the address it settled on is private", async () => {
    // Imported dynamically, and only here: `../src/http/requestOrigin` is phase 5's own new file, so a
    // static import of it would fail the whole suite's module load — including every case that has
    // nothing to do with it — for every phase before phase 5 lands.
    const {readRequestOrigin} = await import("../src/http/requestOrigin")

    const trustedForward = readRequestOrigin(requestFrom("192.168.1.10", "10.0.0.55"))
    expect(trustedForward).toEqual({address: "10.0.0.55", isPrivate: true})

    const ignoredForward = readRequestOrigin(requestFrom("203.0.113.9", "10.0.0.66"))
    expect(ignoredForward).toEqual({address: "203.0.113.9", isPrivate: false})

    const parent = await claimFirstDevice()
    await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollWindowOpen}`, {method: "POST", headers: {authorization: `Bearer ${parent.token}`}})

    const requested = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollRequest}`, {
      method: "POST",
      headers: {"x-forwarded-for": "10.0.0.77"},
      body: JSON.stringify({deviceName: "Mac mini"}),
    })
    expect(requested.status).toBe(200)

    const pending = await readData<PendingEnrollmentResponse>(
      await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollPending}`, {headers: {authorization: `Bearer ${parent.token}`}}),
    )
    expect(pending.request?.requestedFrom).toEqual({address: "10.0.0.77", isPrivate: true})
  })

  it("TC-13: the enrolled device is told the approving device's name on its status", async () => {
    const parent = await claimFirstDevice()
    await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollWindowOpen}`, {method: "POST", headers: {authorization: `Bearer ${parent.token}`}})

    const request = await readData<EnrollRequestResponse>(
      await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollRequest}`, {method: "POST", body: JSON.stringify({deviceName: "Mac mini"})}),
    )

    await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollApprove}`, {
      method: "POST",
      headers: {authorization: `Bearer ${parent.token}`},
      body: JSON.stringify({requestId: request.requestId, code: request.code}),
    })

    const status = await readData<EnrollmentStatus>(
      await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollStatus}`, {headers: {authorization: `Bearer ${request.pollToken}`}}),
    )
    if (status.state !== "approved") throw new Error(`expected an approved status, got ${status.state}`)
    expect(status.approvedBy).toBe("MacBook Air")
  })
})
