import {createHash} from "node:crypto"
import {existsSync, mkdtempSync, readdirSync, rmSync, unlinkSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {Readable} from "node:stream"
import {gzipSync} from "node:zlib"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {SYNC_PROTOCOL_CONFIG, SYNC_PROTOCOL_PATHS, SYNC_PROTOCOL_VERSION} from "@daily/protocol"

import {createAgentRequest} from "../src/agents/AgentStore"
import {writeAsset} from "../src/assets/AssetStore"
import {resolveServerConfig} from "../src/config/resolveServerConfig"
import {authenticateRequest} from "../src/devices/authenticateRequest"
import {listDevices, revokeDevice} from "../src/devices/DeviceStore"
import {createConsoleEnrollment} from "../src/enrollment/EnrollmentStore"
import {createHttpServer} from "../src/http/createHttpServer"
import {readRequestOrigin} from "../src/http/requestOrigin"
import {HEALTH_PATH} from "../src/http/routes/health"
import {ensureClaimCode, openEnrollmentWindow, regenerateClaimCode} from "../src/identity/ServerIdentityStore"
import {readSnapshot as readStoredSnapshot} from "../src/snapshot/SnapshotStore"
import {openServerStore} from "../src/store/instance"

import type {
  AgentListResponse,
  AgentWindow,
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
    expect(Object.keys(beforeAnyWrite).sort()).toEqual(["acceptsAgents", "pendingAgentRequest", "pendingEnrollment", "protocol", "revision", "role"])
    expect(beforeAnyWrite).toEqual({
      revision: null,
      pendingEnrollment: false,
      pendingAgentRequest: false,
      acceptsAgents: false,
      protocol: SYNC_PROTOCOL_VERSION,
      role: "parent",
    })

    const doc = snapshotDocument()
    const written = await writeSnapshot(first.token, doc, null)
    const {revision} = await readData<SnapshotWriteResponse>(written)

    const afterWrite = await readData<RevisionProbe>(await readRevision(first.token))
    expect(Object.keys(afterWrite).sort()).toEqual(["acceptsAgents", "pendingAgentRequest", "pendingEnrollment", "protocol", "revision", "role"])
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
   * public address. That branch is exercised directly against `readRequestOrigin(req)`
   * itself instead, with a minimal fabricated `IncomingMessage` — the same fabrication
   * `store.test.ts` already uses for `authenticateRequest`'s request shape. The "private peer"
   * branch, and the recording/reporting `then` clause, are driven through the real booted server.
   */
  it("TC-12: a request from a private peer carrying a forwarding header is recorded at the forwarded address; a public peer's header is ignored and its own address is used instead; each carries whether the address it settled on is private", async () => {
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

describe("the sync protocol speaks version 4 — TC-1", () => {
  let dataDir: string
  let booted: BootedServer

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-agents-protocol-version-"))
    booted = await bootServer(dataDir)
  })

  afterEach(async () => {
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  it("TC-1: GET /v1/server and GET /v1/revision both report protocol 4", async () => {
    const code = ensureClaimCode(booted.store)
    if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
    const claimed = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName: "MacBook Air"}),
    })
    const parent = ((await claimed.json()) as {ok: true; data: ClaimResponse}).data

    const serverInfo = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.server}`)
    expect(((await serverInfo.json()) as {ok: true; data: ServerInfo}).data.protocol).toBe(4)

    const revision = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.revision}`, {headers: {authorization: `Bearer ${parent.token}`}})
    expect(((await revision.json()) as {ok: true; data: RevisionProbe}).data.protocol).toBe(4)
  })
})

