import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {SYNC_PROTOCOL_CONFIG, SYNC_PROTOCOL_PATHS, SyncServerError, SyncServerErrorCode} from "@daily/protocol"
import {revokeDevice} from "@daily/server/devices/DeviceStore"
import {ensureClaimCode, isClaimed} from "@daily/server/identity/ServerIdentityStore"

import {createStorageCore} from "@core/storage/createStorageCore"
import {getDefaultSettings} from "@core/storage/models/_rowMappers"
import {StorageController} from "@core/storage/StorageController"
import {ServerProviderService} from "@core/storage/sync/server/ServerProviderService"
import {toBindingView, toSettingsView} from "@core/utils/sync/settingsViews"
import {assertSingleActiveProvider, buildSyncRemotes, resolveActiveProvider} from "@core/utils/sync/syncProvider"
import {isBlockedAddress} from "@core/utils/web/isBlockedAddress"
import {createTestDatabase} from "../../../helpers/db"
import {bootSyncServer, claimFirstDevice, enrollSecondDevice} from "../../../helpers/syncServer"

import type {IssuedCredential, ServerSyncBinding, Settings, SyncSettings} from "@daily/protocol"
import type {BootedSyncServer} from "../../../helpers/syncServer"

/**
 * `isPrivateServerAddress` (phase 2) has no injectable lookup, and this sandbox cannot manufacture
 * a genuinely public, reachable address (confirmed empirically: neither a loopback alias like
 * `127.0.0.2` nor a real internet-facing listener is available here). TC-12's "public address" half
 * is therefore driven against the same real, reachable local server as the "private" half, with only
 * the one classification call the plan names (`isBlockedAddress`) stubbed for that one probe — every
 * other step (the real HTTP round trip, the insecure gate, the binding write) runs unmocked.
 */
vi.mock("../../../../src/utils/web/isBlockedAddress", async (importOriginal) => {
  const actual = await importOriginal<{isBlockedAddress: typeof isBlockedAddress}>()
  return {isBlockedAddress: vi.fn(actual.isBlockedAddress)}
})

/**
 * `ServerProviderService` is constructed with the union of every dependency phase 3 and phase 4
 * freeze on it: `loadSettings`/`saveSettings`/`onBindingChanged` (phase 3), and `runSyncCycle`/
 * `onApprovalRequested` (phase 4, "two more dependencies" added to the same object per the plan).
 * Cases that never touch the probe scheduler pass no-ops for the phase-4 pair.
 */
function makeSettingsStore(overrides: Partial<SyncSettings> = {}) {
  let settings: Settings = {...getDefaultSettings(), sync: {...getDefaultSettings().sync, ...overrides}}

  return {
    loadSettings: async (): Promise<Settings> => structuredClone(settings),
    saveSettings: async (partial: Partial<Settings>): Promise<void> => {
      settings = {...settings, ...partial, sync: partial.sync ? {...settings.sync, ...partial.sync} : settings.sync}
    },
    snapshot: (): Settings => settings,
  }
}

function makeService(
  store: ReturnType<typeof makeSettingsStore>,
  overrides: {
    onBindingChanged?: () => Promise<void>
    runSyncCycle?: () => Promise<void>
    onApprovalRequested?: () => void
    disableAutoSync?: () => void
    onRevoked?: () => void
  } = {},
): ServerProviderService {
  return new ServerProviderService({
    loadSettings: store.loadSettings,
    saveSettings: store.saveSettings,
    onBindingChanged: overrides.onBindingChanged ?? (async () => {}),
    runSyncCycle: overrides.runSyncCycle ?? (async () => {}),
    onApprovalRequested: overrides.onApprovalRequested ?? (() => {}),
    disableAutoSync: overrides.disableAutoSync ?? (() => {}),
    onRevoked: overrides.onRevoked ?? (() => {}),
  } as never)
}

function makeBinding(overrides: Partial<ServerSyncBinding> = {}): ServerSyncBinding {
  return {
    baseUrl: "http://127.0.0.1:8787",
    serverId: "srv-1",
    serverName: "Home Server",
    deviceId: "dev-1",
    deviceName: "MacBook Air",
    token: "token-abc",
    fingerprint: null,
    insecure: true,
    boundAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  }
}

function bindingFromCredential(
  server: BootedSyncServer,
  credential: IssuedCredential,
  overrides: Partial<ServerSyncBinding> = {},
): ServerSyncBinding {
  return makeBinding({
    baseUrl: server.baseUrl,
    deviceId: credential.device.id,
    deviceName: credential.device.name,
    token: credential.token,
    ...overrides,
  })
}

