import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {SYNC_PROTOCOL_CONFIG} from "@shared/config/syncProtocol"
import {SYNC_PROTOCOL_PATHS} from "@shared/types/syncProtocol"

import {resolveServerConfig} from "@server/config/resolveServerConfig"
import {authenticateRequest} from "@server/devices/authenticateRequest"
import {listDevices, revokeDevice} from "@server/devices/DeviceStore"
import {createConsoleEnrollment} from "@server/enrollment/EnrollmentStore"
import {createHttpServer} from "@server/http/createHttpServer"
import {ensureClaimCode, regenerateClaimCode} from "@server/identity/ServerIdentityStore"
import {openServerStore} from "@server/store/instance"

import type {ServerStore} from "@server/store/instance"
import type {
  ClaimResponse,
  ConsoleEnrollResponse,
  EnrollmentStatus,
  EnrollRequestResponse,
  PendingEnrollmentResponse,
  ServerInfo,
} from "@shared/types/syncProtocol"
import type {IncomingMessage} from "node:http"
import type {AddressInfo} from "node:net"

type BootedServer = {
  baseUrl: string
  store: ServerStore
  close(): Promise<void>
}

function bearer(token: string): IncomingMessage {
  return {headers: {authorization: `Bearer ${token}`}} as IncomingMessage
}

function bootServer(dataDir: string): Promise<BootedServer> {
  const config = resolveServerConfig({dataDir, host: "127.0.0.1", port: 0})
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
      data: {protocol: 1, serverId: row.server_id, name: expect.any(String), claimed: false},
    })
  })

  it("TC-4: an unknown path, a wrong method, a non-JSON body and an oversized body are each refused with a stable code, and the server keeps serving", async () => {
    const unknownPath = await fetch(`${booted.baseUrl}/v1/nope`)
    expect(unknownPath.status).toBe(404)
    expect(await unknownPath.json()).toEqual({ok: false, error: {code: "UNKNOWN_ROUTE", message: expect.any(String)}})

    const wrongMethod = await fetch(`${booted.baseUrl}/v1/server`, {method: "POST", body: JSON.stringify({})})
    expect(wrongMethod.status).toBe(405)
    expect(await wrongMethod.json()).toEqual({ok: false, error: {code: "METHOD_NOT_ALLOWED", message: expect.any(String)}})

    const notJson = await fetch(`${booted.baseUrl}/v1/server`, {method: "POST", body: "not json"})
    expect(notJson.status).toBe(400)
    expect(await notJson.json()).toEqual({ok: false, error: {code: "MALFORMED_REQUEST", message: expect.any(String)}})

    const oversizedBody = "x".repeat(SYNC_PROTOCOL_CONFIG.maxControlRequestBodyBytes + 1024)
    const tooLarge = await fetch(`${booted.baseUrl}/v1/server`, {method: "POST", body: oversizedBody})
    expect(tooLarge.status).toBe(413)
    expect(await tooLarge.json()).toEqual({ok: false, error: {code: "PAYLOAD_TOO_LARGE", message: expect.any(String)}})

    const stillServing = await fetch(`${booted.baseUrl}/v1/server`)
    expect(stillServing.status).toBe(200)
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

  function requestEnrollment(deviceName: string): Promise<Response> {
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

    const fromTheNewDevice = await readPending(collected.token)
    expect(fromTheNewDevice.status).toBe(200)
    expect(await readData<PendingEnrollmentResponse>(fromTheNewDevice)).toEqual({request: null})
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