describe("which servers accept agents — TC-2", () => {
  const acceptingCases: [label: string, overrides: ServerConfigOptions, expectedAgentAddress: string][] = [
    ["a public HTTPS address", {publicUrl: "https://daily.example.com"}, "https://daily.example.com/mcp"],
    ["a loopback IP address", {publicUrl: "http://127.0.0.1:4001"}, "http://127.0.0.1:4001/mcp"],
    ["localhost", {publicUrl: "http://localhost:4001"}, "http://localhost:4001/mcp"],
    ["a public HTTPS address with a trailing slash", {publicUrl: "https://daily.example.com/"}, "https://daily.example.com/mcp"],
  ]

  it.each(acceptingCases)("TC-2: %s accepts agents and opens a window whose agentAddress is %s", async (_label, overrides, expectedAgentAddress) => {
    const dataDir = mkdtempSync(join(tmpdir(), "daily-server-accepts-agents-"))
    const booted = await bootServer(dataDir, overrides)
    try {
      const code = ensureClaimCode(booted.store)
      if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
      const claimed = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
        method: "POST",
        body: JSON.stringify({code, deviceName: "MacBook Air"}),
      })
      const parent = ((await claimed.json()) as {ok: true; data: ClaimResponse}).data

      const probe = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.revision}`, {headers: {authorization: `Bearer ${parent.token}`}})
      expect(((await probe.json()) as {ok: true; data: RevisionProbe}).data.acceptsAgents).toBe(true)

      const opened = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentWindowOpen}`, {
        method: "POST",
        headers: {authorization: `Bearer ${parent.token}`},
      })
      expect(opened.status).toBe(200)
      expect(((await opened.json()) as {ok: true; data: AgentWindow}).data.agentAddress).toBe(expectedAgentAddress)
    } finally {
      await booted.close()
      rmSync(dataDir, {recursive: true, force: true})
    }
  })

  it("TC-2: a server with no public URL refuses AGENTS_NOT_SUPPORTED opening a window, while listing and revoking an unknown agent still answer", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "daily-server-accepts-agents-none-"))
    const booted = await bootServer(dataDir)
    try {
      const code = ensureClaimCode(booted.store)
      if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
      const claimed = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
        method: "POST",
        body: JSON.stringify({code, deviceName: "MacBook Air"}),
      })
      const parent = ((await claimed.json()) as {ok: true; data: ClaimResponse}).data

      const probe = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.revision}`, {headers: {authorization: `Bearer ${parent.token}`}})
      expect(((await probe.json()) as {ok: true; data: RevisionProbe}).data.acceptsAgents).toBe(false)

      const opened = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentWindowOpen}`, {
        method: "POST",
        headers: {authorization: `Bearer ${parent.token}`},
      })
      expect(opened.status).toBe(409)
      expect(await opened.json()).toEqual({ok: false, error: {code: "AGENTS_NOT_SUPPORTED", message: expect.any(String)}})

      const list = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agents}`, {headers: {authorization: `Bearer ${parent.token}`}})
      expect(list.status).toBe(200)

      const revoke = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentRevoke}`, {
        method: "POST",
        headers: {authorization: `Bearer ${parent.token}`, "content-type": "application/json"},
        body: JSON.stringify({agentId: "no-such-agent"}),
      })
      expect(revoke.status).toBe(404)
      expect(await revoke.json()).toEqual({ok: false, error: {code: "AGENT_NOT_FOUND", message: expect.any(String)}})
    } finally {
      await booted.close()
      rmSync(dataDir, {recursive: true, force: true})
    }
  })

  it("TC-2: a self-signed server refuses AGENTS_NOT_SUPPORTED opening a window, while listing and revoking an unknown agent still answer", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "daily-server-accepts-agents-self-signed-"))
    const previousTls = process.env.DAILY_SERVER_TLS
    process.env.DAILY_SERVER_TLS = "self-signed"

    try {
      const booted = await bootServer(dataDir, {publicUrl: "https://192.0.2.10"})
      try {
        const code = ensureClaimCode(booted.store)
        if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
        const claimed = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
          method: "POST",
          body: JSON.stringify({code, deviceName: "MacBook Air"}),
        })
        const parent = ((await claimed.json()) as {ok: true; data: ClaimResponse}).data

        const probe = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.revision}`, {headers: {authorization: `Bearer ${parent.token}`}})
        expect(((await probe.json()) as {ok: true; data: RevisionProbe}).data.acceptsAgents).toBe(false)

        const opened = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentWindowOpen}`, {
          method: "POST",
          headers: {authorization: `Bearer ${parent.token}`},
        })
        expect(opened.status).toBe(409)
        expect(await opened.json()).toEqual({ok: false, error: {code: "AGENTS_NOT_SUPPORTED", message: expect.any(String)}})

        const list = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agents}`, {headers: {authorization: `Bearer ${parent.token}`}})
        expect(list.status).toBe(200)

        const revoke = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentRevoke}`, {
          method: "POST",
          headers: {authorization: `Bearer ${parent.token}`, "content-type": "application/json"},
          body: JSON.stringify({agentId: "no-such-agent"}),
        })
        expect(revoke.status).toBe(404)
        expect(await revoke.json()).toEqual({ok: false, error: {code: "AGENT_NOT_FOUND", message: expect.any(String)}})
      } finally {
        await booted.close()
      }
    } finally {
      if (previousTls === undefined) delete process.env.DAILY_SERVER_TLS
      else process.env.DAILY_SERVER_TLS = previousTls
      rmSync(dataDir, {recursive: true, force: true})
    }
  })

  it("TC-2: a window opened while a server accepted agents does not survive into GET /v1/agents once the same data directory is reopened self-signed", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "daily-server-accepts-agents-reopened-self-signed-"))
    const previousTls = process.env.DAILY_SERVER_TLS

    try {
      const accepting = await bootServer(dataDir, {publicUrl: "http://127.0.0.1:4001"})
      const code = ensureClaimCode(accepting.store)
      if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
      const claimed = await fetch(`${accepting.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
        method: "POST",
        body: JSON.stringify({code, deviceName: "MacBook Air"}),
      })
      const parent = ((await claimed.json()) as {ok: true; data: ClaimResponse}).data

      const opened = await fetch(`${accepting.baseUrl}${SYNC_PROTOCOL_PATHS.agentWindowOpen}`, {
        method: "POST",
        headers: {authorization: `Bearer ${parent.token}`},
      })
      expect(opened.status).toBe(200)

      await accepting.close()

      process.env.DAILY_SERVER_TLS = "self-signed"
      const reopened = await bootServer(dataDir, {publicUrl: "https://192.0.2.10"})
      try {
        const list = await fetch(`${reopened.baseUrl}${SYNC_PROTOCOL_PATHS.agents}`, {headers: {authorization: `Bearer ${parent.token}`}})
        expect(list.status).toBe(200)
        expect(((await list.json()) as {ok: true; data: AgentListResponse}).data.agentWindow).toBeNull()
      } finally {
        await reopened.close()
      }
    } finally {
      if (previousTls === undefined) delete process.env.DAILY_SERVER_TLS
      else process.env.DAILY_SERVER_TLS = previousTls
      rmSync(dataDir, {recursive: true, force: true})
    }
  })
})

describe("opening, replacing and closing the Agent window — TC-3", () => {
  let dataDir: string
  let booted: BootedServer
  let parent: ClaimResponse
  let child: IssuedCredential

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-agent-window-"))
    booted = await bootServer(dataDir, {publicUrl: "http://127.0.0.1:4001"})
    const code = ensureClaimCode(booted.store)
    if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
    const claimed = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName: "MacBook Air"}),
    })
    parent = ((await claimed.json()) as {ok: true; data: ClaimResponse}).data

    const issued = createConsoleEnrollment(booted.store)
    const consoleRes = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollConsole}`, {
      method: "POST",
      body: JSON.stringify({token: issued.token, deviceName: "Mac mini"}),
    })
    child = ((await consoleRes.json()) as {ok: true; data: IssuedCredential}).data
  })

  afterEach(async () => {
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  function openWindow(token: string): Promise<Response> {
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentWindowOpen}`, {method: "POST", headers: {authorization: `Bearer ${token}`}})
  }

  function closeWindow(token: string): Promise<Response> {
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentWindowClose}`, {method: "POST", headers: {authorization: `Bearer ${token}`}})
  }

  function readAgents(token: string): Promise<Response> {
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agents}`, {headers: {authorization: `Bearer ${token}`}})
  }

  it("TC-3: the Parent opens a window five minutes out; a Child opening one replaces it with the clock restarted; closing it as its owner works, closing with none open is a no-op, and closing another Mac's window is refused", async () => {
    const openedByParent = await openWindow(parent.token)
    expect(openedByParent.status).toBe(200)
    const parentWindow = ((await openedByParent.json()) as {ok: true; data: AgentWindow}).data
    expect(parentWindow.deviceId).toBe(parent.device.id)
    expect(parentWindow.agentAddress).toBe("http://127.0.0.1:4001/mcp")
    expect(Date.parse(parentWindow.expiresAt) - Date.now()).toBeGreaterThan(4 * 60 * 1000)
    expect(Date.parse(parentWindow.expiresAt) - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000)

    const openedByChild = await openWindow(child.token)
    expect(openedByChild.status).toBe(200)
    const childWindow = ((await openedByChild.json()) as {ok: true; data: AgentWindow}).data
    expect(childWindow.deviceId).toBe(child.device.id)
    expect(Date.parse(childWindow.expiresAt)).toBeGreaterThan(Date.parse(parentWindow.expiresAt) - 1000)

    const listFromParent = ((await (await readAgents(parent.token)).json()) as {ok: true; data: AgentListResponse}).data
    const listFromChild = ((await (await readAgents(child.token)).json()) as {ok: true; data: AgentListResponse}).data
    expect(listFromParent.agentWindow?.deviceId).toBe(child.device.id)
    expect(listFromChild.agentWindow?.deviceId).toBe(child.device.id)

    const parentClosingChildsWindow = await closeWindow(parent.token)
    expect(parentClosingChildsWindow.status).toBe(403)
    expect(await parentClosingChildsWindow.json()).toEqual({ok: false, error: {code: "NOT_AGENT_OWNER", message: expect.any(String)}})
    const stillOpen = ((await (await readAgents(parent.token)).json()) as {ok: true; data: AgentListResponse}).data
    expect(stillOpen.agentWindow?.deviceId).toBe(child.device.id)

    const childClosesItsOwn = await closeWindow(child.token)
    expect(childClosesItsOwn.status).toBe(204)
    const afterChildCloses = ((await (await readAgents(parent.token)).json()) as {ok: true; data: AgentListResponse}).data
    expect(afterChildCloses.agentWindow).toBeNull()

    const parentClosesWithNoneOpen = await closeWindow(parent.token)
    expect(parentClosesWithNoneOpen.status).toBe(204)
    const stillNone = ((await (await readAgents(parent.token)).json()) as {ok: true; data: AgentListResponse}).data
    expect(stillNone.agentWindow).toBeNull()
  })
})

describe("approving an agent needs a usable time zone — TC-8", () => {
  let dataDir: string
  let booted: BootedServer
  let parent: ClaimResponse

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-agent-approve-timezone-"))
    booted = await bootServer(dataDir, {publicUrl: "http://127.0.0.1:4001"})
    const code = ensureClaimCode(booted.store)
    if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
    const claimed = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName: "MacBook Air"}),
    })
    parent = ((await claimed.json()) as {ok: true; data: ClaimResponse}).data
    await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentWindowOpen}`, {method: "POST", headers: {authorization: `Bearer ${parent.token}`}})
  })

  afterEach(async () => {
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  function readDeviceTimeZone(deviceId: string): string | null {
    return (booted.store.db.prepare(`SELECT time_zone FROM devices WHERE id = ?`).get(deviceId) as {time_zone: string | null}).time_zone
  }

  function approve(body: unknown): Promise<Response> {
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentApprove}`, {
      method: "POST",
      headers: {authorization: `Bearer ${parent.token}`, "content-type": "application/json"},
      body: JSON.stringify(body),
    })
  }

  it("TC-8: an absent, empty, path-escaping or 200-character time zone each refuse INVALID_TIME_ZONE and mint nothing, leaving the same request pending for a further attempt, and a usable one then succeeds", async () => {
    const request = createAgentRequest(booted.store, {
      agentName: "Claude Code",
      returnsTo: "https://claude.ai/callback",
      isLocalProgram: false,
    })

    const badValues: (string | undefined)[] = [undefined, "", "../../etc/passwd", "a".repeat(200)]
    for (const timeZone of badValues) {
      const body: Record<string, unknown> = {requestId: request.id, code: request.code}
      if (timeZone !== undefined) body.timeZone = timeZone

      const res = await approve(body)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ok: false, error: {code: "INVALID_TIME_ZONE", message: expect.any(String)}})
      expect(readDeviceTimeZone(parent.device.id)).toBeNull()

      const stillPending = booted.store.db.prepare(`SELECT state FROM agent_requests WHERE id = ?`).get(request.id) as {state: string}
      expect(stillPending.state).toBe("pending")
    }

    const approved = await approve({requestId: request.id, code: request.code, timeZone: "Pacific/Auckland"})
    expect(approved.status).toBe(204)
    expect(readDeviceTimeZone(parent.device.id)).toBe("Pacific/Auckland")
  })
})

describe("listing and revoking agents under the Parent/Child rule — TC-11", () => {
  let dataDir: string
  let booted: BootedServer
  let parent: ClaimResponse
  let child: IssuedCredential

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-agent-list-revoke-"))
    booted = await bootServer(dataDir, {publicUrl: "http://127.0.0.1:4001"})
    const code = ensureClaimCode(booted.store)
    if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
    const claimed = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName: "MacBook Air"}),
    })
    parent = ((await claimed.json()) as {ok: true; data: ClaimResponse}).data

    const issued = createConsoleEnrollment(booted.store)
    const consoleRes = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollConsole}`, {
      method: "POST",
      body: JSON.stringify({token: issued.token, deviceName: "Mac mini"}),
    })
    child = ((await consoleRes.json()) as {ok: true; data: IssuedCredential}).data
  })

  afterEach(async () => {
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  async function mintAgent(token: string, agentName: string): Promise<string> {
    await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentWindowOpen}`, {method: "POST", headers: {authorization: `Bearer ${token}`}})
    const request = createAgentRequest(booted.store, {agentName, returnsTo: "https://claude.ai/callback", isLocalProgram: false})
    const approved = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentApprove}`, {
      method: "POST",
      headers: {authorization: `Bearer ${token}`, "content-type": "application/json"},
      body: JSON.stringify({requestId: request.id, code: request.code, timeZone: "Pacific/Auckland"}),
    })
    if (approved.status !== 204) throw new Error(`expected the agent approval to succeed, got ${approved.status}`)

    const row = booted.store.db.prepare(`SELECT id FROM agents WHERE name = ? ORDER BY created_at DESC LIMIT 1`).get(agentName) as {id: string}
    return row.id
  }

  function readAgents(token: string): Promise<Response> {
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agents}`, {headers: {authorization: `Bearer ${token}`}})
  }

  function revokeAgent(token: string, agentId: string): Promise<Response> {
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentRevoke}`, {
      method: "POST",
      headers: {authorization: `Bearer ${token}`, "content-type": "application/json"},
      body: JSON.stringify({agentId}),
    })
  }

  it("TC-11: the Parent's read carries both agents and the Child's only its own; a Child revokes its own but is refused revoking the Parent's, and the Parent revokes its own freely even after an already-revoked id", async () => {
    const agentP = await mintAgent(parent.token, "Claude Code on MacBook Air")
    const agentC = await mintAgent(child.token, "Claude Code on Mac mini")

    const parentRead = ((await (await readAgents(parent.token)).json()) as {ok: true; data: AgentListResponse}).data
    expect(parentRead.agents.map((a) => a.id).sort()).toEqual([agentP, agentC].sort())

    const childRead = ((await (await readAgents(child.token)).json()) as {ok: true; data: AgentListResponse}).data
    expect(childRead.agents.map((a) => a.id)).toEqual([agentC])

    const childRevokesOwn = await revokeAgent(child.token, agentC)
    expect(childRevokesOwn.status).toBe(200)
    const afterChildRevokesOwn = ((await childRevokesOwn.json()) as {ok: true; data: AgentListResponse}).data
    const revokedAtAfterChild = afterChildRevokesOwn.agents.find((a) => a.id === agentC)?.revokedAt
    expect(revokedAtAfterChild).toBeTruthy()

    const childRevokesParents = await revokeAgent(child.token, agentP)
    expect(childRevokesParents.status).toBe(403)
    expect(await childRevokesParents.json()).toEqual({ok: false, error: {code: "NOT_AGENT_OWNER", message: expect.any(String)}})
    const stillUntouched = ((await (await readAgents(parent.token)).json()) as {ok: true; data: AgentListResponse}).data
    expect(stillUntouched.agents.find((a) => a.id === agentP)?.revokedAt).toBeNull()

    const parentRevokesAlreadyRevoked = await revokeAgent(parent.token, agentC)
    expect(parentRevokesAlreadyRevoked.status).toBe(200)
    const unchanged = ((await parentRevokesAlreadyRevoked.json()) as {ok: true; data: AgentListResponse}).data
    expect(unchanged.agents.find((a) => a.id === agentC)?.revokedAt).toBe(revokedAtAfterChild)

    const parentRevokesOwn = await revokeAgent(parent.token, agentP)
    expect(parentRevokesOwn.status).toBe(200)
    const finalList = ((await parentRevokesOwn.json()) as {ok: true; data: AgentListResponse}).data
    expect(finalList.agents.find((a) => a.id === agentP)?.revokedAt).toBeTruthy()
  })
})