function throwsProviderConflict(fn: () => void): SyncServerErrorCode | null {
  try {
    fn()
    return null
  } catch (error) {
    expect(error).toBeInstanceOf(SyncServerError)
    return (error as SyncServerError).code
  }
}

describe("resolveActiveProvider and buildSyncRemotes agree on exactly one writable provider", () => {
  it("resolves_TC-1_a_single_active_provider_and_rejects_the_pairings_that_would_make_two_writable", () => {
    const off: SyncSettings = {iCloud: {enabled: false}, server: {enabled: false, binding: null}}
    const icloudOnly: SyncSettings = {iCloud: {enabled: true}, server: {enabled: false, binding: null}}
    const serverOnly: SyncSettings = {iCloud: {enabled: false}, server: {enabled: true, binding: makeBinding()}}
    const both: SyncSettings = {iCloud: {enabled: true}, server: {enabled: true, binding: makeBinding()}}

    expect(resolveActiveProvider(off)).toBe("off")
    expect(resolveActiveProvider(icloudOnly)).toBe("icloud")
    expect(resolveActiveProvider(serverOnly)).toBe("server")
    expect(resolveActiveProvider(both)).toBe("server")

    const paths = {icloudSyncDir: "/tmp/daily-icloud-sync-dir"}
    expect(buildSyncRemotes(off, paths)).toHaveLength(0)
    expect(buildSyncRemotes(icloudOnly, paths)).toHaveLength(1)
    expect(buildSyncRemotes(serverOnly, paths)).toHaveLength(1)
    expect(buildSyncRemotes(both, paths).length).toBeLessThanOrEqual(1)

    expect(() => assertSingleActiveProvider(off)).not.toThrow()
    expect(() => assertSingleActiveProvider(icloudOnly)).not.toThrow()
    expect(() => assertSingleActiveProvider(serverOnly)).not.toThrow()
    expect(throwsProviderConflict(() => assertSingleActiveProvider(both))).toBe(SyncServerErrorCode.PROVIDER_CONFLICT)
  })
})

describe("the single guard on every settings write", () => {
  it("throws_TC-1_PROVIDER_CONFLICT_only_on_the_fourth_combination_and_saveSettings_rejects_leaving_the_stored_row_untouched", async () => {
    const off: SyncSettings = {iCloud: {enabled: false}, server: {enabled: false, binding: null}}
    const icloudOnly: SyncSettings = {iCloud: {enabled: true}, server: {enabled: false, binding: null}}
    const serverOnly: SyncSettings = {iCloud: {enabled: false}, server: {enabled: true, binding: makeBinding()}}
    const both: SyncSettings = {iCloud: {enabled: true}, server: {enabled: true, binding: makeBinding()}}

    expect(() => assertSingleActiveProvider(off)).not.toThrow()
    expect(() => assertSingleActiveProvider(icloudOnly)).not.toThrow()
    expect(() => assertSingleActiveProvider(serverOnly)).not.toThrow()
    expect(throwsProviderConflict(() => assertSingleActiveProvider(both))).toBe(SyncServerErrorCode.PROVIDER_CONFLICT)

    const db = createTestDatabase()
    const paths = {
      appDataRoot: () => "/tmp/daily-tc1",
      dbPath: () => "/tmp/daily-tc1/db",
      assetsDir: () => "/tmp/daily-tc1/assets",
      remoteSyncPath: () => "/tmp/daily-tc1/remote",
    }
    const core = createStorageCore(db, paths)

    // The stored state already holds an enabled binding (the third combination above); a partial
    // that only turns iCloud on merges onto it into the fourth, forbidden combination.
    await core.settingsService.saveSettings({sync: serverOnly})
    const before = db.prepare(`SELECT data, updated_at FROM device_settings WHERE id = 'sync'`).get()

    const controller = new StorageController(db, paths)
    ;(controller as unknown as {settingsService: typeof core.settingsService}).settingsService = core.settingsService

    const rejection = await controller.saveSettings({sync: {iCloud: {enabled: true}}}).then(
      () => null,
      (error: unknown) => error,
    )

    expect(rejection).toBeInstanceOf(SyncServerError)
    expect((rejection as SyncServerError).code).toBe(SyncServerErrorCode.PROVIDER_CONFLICT)

    const after = db.prepare(`SELECT data, updated_at FROM device_settings WHERE id = 'sync'`).get()
    expect(after).toEqual(before)

    db.close()
  })
})