describe("an empty agent list, before and after a window opens — TC-12", () => {
  let dataDir: string
  let booted: BootedServer
  let parent: ClaimResponse
  let child: IssuedCredential

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-agents-empty-list-"))
    booted = await bootServer(dataDir, {publicUrl: "http://127.0.0.1:4001"})
    const code = ensureClaimCode(booted.store)
    if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
    const claimed = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName: "MacBook Air"}),
    })
    parent = ((await claimed.json()) as {ok: true; data: ClaimResponse}).data

    const issued = createConsoleEnrollment(booted.store)
    const consoleRes = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollConsole}`, {
      method: "POST",
      body: JSON.stringify({token: issued.token, deviceName: "Mac mini"}),
    })
    child = ((await consoleRes.json()) as {ok: true; data: IssuedCredential}).data
  })

  afterEach(async () => {
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  function readAgents(token: string): Promise<Response> {
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agents}`, {headers: {authorization: `Bearer ${token}`}})
  }

  it("TC-12: with no agent connected both Macs read an empty list and no window; once the Parent opens one both reads carry it; revoking an unknown id is refused without changing the list", async () => {
    const parentFirstRead = ((await (await readAgents(parent.token)).json()) as {ok: true; data: AgentListResponse}).data
    expect(parentFirstRead).toEqual({agents: [], agentWindow: null})
    const childFirstRead = ((await (await readAgents(child.token)).json()) as {ok: true; data: AgentListResponse}).data
    expect(childFirstRead).toEqual({agents: [], agentWindow: null})

    const opened = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentWindowOpen}`, {
      method: "POST",
      headers: {authorization: `Bearer ${parent.token}`},
    })
    expect(opened.status).toBe(200)

    const parentSecondRead = ((await (await readAgents(parent.token)).json()) as {ok: true; data: AgentListResponse}).data
    expect(parentSecondRead.agents).toEqual([])
    expect(parentSecondRead.agentWindow?.deviceId).toBe(parent.device.id)
    expect(parentSecondRead.agentWindow?.agentAddress).toBe("http://127.0.0.1:4001/mcp")
    expect(Date.parse(parentSecondRead.agentWindow?.expiresAt ?? "")).toBeGreaterThan(Date.now())

    const childSecondRead = ((await (await readAgents(child.token)).json()) as {ok: true; data: AgentListResponse}).data
    expect(childSecondRead.agents).toEqual([])
    expect(childSecondRead.agentWindow).toEqual(parentSecondRead.agentWindow)

    const revoke = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentRevoke}`, {
      method: "POST",
      headers: {authorization: `Bearer ${parent.token}`, "content-type": "application/json"},
      body: JSON.stringify({agentId: "no-such-agent"}),
    })
    expect(revoke.status).toBe(404)
    expect(await revoke.json()).toEqual({ok: false, error: {code: "AGENT_NOT_FOUND", message: expect.any(String)}})

    const unchanged = ((await (await readAgents(parent.token)).json()) as {ok: true; data: AgentListResponse}).data
    expect(unchanged).toEqual(parentSecondRead)
  })
})