describe("claiming a credential while iCloud remains the active provider", () => {
  it("claims_TC-2_a_server_credential_without_activating_it_while_iCloud_stays_writable", async () => {
    const server = await bootSyncServer()
    try {
      const store = makeSettingsStore({iCloud: {enabled: true}})
      const service = makeService(store)

      await service.probe(server.baseUrl)
      const code = ensureClaimCode(server.store)
      if (!code) throw new Error("expected an unclaimed test server to hold a claim code")

      const bound = await service.claim(code, "MacBook Air", false)

      const settingsAfter = store.snapshot()
      expect(settingsAfter.sync.server.enabled).toBe(false)
      expect(settingsAfter.sync.server.binding).not.toBeNull()
      expect(settingsAfter.sync.server.binding?.deviceId).toBe(bound.deviceId)
      expect(settingsAfter.sync.iCloud.enabled).toBe(true)

      expect(resolveActiveProvider(settingsAfter.sync)).toBe("icloud")

      const remotes = buildSyncRemotes(settingsAfter.sync, {icloudSyncDir: "/tmp/daily-icloud-sync-dir"})
      expect(remotes).toHaveLength(1)
      expect(remotes[0].id).toBe("icloud")
    } finally {
      await server.close()
    }
  })
})

describe("binding over plain HTTP", () => {
  it("binds_TC-12_freely_over_a_private_address_and_only_with_confirmation_over_a_public_one_carrying_insecure_true_either_way", async () => {
    const privateNoConfirm = await bootSyncServer()
    const privateWithConfirm = await bootSyncServer()
    const publicAddress = await bootSyncServer()

    try {
      const storeA = makeSettingsStore()
      const serviceA = makeService(storeA)
      await serviceA.probe(privateNoConfirm.baseUrl)
      const codeA = ensureClaimCode(privateNoConfirm.store)
      if (!codeA) throw new Error("expected an unclaimed server to hold a claim code")
      const boundA = await serviceA.claim(codeA, "MacBook Air", false)
      expect(boundA.insecure).toBe(true)

      const storeB = makeSettingsStore()
      const serviceB = makeService(storeB)
      await serviceB.probe(privateWithConfirm.baseUrl)
      const codeB = ensureClaimCode(privateWithConfirm.store)
      if (!codeB) throw new Error("expected an unclaimed server to hold a claim code")
      const boundB = await serviceB.claim(codeB, "MacBook Air", true)
      expect(boundB.insecure).toBe(true)

      // From here on, the probed address is treated as public for exactly one call — the one fact
      // this sandbox cannot manufacture for real. Everything downstream of that call is unmocked.
      vi.mocked(isBlockedAddress).mockReturnValueOnce(false)

      const storeC = makeSettingsStore()
      const serviceC = makeService(storeC)
      await serviceC.probe(publicAddress.baseUrl)
      const codeC = ensureClaimCode(publicAddress.store)
      if (!codeC) throw new Error("expected an unclaimed server to hold a claim code")

      const refusal = await serviceC.claim(codeC, "MacBook Air", false).then(
        () => null,
        (error: unknown) => error,
      )
      expect(refusal).toBeInstanceOf(SyncServerError)
      expect((refusal as SyncServerError).code).toBe(SyncServerErrorCode.INSECURE_TRANSPORT_REJECTED)
      expect(isClaimed(publicAddress.store)).toBe(false)

      const boundC = await serviceC.claim(codeC, "MacBook Air", true)
      expect(boundC.insecure).toBe(true)
    } finally {
      await privateNoConfirm.close()
      await privateWithConfirm.close()
      await publicAddress.close()
    }
  })
})