describe("the Mac's time zone rides on every probe — TC-14", () => {
  let dataDir: string
  let booted: BootedServer
  let parent: ClaimResponse
  let originalRevisionHoldMs: number

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-agent-probe-timezone-"))
    booted = await bootServer(dataDir)
    const code = ensureClaimCode(booted.store)
    if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
    const claimed = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName: "MacBook Air"}),
    })
    parent = ((await claimed.json()) as {ok: true; data: ClaimResponse}).data
    originalRevisionHoldMs = SYNC_PROTOCOL_CONFIG.revisionHoldMs
  })

  afterEach(async () => {
    ;(SYNC_PROTOCOL_CONFIG as {revisionHoldMs: number}).revisionHoldMs = originalRevisionHoldMs
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  function readTimeZone(): string | null {
    return (booted.store.db.prepare(`SELECT time_zone FROM devices WHERE id = ?`).get(parent.device.id) as {time_zone: string | null}).time_zone
  }

  function probe(query: string): Promise<Response> {
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.revision}${query}`, {headers: {authorization: `Bearer ${parent.token}`}})
  }

  it("TC-14: a usable time zone lands in devices.time_zone on every probe, an unusable or absent one leaves it standing, and a held probe writes it exactly once rather than once per poll", async () => {
    expect(readTimeZone()).toBeNull()

    const toTokyo = await probe("?timeZone=Asia/Tokyo")
    expect(toTokyo.status).toBe(200)
    expect(readTimeZone()).toBe("Asia/Tokyo")

    const toBelgrade = await probe("?timeZone=Europe/Belgrade")
    expect(toBelgrade.status).toBe(200)
    expect(readTimeZone()).toBe("Europe/Belgrade")

    for (const badQuery of ["?timeZone=..%2F..%2Fetc%2Fpasswd", `?timeZone=${"a".repeat(200)}`, ""]) {
      const res = await probe(badQuery)
      expect(res.status).toBe(200)
      const body = ((await res.json()) as {ok: true; data: RevisionProbe}).data
      expect(typeof body.pendingEnrollment).toBe("boolean")
      expect(readTimeZone()).toBe("Europe/Belgrade")
    }

    const seeded = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {
      method: "POST",
      headers: {authorization: `Bearer ${parent.token}`, "content-type": "application/json"},
      body: JSON.stringify({
        snapshot: {version: 4, meta: {updatedAt: new Date().toISOString(), hash: "hash-a"}, docs: {tasks: {}}},
        expectedRevision: null,
      }),
    })
    const currentRevision = ((await seeded.json()) as {ok: true; data: {revision: string}}).data.revision

    ;(SYNC_PROTOCOL_CONFIG as {revisionHoldMs: number}).revisionHoldMs = 300
    const prepareSpy = vi.spyOn(booted.store.db, "prepare")
    const held = await probe(`?knownRevision=${encodeURIComponent(currentRevision)}&timeZone=America/New_York`)
    expect(held.status).toBe(200)
    expect(readTimeZone()).toBe("America/New_York")

    const timeZoneWrites = prepareSpy.mock.calls.filter(([sql]) => typeof sql === "string" && /UPDATE\s+devices\s+SET\s+time_zone/i.test(sql))
    expect(timeZoneWrites).toHaveLength(1)
  }, 10000)
})

describe("approving an agent sends this Mac's own time zone, touching no other device's — TC-15", () => {
  let dataDir: string
  let booted: BootedServer
  let parent: ClaimResponse
  let child: IssuedCredential

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-agent-approve-owns-timezone-"))
    booted = await bootServer(dataDir, {publicUrl: "http://127.0.0.1:4001"})
    const code = ensureClaimCode(booted.store)
    if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
    const claimed = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName: "MacBook Air"}),
    })
    parent = ((await claimed.json()) as {ok: true; data: ClaimResponse}).data
    booted.store.db.prepare(`UPDATE devices SET time_zone = ? WHERE id = ?`).run("Europe/Belgrade", parent.device.id)

    const issued = createConsoleEnrollment(booted.store)
    const consoleRes = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollConsole}`, {
      method: "POST",
      body: JSON.stringify({token: issued.token, deviceName: "Mac mini"}),
    })
    child = ((await consoleRes.json()) as {ok: true; data: IssuedCredential}).data

    await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentWindowOpen}`, {method: "POST", headers: {authorization: `Bearer ${parent.token}`}})
  })

  afterEach(async () => {
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  function readTimeZone(deviceId: string): string | null {
    return (booted.store.db.prepare(`SELECT time_zone FROM devices WHERE id = ?`).get(deviceId) as {time_zone: string | null}).time_zone
  }

  it("TC-15: approving with a fresh time zone overwrites this Mac's own stored zone and leaves every other device's untouched", async () => {
    const request = createAgentRequest(booted.store, {
      agentName: "Claude Code",
      returnsTo: "https://claude.ai/callback",
      isLocalProgram: false,
    })

    const approved = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentApprove}`, {
      method: "POST",
      headers: {authorization: `Bearer ${parent.token}`, "content-type": "application/json"},
      body: JSON.stringify({requestId: request.id, code: request.code, timeZone: "Pacific/Auckland"}),
    })
    expect(approved.status).toBe(204)

    expect(readTimeZone(parent.device.id)).toBe("Pacific/Auckland")
    expect(readTimeZone(child.device.id)).toBeNull()
  })
})

describe("the revision probe's exact shape once agents exist — TC-16", () => {
  let dataDir: string
  let booted: BootedServer
  let parent: ClaimResponse
  let child: IssuedCredential

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-agent-probe-shape-"))
    booted = await bootServer(dataDir, {publicUrl: "http://127.0.0.1:4001"})
    const code = ensureClaimCode(booted.store)
    if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
    const claimed = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName: "MacBook Air"}),
    })
    parent = ((await claimed.json()) as {ok: true; data: ClaimResponse}).data

    const issued = createConsoleEnrollment(booted.store)
    const consoleRes = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollConsole}`, {
      method: "POST",
      body: JSON.stringify({token: issued.token, deviceName: "Mac mini"}),
    })
    child = ((await consoleRes.json()) as {ok: true; data: IssuedCredential}).data
  })

  afterEach(async () => {
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  it("TC-16: with nothing waiting, both Macs' probes carry exactly six keys, agree acceptsAgents is true and protocol is 4, both report no request pending, and each names its own role", async () => {
    const parentProbe = (
      (await (await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.revision}`, {headers: {authorization: `Bearer ${parent.token}`}})).json()) as {
        ok: true
        data: RevisionProbe
      }
    ).data
    expect(Object.keys(parentProbe).sort()).toEqual(["acceptsAgents", "pendingAgentRequest", "pendingEnrollment", "protocol", "revision", "role"])
    expect(parentProbe.pendingAgentRequest).toBe(false)
    expect(parentProbe.acceptsAgents).toBe(true)
    expect(parentProbe.protocol).toBe(4)
    expect(parentProbe.role).toBe("parent")

    const childProbe = (
      (await (await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.revision}`, {headers: {authorization: `Bearer ${child.token}`}})).json()) as {
        ok: true
        data: RevisionProbe
      }
    ).data
    expect(Object.keys(childProbe).sort()).toEqual(["acceptsAgents", "pendingAgentRequest", "pendingEnrollment", "protocol", "revision", "role"])
    expect(childProbe.pendingAgentRequest).toBe(false)
    expect(childProbe.acceptsAgents).toBe(true)
    expect(childProbe.role).toBe("child")
  })
})

describe("pendingAgentRequest is scoped to the window's own Mac — TC-17", () => {
  let dataDir: string
  let booted: BootedServer
  let parent: ClaimResponse
  let child: IssuedCredential

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-agent-pending-scope-"))
    booted = await bootServer(dataDir, {publicUrl: "http://127.0.0.1:4001"})
    const code = ensureClaimCode(booted.store)
    if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
    const claimed = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName: "MacBook Air"}),
    })
    parent = ((await claimed.json()) as {ok: true; data: ClaimResponse}).data

    const issued = createConsoleEnrollment(booted.store)
    const consoleRes = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollConsole}`, {
      method: "POST",
      body: JSON.stringify({token: issued.token, deviceName: "Mac mini"}),
    })
    child = ((await consoleRes.json()) as {ok: true; data: IssuedCredential}).data
  })

  afterEach(async () => {
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  async function probe(token: string): Promise<RevisionProbe> {
    const res = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.revision}`, {headers: {authorization: `Bearer ${token}`}})
    return ((await res.json()) as {ok: true; data: RevisionProbe}).data
  }

  it("TC-17: pendingAgentRequest is true only for the Mac whose window a request waits on, moves to false once decided, and follows the request to whichever Mac opens next; pendingEnrollment never turns true", async () => {
    await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentWindowOpen}`, {method: "POST", headers: {authorization: `Bearer ${parent.token}`}})
    const request = createAgentRequest(booted.store, {
      agentName: "Claude Code",
      returnsTo: "https://claude.ai/callback",
      isLocalProgram: false,
    })

    const parentWhileWaiting = await probe(parent.token)
    expect(parentWhileWaiting.pendingAgentRequest).toBe(true)
    expect(parentWhileWaiting.pendingEnrollment).toBe(false)
    const childWhileWaiting = await probe(child.token)
    expect(childWhileWaiting.pendingAgentRequest).toBe(false)
    expect(childWhileWaiting.pendingEnrollment).toBe(false)

    const approved = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentApprove}`, {
      method: "POST",
      headers: {authorization: `Bearer ${parent.token}`, "content-type": "application/json"},
      body: JSON.stringify({requestId: request.id, code: request.code, timeZone: "Pacific/Auckland"}),
    })
    expect(approved.status).toBe(204)

    expect((await probe(parent.token)).pendingAgentRequest).toBe(false)
    expect((await probe(child.token)).pendingAgentRequest).toBe(false)

    await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentWindowOpen}`, {method: "POST", headers: {authorization: `Bearer ${child.token}`}})
    createAgentRequest(booted.store, {agentName: "Claude Code", returnsTo: "https://claude.ai/callback", isLocalProgram: false})

    const parentFinal = await probe(parent.token)
    expect(parentFinal.pendingAgentRequest).toBe(false)
    expect(parentFinal.pendingEnrollment).toBe(false)
    const childFinal = await probe(child.token)
    expect(childFinal.pendingAgentRequest).toBe(true)
    expect(childFinal.pendingEnrollment).toBe(false)
  })
})