describe("disconnecting", () => {
  it("clears_TC-13_the_binding_removes_the_remote_and_touches_neither_the_server_nor_local_tasks", async () => {
    const server = await bootSyncServer()
    const credential = await claimFirstDevice(server, "MacBook Air")
    const binding = bindingFromCredential(server, credential)

    const store = makeSettingsStore({server: {enabled: true, binding}})
    const onBindingChanged = vi.fn(async () => {})
    const service = makeService(store, {onBindingChanged})

    const db = createTestDatabase()
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at, deleted_at)
       VALUES (?, 'active', ?, 0, 0, '2026-08-17', '', 'UTC', 0, 0, 'main', ?, ?, NULL)`,
    ).run("t1", "Keep me", now, now)
    const before = db.prepare("SELECT id FROM tasks ORDER BY id").all()

    // Closing the server first is the proof that disconnecting never reaches the network: a real
    // call would fail against a closed socket, and disconnect() must succeed regardless.
    await server.close()

    await service.disconnect()

    const settingsAfter = store.snapshot()
    expect(settingsAfter.sync.server).toEqual({enabled: false, binding: null})
    expect(buildSyncRemotes(settingsAfter.sync, {icloudSyncDir: "/tmp/daily-icloud-sync-dir"})).toHaveLength(0)
    expect(onBindingChanged).toHaveBeenCalled()

    const after = db.prepare("SELECT id FROM tasks ORDER BY id").all()
    expect(after).toEqual(before)
    expect((after as {id: string}[]).map((task) => task.id)).toEqual(["t1"])

    db.close()
  })
})

describe("an unbound device", () => {
  it("answers pendingApproval with null instead of throwing, and still refuses approve and deny", async () => {
    const store = makeSettingsStore({server: {enabled: false, binding: null}})
    const service = makeService(store)

    await expect(service.pendingApproval()).resolves.toBeNull()

    await expect(service.approve("req-1", "000000")).rejects.toMatchObject({code: SyncServerErrorCode.NO_BINDING})
    await expect(service.deny("req-1")).rejects.toMatchObject({code: SyncServerErrorCode.NO_BINDING})
  })
})

describe("the enrollment wait", () => {
  it("clears_TC-23_a_lapsed_enrollment_wait_and_never_reuses_its_code_on_a_fresh_request", async () => {
    const server = await bootSyncServer()
    try {
      await claimFirstDevice(server, "Existing Mac")

      const store = makeSettingsStore()
      const service = makeService(store)

      await service.probe(server.baseUrl)
      const ticket = await service.requestEnrollment("MacBook Air", false)
      expect(ticket.code).toMatch(/^\d{6}$/)

      server.store.db
        .prepare(`UPDATE enrollment_requests SET expires_at = ? WHERE code = ?`)
        .run(new Date(Date.now() - 1000).toISOString(), ticket.code)

      const lapsed = await service.pollEnrollment()
      expect(lapsed.state).toBe("expired")

      const fresh = await service.requestEnrollment("MacBook Air", false)
      expect(fresh.code).toMatch(/^\d{6}$/)
      expect(fresh.code).not.toBe(ticket.code)

      const freshPoll = await service.pollEnrollment()
      expect(freshPoll.state).toBe("pending")
    } finally {
      await server.close()
    }
  })
})

describe("the revision probe", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * A tick's own work is a real HTTP round trip (`probeRevision()`) against the real `daily-server`
   * these cases boot. `advanceTimersByTimeAsync(interval)` fires the fake `setInterval` and drains
   * microtasks, but the socket read behind that round trip needs real event-loop turns, which only a
   * real timer grants. `@sinonjs/fake-timers`' own `tickAsync` schedules its work through the real
   * `setImmediate`/`setTimeout` it captured before installing the fakes, so a bounded run of
   * zero-length advances forces exactly that many real turns without moving the fake clock — nothing
   * here can fire the twelve-second interval a second time.
   */
  async function settleProbeIO(rounds = 20): Promise<void> {
    for (let i = 0; i < rounds; i++) {
      await vi.advanceTimersByTimeAsync(0)
    }
  }

  async function fireProbeTick(): Promise<void> {
    await vi.advanceTimersByTimeAsync(SYNC_PROTOCOL_CONFIG.revisionProbeIntervalMs)
    await settleProbeIO()
  }

  it("runs_TC-14_a_sync_cycle_exactly_when_the_revision_moves_and_edge_triggers_the_approval_callback", async () => {
    const server = await bootSyncServer()
    try {
      const credential = await claimFirstDevice(server, "MacBook Air")
      const otherDevice = await enrollSecondDevice(server, "Mac Studio")

      const binding = bindingFromCredential(server, credential)
      const store = makeSettingsStore({server: {enabled: true, binding}})
      const runSyncCycle = vi.fn(async () => {})
      const onApprovalRequested = vi.fn()
      const service = makeService(store, {runSyncCycle, onApprovalRequested})

      service.startProbe()

      await fireProbeTick()
      await fireProbeTick()
      await fireProbeTick()
      expect(runSyncCycle).not.toHaveBeenCalled()

      await fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.snapshot}`, {
        method: "POST",
        headers: {authorization: `Bearer ${otherDevice.token}`, "content-type": "application/json"},
        body: JSON.stringify({
          snapshot: {version: 4, meta: {updatedAt: new Date().toISOString(), hash: "from-another-device"}, docs: {tasks: {}}},
          expectedRevision: null,
        }),
      })

      await fireProbeTick()
      expect(runSyncCycle).toHaveBeenCalledTimes(1)

      await fetch(`${server.baseUrl}${SYNC_PROTOCOL_PATHS.enrollRequest}`, {
        method: "POST",
        body: JSON.stringify({deviceName: "Mac C"}),
      })

      await fireProbeTick()
      await fireProbeTick()
      expect(onApprovalRequested).toHaveBeenCalledTimes(1)
      expect(runSyncCycle).toHaveBeenCalledTimes(1)

      const pending = await service.pendingApproval()
      if (!pending) throw new Error("expected a pending approval to deny")
      await service.deny(pending.requestId)

      await fireProbeTick()
      await fireProbeTick()
      expect(onApprovalRequested).toHaveBeenCalledTimes(1)

      service.stopProbe()
    } finally {
      await server.close()
    }
  }, 30000)

  it("stops_TC-15_the_probe_on_a_revoked_credential_while_leaving_the_binding_in_place", async () => {
    const server = await bootSyncServer()
    try {
      const credential = await claimFirstDevice(server, "MacBook Air")
      const binding = bindingFromCredential(server, credential)
      const store = makeSettingsStore({server: {enabled: true, binding}})
      const runSyncCycle = vi.fn(async () => {})
      const service = makeService(store, {runSyncCycle})

      revokeDevice(server.store, credential.device.id)

      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval")

      service.startProbe()

      await fireProbeTick()
      expect(runSyncCycle).not.toHaveBeenCalled()
      expect(clearIntervalSpy).toHaveBeenCalled()

      await fireProbeTick()
      await fireProbeTick()
      expect(runSyncCycle).not.toHaveBeenCalled()

      const after = store.snapshot()
      expect(after.sync.server.binding).toEqual(binding)

      const state = await service.getState()
      expect(state.binding?.deviceId).toBe(binding.deviceId)
      expect(state.binding?.baseUrl).toBe(binding.baseUrl)
    } finally {
      await server.close()
    }
  })

  it("reports_TC-10_a_typed_revocation_through_getState_firing_onRevoked_once_and_clearing_on_a_later_bind", async () => {
    const server = await bootSyncServer()
    try {
      const credential = await claimFirstDevice(server, "MacBook Air")
      const binding = bindingFromCredential(server, credential)
      const store = makeSettingsStore({server: {enabled: true, binding}})
      const runSyncCycle = vi.fn(async () => {})
      const disableAutoSync = vi.fn()
      const onRevoked = vi.fn()
      const service = makeService(store, {runSyncCycle, disableAutoSync, onRevoked})

      revokeDevice(server.store, credential.device.id)

      service.startProbe()
      await fireProbeTick()

      expect(runSyncCycle).not.toHaveBeenCalled()
      expect(disableAutoSync).toHaveBeenCalledTimes(1)
      expect(onRevoked).toHaveBeenCalledTimes(1)

      const stateAfterRevocation = await service.getState()
      expect(stateAfterRevocation.revoked).toBe(true)
      expect(stateAfterRevocation.binding?.deviceId).toBe(binding.deviceId)
      expect(stateAfterRevocation.binding?.baseUrl).toBe(binding.baseUrl)

      await fireProbeTick()
      await fireProbeTick()
      expect(onRevoked).toHaveBeenCalledTimes(1)

      const freshServer = await bootSyncServer()
      try {
        await service.probe(freshServer.baseUrl)
        const freshCode = ensureClaimCode(freshServer.store)
        if (!freshCode) throw new Error("expected an unclaimed test server to hold a claim code")
        await service.claim(freshCode, "MacBook Air", false)

        const stateAfterRebind = await service.getState()
        expect(stateAfterRebind.revoked).toBe(false)
      } finally {
        await freshServer.close()
      }
    } finally {
      await server.close()
    }
  })
})

describe("narrowing a server binding for the renderer", () => {
  it("narrows_TC-11_toBindingView_toSettingsView_and_getState_to_exactly_the_eight_renderer-safe_fields", async () => {
    const binding = makeBinding()
    const expectedKeys = ["baseUrl", "serverId", "serverName", "deviceId", "deviceName", "fingerprint", "insecure", "boundAt"].sort()

    const bindingView = toBindingView(binding)
    expect(Object.keys(bindingView).sort()).toEqual(expectedKeys)
    expect("token" in bindingView).toBe(false)

    const settings: Settings = {...getDefaultSettings(), sync: {iCloud: {enabled: false}, server: {enabled: true, binding}}}
    const settingsView = toSettingsView(settings)
    const settingsViewBinding = settingsView.sync.server.binding
    expect(settingsViewBinding).not.toBeNull()
    expect(Object.keys(settingsViewBinding as object).sort()).toEqual(expectedKeys)

    const store = makeSettingsStore({server: {enabled: true, binding}})
    const service = makeService(store)
    const state = await service.getState()
    expect(state.binding).not.toBeNull()
    expect(Object.keys(state.binding as object).sort()).toEqual(expectedKeys)
  })
})