describe("a request that starts waiting for this Mac releases its held probe early; one that starts waiting for another Mac does not — TC-18", () => {
  let dataDir: string
  let booted: BootedServer
  let parent: ClaimResponse
  let child: IssuedCredential
  let originalRevisionHoldMs: number
  let currentRevision: string

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-server-agent-held-probe-"))
    booted = await bootServer(dataDir, {publicUrl: "http://127.0.0.1:4001"})
    const code = ensureClaimCode(booted.store)
    if (!code) throw new Error("expected an unclaimed test server to hold a claim code")
    const claimed = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.claim}`, {
      method: "POST",
      body: JSON.stringify({code, deviceName: "MacBook Air"}),
    })
    parent = ((await claimed.json()) as {ok: true; data: ClaimResponse}).data

    const issued = createConsoleEnrollment(booted.store)
    const consoleRes = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.enrollConsole}`, {
      method: "POST",
      body: JSON.stringify({token: issued.token, deviceName: "Mac mini"}),
    })
    child = ((await consoleRes.json()) as {ok: true; data: IssuedCredential}).data

    const seeded = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {
      method: "POST",
      headers: {authorization: `Bearer ${parent.token}`, "content-type": "application/json"},
      body: JSON.stringify({
        snapshot: {version: 4, meta: {updatedAt: new Date().toISOString(), hash: "hash-a"}, docs: {tasks: {}}},
        expectedRevision: null,
      }),
    })
    currentRevision = ((await seeded.json()) as {ok: true; data: {revision: string}}).data.revision

    originalRevisionHoldMs = SYNC_PROTOCOL_CONFIG.revisionHoldMs
    ;(SYNC_PROTOCOL_CONFIG as {revisionHoldMs: number}).revisionHoldMs = 1200
  })

  afterEach(async () => {
    ;(SYNC_PROTOCOL_CONFIG as {revisionHoldMs: number}).revisionHoldMs = originalRevisionHoldMs
    await booted.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  function holdForParent(): Promise<{status: number; data: RevisionProbe; elapsedMs: number}> {
    const startedAt = Date.now()
    return fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.revision}?knownRevision=${encodeURIComponent(currentRevision)}`, {
      headers: {authorization: `Bearer ${parent.token}`},
    }).then(async (res) => ({
      status: res.status,
      data: ((await res.json()) as {ok: true; data: RevisionProbe}).data,
      elapsedMs: Date.now() - startedAt,
    }))
  }

  it("TC-18: a request created for the Parent's own open window releases its held probe well before the deadline with pendingAgentRequest true and the revision unchanged; a request created for the Child's window does not, and the Parent's hold runs to its own end reporting false", async () => {
    await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentWindowOpen}`, {method: "POST", headers: {authorization: `Bearer ${parent.token}`}})

    const parentsOwnHold = holdForParent()
    await new Promise((resolve) => setTimeout(resolve, 150))
    createAgentRequest(booted.store, {agentName: "Claude Code", returnsTo: "https://claude.ai/callback", isLocalProgram: false})

    const releasedEarly = await parentsOwnHold
    expect(releasedEarly.status).toBe(200)
    expect(releasedEarly.data.pendingAgentRequest).toBe(true)
    expect(releasedEarly.data.revision).toBe(currentRevision)
    expect(releasedEarly.elapsedMs).toBeLessThan(900)

    const pendingRow = booted.store.db.prepare(`SELECT id FROM agent_requests WHERE state = 'pending' ORDER BY created_at DESC LIMIT 1`).get() as {
      id: string
    }
    const denied = await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentDeny}`, {
      method: "POST",
      headers: {authorization: `Bearer ${parent.token}`, "content-type": "application/json"},
      body: JSON.stringify({requestId: pendingRow.id}),
    })
    expect(denied.status).toBe(204)

    await fetch(`${booted.baseUrl}${SYNC_PROTOCOL_PATHS.agentWindowOpen}`, {method: "POST", headers: {authorization: `Bearer ${child.token}`}})

    const parentsHoldWhileChildWaits = holdForParent()
    await new Promise((resolve) => setTimeout(resolve, 150))
    createAgentRequest(booted.store, {agentName: "Claude Code", returnsTo: "https://claude.ai/callback", isLocalProgram: false})

    const ranToItsEnd = await parentsHoldWhileChildWaits
    expect(ranToItsEnd.status).toBe(200)
    expect(ranToItsEnd.data.pendingAgentRequest).toBe(false)
    expect(ranToItsEnd.elapsedMs).toBeGreaterThanOrEqual(1100)
  }, 15000)
})
