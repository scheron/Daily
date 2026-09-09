import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {SYNC_PROTOCOL_CONFIG, SYNC_PROTOCOL_PATHS, SYNC_PROTOCOL_VERSION, SyncServerError, SyncServerErrorCode} from "@daily/protocol"
import {revokeDevice} from "@daily/server/devices/DeviceStore"
import {ensureClaimCode, isClaimed} from "@daily/server/identity/ServerIdentityStore"

import {createStorageCore} from "@core/storage/createStorageCore"
import {getDefaultSettings} from "@core/storage/models/_rowMappers"
import {StorageController} from "@core/storage/StorageController"
import {DailySyncClient} from "@core/storage/sync/server/DailySyncClient"
import {ServerProviderService} from "@core/storage/sync/server/ServerProviderService"
import {toBindingView, toSettingsView} from "@core/utils/sync/settingsViews"
import {assertSingleActiveProvider, buildSyncRemotes, resolveActiveProvider} from "@core/utils/sync/syncProvider"
import {isBlockedAddress} from "@core/utils/web/isBlockedAddress"
import {createTestDatabase} from "../../../helpers/db"
import {bootSyncServer, claimFirstDevice, enrollSecondDevice, openEnrollmentWindow} from "../../../helpers/syncServer"

import type {DeviceRole, IssuedCredential, ProtocolMismatchView, RevisionProbe, ServerSyncBinding, Settings, SyncSettings} from "@daily/protocol"
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
    role: null,
    approvedBy: null,
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
      openEnrollmentWindow(server)
      const ticket = await service.requestEnrollment("MacBook Air", false)
      expect(ticket.code).toMatch(/^\d{6}$/)

      server.store.db
        .prepare(`UPDATE enrollment_requests SET expires_at = ? WHERE code = ?`)
        .run(new Date(Date.now() - 1000).toISOString(), ticket.code)

      const lapsed = await service.pollEnrollment()
      expect(lapsed.state).toBe("expired")

      openEnrollmentWindow(server)
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

      openEnrollmentWindow(server)
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

describe("the role a probe tick learns from the server — TC-16", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  async function settleProbeIO(rounds = 20): Promise<void> {
    for (let i = 0; i < rounds; i++) {
      await vi.advanceTimersByTimeAsync(0)
    }
  }

  async function fireProbeTick(): Promise<void> {
    await vi.advanceTimersByTimeAsync(SYNC_PROTOCOL_CONFIG.revisionProbeIntervalMs)
    await settleProbeIO()
  }

  function mockProbeOnce(probe: RevisionProbe): void {
    vi.spyOn(DailySyncClient.prototype, "probeRevision").mockResolvedValueOnce(probe)
  }

  function makeRoleService(store: ReturnType<typeof makeSettingsStore>, onRoleChanged: (role: DeviceRole) => void): ServerProviderService {
    return new ServerProviderService({
      loadSettings: store.loadSettings,
      saveSettings: store.saveSettings,
      onBindingChanged: async () => {},
      runSyncCycle: async () => {},
      onApprovalRequested: () => {},
      disableAutoSync: () => {},
      onRevoked: () => {},
      onRoleChanged,
    } as never)
  }

  it("learns_TC-16_a_new_role_exactly_once_per_change_rewriting_the_binding_and_surviving_a_reload", async () => {
    const server = await bootSyncServer()
    try {
      const credential = await claimFirstDevice(server, "MacBook Air")
      const binding = bindingFromCredential(server, credential, {role: "child", approvedBy: null})
      const store = makeSettingsStore({server: {enabled: true, binding}})
      const onRoleChanged = vi.fn()
      const service = makeRoleService(store, onRoleChanged)

      mockProbeOnce({revision: null, pendingEnrollment: false, protocol: SYNC_PROTOCOL_VERSION, role: "parent"} as RevisionProbe)
      service.startProbe()
      await fireProbeTick()

      expect(onRoleChanged).toHaveBeenCalledTimes(1)
      expect(onRoleChanged).toHaveBeenCalledWith("parent")
      expect(store.snapshot().sync.server.binding?.role).toBe("parent")

      mockProbeOnce({revision: null, pendingEnrollment: false, protocol: SYNC_PROTOCOL_VERSION, role: "parent"} as RevisionProbe)
      await fireProbeTick()

      expect(onRoleChanged).toHaveBeenCalledTimes(1)

      service.stopProbe()

      const reloaded = await service.getState()
      expect(reloaded.binding?.role).toBe("parent")
    } finally {
      await server.close()
    }
  })
})

describe("the protocol mismatch a probe tick can find — TC-2, TC-4 through TC-8", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  async function settleProbeIO(rounds = 20): Promise<void> {
    for (let i = 0; i < rounds; i++) {
      await vi.advanceTimersByTimeAsync(0)
    }
  }

  async function fireProbeTick(): Promise<void> {
    await vi.advanceTimersByTimeAsync(SYNC_PROTOCOL_CONFIG.revisionProbeIntervalMs)
    await settleProbeIO()
  }

  async function fireProtocolRecheckTick(): Promise<void> {
    await vi.advanceTimersByTimeAsync(SYNC_PROTOCOL_CONFIG.protocolRecheckIntervalMs)
    await settleProbeIO()
  }

  function makeMismatchService(
    store: ReturnType<typeof makeSettingsStore>,
    overrides: {
      runSyncCycle?: () => Promise<void>
      onApprovalRequested?: () => void
      disableAutoSync?: () => void
      enableAutoSync?: () => void
      onProtocolMismatchChanged?: (mismatch: ProtocolMismatchView | null) => void
    } = {},
  ): ServerProviderService {
    return new ServerProviderService({
      loadSettings: store.loadSettings,
      saveSettings: store.saveSettings,
      onBindingChanged: async () => {},
      runSyncCycle: overrides.runSyncCycle ?? (async () => {}),
      onApprovalRequested: overrides.onApprovalRequested ?? (() => {}),
      disableAutoSync: overrides.disableAutoSync ?? (() => {}),
      enableAutoSync: overrides.enableAutoSync ?? (() => {}),
      onRevoked: () => {},
      onProtocolMismatchChanged: overrides.onProtocolMismatchChanged ?? (() => {}),
    } as never)
  }

  async function bindService(overrides: Parameters<typeof makeMismatchService>[1] = {}) {
    const server = await bootSyncServer()
    const credential = await claimFirstDevice(server, "MacBook Air")
    const binding = bindingFromCredential(server, credential)
    const store = makeSettingsStore({server: {enabled: true, binding}})
    const service = makeMismatchService(store, overrides)
    return {server, service}
  }

  function mockProbeOnce(probe: RevisionProbe): void {
    vi.spyOn(DailySyncClient.prototype, "probeRevision").mockResolvedValueOnce(probe)
  }

  function mockProbeFromNowOn(probe: RevisionProbe): void {
    vi.spyOn(DailySyncClient.prototype, "probeRevision").mockResolvedValue(probe)
  }

  it("treats_TC-2_a_probe_with_no_protocol_field_exactly_as_it_would_treat_an_explicit_protocol_1", async () => {
    const {server, service} = await bindService()
    try {
      mockProbeOnce({revision: null, pendingEnrollment: false} as RevisionProbe)
      service.startProbe()
      await fireProbeTick()
      service.stopProbe()

      const state = await service.getState()

      expect(state.mismatch).toEqual({appProtocol: SYNC_PROTOCOL_VERSION, serverProtocol: 1})
    } finally {
      await server.close()
    }
  })

  it("holds_TC-4_a_mismatch_naming_both_versions_once_a_tick_reads_a_different_protocol", async () => {
    const {server, service} = await bindService()
    try {
      mockProbeOnce({revision: null, pendingEnrollment: false, protocol: SYNC_PROTOCOL_VERSION + 1} as RevisionProbe)
      service.startProbe()
      await fireProbeTick()
      service.stopProbe()

      const state = await service.getState()
      expect(state.mismatch).toEqual({appProtocol: SYNC_PROTOCOL_VERSION, serverProtocol: SYNC_PROTOCOL_VERSION + 1})
    } finally {
      await server.close()
    }
  })

  it("turns_TC-5_auto_sync_off_the_moment_the_mismatch_is_entered", async () => {
    const disableAutoSync = vi.fn()
    const {server, service} = await bindService({disableAutoSync})
    try {
      mockProbeOnce({revision: null, pendingEnrollment: false, protocol: SYNC_PROTOCOL_VERSION + 1} as RevisionProbe)
      service.startProbe()
      await fireProbeTick()
      service.stopProbe()

      expect(disableAutoSync).toHaveBeenCalledTimes(1)
    } finally {
      await server.close()
    }
  })

  it("runs_TC-6_no_sync_cycle_and_acts_on_no_waiting_enrollment_while_a_mismatch_holds", async () => {
    const runSyncCycle = vi.fn(async () => {})
    const onApprovalRequested = vi.fn()
    const {server, service} = await bindService({runSyncCycle, onApprovalRequested})
    try {
      mockProbeOnce({revision: null, pendingEnrollment: false, protocol: SYNC_PROTOCOL_VERSION + 1} as RevisionProbe)
      service.startProbe()
      await fireProbeTick()

      // Further ticks, still mismatched, now also report a revision change and a waiting enrollment —
      // the two things that would normally act — and TC-6 says neither may while the mismatch holds.
      mockProbeFromNowOn({revision: "r1", pendingEnrollment: true, protocol: SYNC_PROTOCOL_VERSION + 1} as RevisionProbe)
      await fireProtocolRecheckTick()
      await fireProtocolRecheckTick()

      service.stopProbe()

      expect(runSyncCycle).not.toHaveBeenCalled()
      expect(onApprovalRequested).not.toHaveBeenCalled()
    } finally {
      await server.close()
    }
  })

  it("clears_TC-7_the_mismatch_and_turns_auto_sync_on_again_by_itself_once_the_server_agrees", async () => {
    const disableAutoSync = vi.fn()
    const enableAutoSync = vi.fn()
    const onProtocolMismatchChanged = vi.fn()
    const runSyncCycle = vi.fn(async () => {})
    const {server, service} = await bindService({disableAutoSync, enableAutoSync, onProtocolMismatchChanged, runSyncCycle})
    try {
      const probeSpy = vi.spyOn(DailySyncClient.prototype, "probeRevision")

      mockProbeOnce({revision: "r0", pendingEnrollment: false, protocol: SYNC_PROTOCOL_VERSION} as RevisionProbe)
      service.startProbe()
      await fireProbeTick()
      expect(runSyncCycle).not.toHaveBeenCalled()

      mockProbeOnce({revision: "r0", pendingEnrollment: false, protocol: SYNC_PROTOCOL_VERSION + 1} as RevisionProbe)
      await fireProbeTick()

      const midway = await service.getState()
      expect(midway.mismatch).not.toBeNull()
      expect(disableAutoSync).toHaveBeenCalledTimes(1)

      mockProbeOnce({revision: "r0", pendingEnrollment: false, protocol: SYNC_PROTOCOL_VERSION + 1} as RevisionProbe)
      await fireProtocolRecheckTick()

      expect(probeSpy.mock.calls.at(-1)?.[0]).toBeNull()

      mockProbeFromNowOn({revision: "r1", pendingEnrollment: false, protocol: SYNC_PROTOCOL_VERSION} as RevisionProbe)
      await fireProtocolRecheckTick()
      service.stopProbe()

      expect(probeSpy.mock.calls.at(-1)?.[0]).toBeNull()

      const after = await service.getState()
      expect(after.mismatch).toBeNull()
      expect(enableAutoSync).toHaveBeenCalledTimes(1)
      expect(onProtocolMismatchChanged).toHaveBeenCalledWith(null)
      expect(runSyncCycle).toHaveBeenCalledTimes(1)
    } finally {
      await server.close()
    }
  })

  it("leaves_TC-8_a_matching_device_free_of_any_mismatch_across_every_tick", async () => {
    const runSyncCycle = vi.fn(async () => {})
    const {server, service} = await bindService({runSyncCycle})
    try {
      mockProbeFromNowOn({revision: null, pendingEnrollment: false, protocol: SYNC_PROTOCOL_VERSION} as RevisionProbe)
      service.startProbe()
      await fireProbeTick()
      await fireProbeTick()
      service.stopProbe()

      const state = await service.getState()
      expect(state.mismatch).toBeNull()
      expect(runSyncCycle).not.toHaveBeenCalled()
    } finally {
      await server.close()
    }
  })
})

/**
 * `DailySyncClient.prototype.probeRevision` is mocked directly here, exactly as the mismatch
 * block above does — no real hold is ever asked for, so nothing here depends on real elapsed time
 * or on the server's own `holdForRevisionChange`. That keeps these cases deterministic and fast,
 * and it is what makes it safe to assert on a re-arm firing without waiting out a real hold.
 */
describe("the re-arm after a successful probe", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  async function settleProbeIO(rounds = 20): Promise<void> {
    for (let i = 0; i < rounds; i++) {
      await vi.advanceTimersByTimeAsync(0)
    }
  }

  async function fireProbeTick(): Promise<void> {
    await vi.advanceTimersByTimeAsync(SYNC_PROTOCOL_CONFIG.revisionProbeIntervalMs)
    await settleProbeIO()
  }

  function makeRearmService(
    store: ReturnType<typeof makeSettingsStore>,
    overrides: {runSyncCycle?: () => Promise<void>; onApprovalRequested?: () => void; disableAutoSync?: () => void} = {},
  ): ServerProviderService {
    return new ServerProviderService({
      loadSettings: store.loadSettings,
      saveSettings: store.saveSettings,
      onBindingChanged: async () => {},
      runSyncCycle: overrides.runSyncCycle ?? (async () => {}),
      onApprovalRequested: overrides.onApprovalRequested ?? (() => {}),
      disableAutoSync: overrides.disableAutoSync ?? (() => {}),
      onRevoked: () => {},
    } as never)
  }

  async function bindRearmService(overrides: Parameters<typeof makeRearmService>[1] = {}) {
    const server = await bootSyncServer()
    const credential = await claimFirstDevice(server, "MacBook Air")
    const binding = bindingFromCredential(server, credential)
    const store = makeSettingsStore({server: {enabled: true, binding}})
    const service = makeRearmService(store, overrides)
    return {server, service, store, binding}
  }

  function probe(revision: string, protocol = SYNC_PROTOCOL_VERSION, pendingEnrollment = false): RevisionProbe {
    return {revision, pendingEnrollment, protocol} as RevisionProbe
  }

  it("catches a second revision move within one interval window instead of waiting for the next", async () => {
    const runSyncCycle = vi.fn(async () => {})
    const {server, service} = await bindRearmService({runSyncCycle})
    try {
      const probeSpy = vi.spyOn(DailySyncClient.prototype, "probeRevision")
      probeSpy.mockResolvedValueOnce(probe("r0"))
      probeSpy.mockResolvedValueOnce(probe("r1"))
      probeSpy.mockResolvedValueOnce(probe("r2"))
      probeSpy.mockResolvedValue(probe("r2"))

      service.startProbe()
      await fireProbeTick()
      expect(runSyncCycle).not.toHaveBeenCalled()

      // The scheduler's second fire reaches "r1" — the move that ends that hold — and the re-arm
      // this phase adds is what reaches "r2" too, without a third twelve-second wait: a
      // millisecond-scale advance, not another interval.
      await fireProbeTick()
      await vi.advanceTimersByTimeAsync(1)
      await settleProbeIO()
      service.stopProbe()

      expect(runSyncCycle).toHaveBeenCalledTimes(2)
    } finally {
      await server.close()
    }
  })

  it("ends the loop on stopProbe rather than letting an already-scheduled re-arm fire", async () => {
    const runSyncCycle = vi.fn(async () => {})
    const {server, service} = await bindRearmService({runSyncCycle})
    try {
      const probeSpy = vi.spyOn(DailySyncClient.prototype, "probeRevision")
      probeSpy.mockResolvedValueOnce(probe("r0"))
      probeSpy.mockResolvedValueOnce(probe("r1"))
      // A safety net, not the case under test: if the re-arm this test means to cancel fired anyway,
      // it would find "r1" unchanged and stop there rather than reaching for a real, unmocked call.
      probeSpy.mockResolvedValue(probe("r1"))

      service.startProbe()
      await fireProbeTick()
      expect(runSyncCycle).not.toHaveBeenCalled()

      // The scheduler's second fire is the move that ends that hold and schedules a re-arm.
      await fireProbeTick()
      expect(runSyncCycle).toHaveBeenCalledTimes(1)

      const callsBeforeStop = probeSpy.mock.calls.length
      service.stopProbe()

      // Twice the ordinary interval — ample room for a re-arm to have fired had it survived.
      await fireProbeTick()
      await fireProbeTick()

      expect(probeSpy.mock.calls.length).toBe(callsBeforeStop)
      expect(runSyncCycle).toHaveBeenCalledTimes(1)
    } finally {
      await server.close()
    }
  })

  it("does not re-arm when a re-armed probe itself finds a protocol mismatch", async () => {
    const runSyncCycle = vi.fn(async () => {})
    const disableAutoSync = vi.fn()
    const {server, service} = await bindRearmService({runSyncCycle, disableAutoSync})
    try {
      const probeSpy = vi.spyOn(DailySyncClient.prototype, "probeRevision")
      probeSpy.mockResolvedValueOnce(probe("r0"))
      probeSpy.mockResolvedValueOnce(probe("r1"))
      probeSpy.mockResolvedValueOnce(probe("r1", SYNC_PROTOCOL_VERSION + 1))
      probeSpy.mockResolvedValue(probe("r1", SYNC_PROTOCOL_VERSION + 1))

      service.startProbe()
      await fireProbeTick()
      expect(runSyncCycle).not.toHaveBeenCalled()

      // The scheduler's second fire moves to "r1" and schedules a re-arm; that re-armed probe is
      // the one that finds the mismatch — the scenario the plan means by "a re-arm must not outlive
      // a switch into mismatch". A millisecond-scale advance, not another interval, is what lets it
      // resolve here.
      await fireProbeTick()
      await vi.advanceTimersByTimeAsync(1)
      await settleProbeIO()

      expect(runSyncCycle).toHaveBeenCalledTimes(1)
      expect(disableAutoSync).toHaveBeenCalledTimes(1)
      const state = await service.getState()
      expect(state.mismatch).toEqual({appProtocol: SYNC_PROTOCOL_VERSION, serverProtocol: SYNC_PROTOCOL_VERSION + 1})

      const callsAfterMismatch = probeSpy.mock.calls.length
      // Still well under the sixty-second mismatch cadence phase 2 switched to — nothing further is
      // due yet, whether from a stray re-arm or from that recheck itself.
      await fireProbeTick()
      expect(probeSpy.mock.calls.length).toBe(callsAfterMismatch)

      service.stopProbe()
    } finally {
      await server.close()
    }
  })

  it("re-arms after a hold that expired with nothing new to report, not just after one that moved", async () => {
    const runSyncCycle = vi.fn(async () => {})
    const {server, service} = await bindRearmService({runSyncCycle})
    try {
      const probeSpy = vi.spyOn(DailySyncClient.prototype, "probeRevision")
      probeSpy.mockResolvedValueOnce(probe("r0"))
      // The second probe reports the same revision and no pending enrollment — the shape of a hold
      // that ran to its own end with nothing changed, not a move and not a fresh enrollment.
      probeSpy.mockResolvedValueOnce(probe("r0"))
      probeSpy.mockResolvedValueOnce(probe("r1"))
      probeSpy.mockResolvedValue(probe("r1"))

      service.startProbe()
      await fireProbeTick()
      expect(runSyncCycle).not.toHaveBeenCalled()

      // The scheduler's second fire finds "r0" unchanged — an expired hold, nothing new — and still
      // re-arms: the re-armed probe, within this same call, is what reaches "r1" and runs the sync
      // cycle, without a third twelve-second wait.
      await fireProbeTick()
      await vi.advanceTimersByTimeAsync(1)
      await settleProbeIO()
      service.stopProbe()

      expect(runSyncCycle).toHaveBeenCalledTimes(1)
    } finally {
      await server.close()
    }
  })

  it("does not keep re-arming while an enrollment stays pending across ticks", async () => {
    const onApprovalRequested = vi.fn()
    const {server, service} = await bindRearmService({onApprovalRequested})
    try {
      const probeSpy = vi.spyOn(DailySyncClient.prototype, "probeRevision")
      probeSpy.mockResolvedValueOnce(probe("r0"))
      // Newly pending: re-arms once, and this is the only call `onApprovalRequested` should see.
      probeSpy.mockResolvedValueOnce(probe("r0", SYNC_PROTOCOL_VERSION, true))
      // Still pending on the re-armed probe: this is the case that must not re-arm again.
      probeSpy.mockResolvedValue(probe("r0", SYNC_PROTOCOL_VERSION, true))

      service.startProbe()
      await fireProbeTick()

      // The scheduler's second fire finds the enrollment newly pending and re-arms once; the
      // re-armed probe, within this same call, finds it still pending and must not re-arm again.
      await fireProbeTick()
      await vi.advanceTimersByTimeAsync(1)
      await settleProbeIO()

      expect(onApprovalRequested).toHaveBeenCalledTimes(1)
      const callsAfterSettling = probeSpy.mock.calls.length

      // Ordinary interval cadence from here — no further call is due until the scheduler's own next
      // fire, confirming the loop fell back rather than continuing to re-arm on its own.
      await settleProbeIO()
      expect(probeSpy.mock.calls.length).toBe(callsAfterSettling)

      service.stopProbe()
    } finally {
      await server.close()
    }
  })

  it("does not let the scheduler start a second concurrent probe while a re-armed one is still holding", async () => {
    const runSyncCycle = vi.fn(async () => {})
    const {server, service} = await bindRearmService({runSyncCycle})
    try {
      const probeSpy = vi.spyOn(DailySyncClient.prototype, "probeRevision")
      let inFlight = 0
      let peakInFlight = 0
      let releaseHeldCall: (() => void) | null = null

      probeSpy.mockResolvedValueOnce(probe("r0"))
      probeSpy.mockResolvedValueOnce(probe("r1"))
      // The re-armed probe this schedules is held open on purpose — the exact shape of a real
      // 45-second hold from the caller's side — released explicitly once the scheduler's own next
      // boundary has had its chance to race it.
      probeSpy.mockImplementationOnce(async () => {
        inFlight++
        peakInFlight = Math.max(peakInFlight, inFlight)
        await new Promise<void>((resolve) => {
          releaseHeldCall = resolve
        })
        inFlight--
        return probe("r1")
      })
      probeSpy.mockResolvedValue(probe("r1"))

      service.startProbe()
      await fireProbeTick()
      expect(runSyncCycle).not.toHaveBeenCalled()

      // The scheduler's second fire moves to "r1" and schedules a re-arm; that re-armed probe,
      // within this same call, is the one now held open above.
      await fireProbeTick()
      await vi.advanceTimersByTimeAsync(1)
      await settleProbeIO()
      expect(runSyncCycle).toHaveBeenCalledTimes(1)
      expect(probeSpy.mock.calls.length).toBe(3)

      // The scheduler's own next boundary, a full interval later, with the re-armed hold from the
      // third call still open. Before this round's fix, `isSyncing` had already gone false the
      // moment that third call was scheduled, so this is exactly where a second, concurrent probe
      // would have started.
      await fireProbeTick()

      expect(probeSpy.mock.calls.length).toBe(3)
      expect(peakInFlight).toBe(1)

      releaseHeldCall?.()
      await settleProbeIO()
      service.stopProbe()
    } finally {
      await server.close()
    }
  }, 20000)

  it("does not let a tick still unwinding after disconnect clobber a tick a later reconnect started", async () => {
    let releaseStaleSyncCycle: (() => void) | null = null
    const runSyncCycle = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseStaleSyncCycle = resolve
        }),
    )
    const {server, service, store, binding} = await bindRearmService({runSyncCycle})
    try {
      const probeSpy = vi.spyOn(DailySyncClient.prototype, "probeRevision")
      let inFlight = 0
      let peakInFlight = 0
      let releaseReconnectedHold: (() => void) | null = null

      probeSpy.mockResolvedValueOnce(probe("r0"))
      // The move that sends this tick into `runSyncCycle()` — held open above, standing in for
      // work nothing here can cancel, exactly like a real sync cycle already running.
      probeSpy.mockResolvedValueOnce(probe("r1"))

      service.startProbe()
      await fireProbeTick()
      expect(runSyncCycle).not.toHaveBeenCalled()

      // The scheduler's second fire moves to "r1" and calls `runSyncCycle()`, which this test holds
      // open rather than letting resolve — this tick is now stuck exactly where the coordinator's
      // sequence puts it: past its network call, inside the one await nothing can cancel.
      await fireProbeTick()
      expect(runSyncCycle).toHaveBeenCalledTimes(1)
      expect(probeSpy.mock.calls.length).toBe(2)

      // Disconnect while that tick is still stuck — its own `stopProbe()` cannot touch a running
      // sync cycle — and reconnect immediately after, exactly the coordinator's steps 2 and 3.
      // `disconnect()` clears the binding as a real one would; restoring it through the same
      // settings store a real re-bind writes through is what lets the reconnected probe run at
      // all, without reaching into the service's own privates to do it.
      await service.disconnect()
      await store.saveSettings({sync: {...store.snapshot().sync, server: {enabled: true, binding}}})
      probeSpy.mockImplementationOnce(async () => {
        inFlight++
        peakInFlight = Math.max(peakInFlight, inFlight)
        await new Promise<void>((resolve) => {
          releaseReconnectedHold = resolve
        })
        inFlight--
        return probe("r0")
      })
      probeSpy.mockResolvedValue(probe("r0"))
      service.startProbe()

      // The reconnected scheduler's own first fire opens a hold of its own — held open above,
      // exactly the coordinator's step 4.
      await fireProbeTick()
      expect(probeSpy.mock.calls.length).toBe(3)

      // Now let the stale tick from before the disconnect finish — the coordinator's step 5. Before
      // this round's fix, its `finally` cleared the in-flight flag the reconnected tick owns.
      releaseStaleSyncCycle?.()
      await settleProbeIO()

      // The reconnected scheduler's own next boundary, a full interval later, with its own hold
      // from above still open. If the stale tick's finish had cleared a flag it no longer owned,
      // this is exactly where a second, concurrent probe would start.
      await fireProbeTick()

      expect(probeSpy.mock.calls.length).toBe(3)
      expect(peakInFlight).toBe(1)
      // The stale tick returned without writing anything — its own revision report never lands.
      expect(runSyncCycle).toHaveBeenCalledTimes(1)

      releaseReconnectedHold?.()
      await settleProbeIO()
      service.stopProbe()
    } finally {
      await server.close()
    }
  }, 20000)
})

describe("the trigger after a request the client itself resolved — TC-27, TC-28", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  async function settleProbeIO(rounds = 20): Promise<void> {
    for (let i = 0; i < rounds; i++) {
      await vi.advanceTimersByTimeAsync(0)
    }
  }

  async function fireProbeTick(): Promise<void> {
    await vi.advanceTimersByTimeAsync(SYNC_PROTOCOL_CONFIG.revisionProbeIntervalMs)
    await settleProbeIO()
  }

  function probe(revision: string, pendingEnrollment = false): RevisionProbe {
    return {revision, pendingEnrollment, protocol: SYNC_PROTOCOL_VERSION} as RevisionProbe
  }

  /**
   * `approveEnrollment`/`denyEnrollment` are mocked on `DailySyncClient.prototype` alongside
   * `probeRevision`, exactly as this file already mocks the probe alone elsewhere: nothing here
   * needs a real server, since what is under test is the client's own bookkeeping around the wire,
   * not the wire itself.
   */
  function bindTriggerService(onApprovalRequested: () => void): ServerProviderService {
    const binding = makeBinding()
    const store = makeSettingsStore({server: {enabled: true, binding}})
    return makeService(store, {onApprovalRequested})
  }

  it("fires_TC-27_the_approval_callback_again_after_the_client_s_own_approval_resolved_the_last_request", async () => {
    const onApprovalRequested = vi.fn()
    const service = bindTriggerService(onApprovalRequested)

    const probeSpy = vi.spyOn(DailySyncClient.prototype, "probeRevision")
    const approveSpy = vi.spyOn(DailySyncClient.prototype, "approveEnrollment").mockResolvedValue(undefined)

    probeSpy.mockResolvedValueOnce(probe("r0"))
    probeSpy.mockResolvedValue(probe("r0", true))

    service.startProbe()
    await fireProbeTick()
    await fireProbeTick()
    await vi.advanceTimersByTimeAsync(1)
    await settleProbeIO()

    expect(onApprovalRequested).toHaveBeenCalledTimes(1)

    await service.approve("request-a", "code-a")
    expect(approveSpy).toHaveBeenCalledWith("request-a", "code-a")

    // The next probe still reports `pendingEnrollment: true` — not because the first request is
    // still open (the approval above resolved it), but because a further request is now waiting.
    // Nothing in this mock distinguishes the two; only the client's own flag can.
    await fireProbeTick()

    expect(onApprovalRequested).toHaveBeenCalledTimes(2)

    service.stopProbe()
  })

  it("fires_TC-27_the_approval_callback_again_after_the_client_s_own_denial_resolved_the_last_request", async () => {
    const onApprovalRequested = vi.fn()
    const service = bindTriggerService(onApprovalRequested)

    const probeSpy = vi.spyOn(DailySyncClient.prototype, "probeRevision")
    const denySpy = vi.spyOn(DailySyncClient.prototype, "denyEnrollment").mockResolvedValue(undefined)

    probeSpy.mockResolvedValueOnce(probe("r0"))
    probeSpy.mockResolvedValue(probe("r0", true))

    service.startProbe()
    await fireProbeTick()
    await fireProbeTick()
    await vi.advanceTimersByTimeAsync(1)
    await settleProbeIO()

    expect(onApprovalRequested).toHaveBeenCalledTimes(1)

    await service.deny("request-a")
    expect(denySpy).toHaveBeenCalledWith("request-a")

    await fireProbeTick()

    expect(onApprovalRequested).toHaveBeenCalledTimes(2)

    service.stopProbe()
  })

  it("does_not_refire_TC-28_for_a_request_that_is_merely_still_waiting_and_leaves_re_arm_behaviour_unchanged", async () => {
    const onApprovalRequested = vi.fn()
    const service = bindTriggerService(onApprovalRequested)

    const probeSpy = vi.spyOn(DailySyncClient.prototype, "probeRevision")
    probeSpy.mockResolvedValueOnce(probe("r0"))
    probeSpy.mockResolvedValue(probe("r0", true))

    service.startProbe()
    await fireProbeTick()
    await fireProbeTick()
    await vi.advanceTimersByTimeAsync(1)
    await settleProbeIO()

    expect(onApprovalRequested).toHaveBeenCalledTimes(1)
    const callsAfterRaise = probeSpy.mock.calls.length

    await fireProbeTick()
    expect(onApprovalRequested).toHaveBeenCalledTimes(1)

    await fireProbeTick()
    expect(onApprovalRequested).toHaveBeenCalledTimes(1)

    // Re-arm behaviour unchanged: exactly one `probeRevision` call per ordinary interval tick from
    // here, not the immediate re-arm a newly-pending request gets — no hot loop over a request
    // sitting unanswered.
    expect(probeSpy.mock.calls.length).toBe(callsAfterRaise + 2)

    service.stopProbe()
  })
})

describe("narrowing a server binding for the renderer", () => {
  it("narrows_TC-11_toBindingView_toSettingsView_and_getState_to_exactly_the_ten_renderer-safe_fields", async () => {
    const binding = makeBinding()
    const expectedKeys = [
      "baseUrl",
      "serverId",
      "serverName",
      "deviceId",
      "deviceName",
      "fingerprint",
      "insecure",
      "boundAt",
      "role",
      "approvedBy",
    ].sort()

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

describe("who approved this device, as its own binding reports it — TC-13", () => {
  it("names_TC-13_the_approving_device_on_an_enrolled_binding_and_nobody_on_a_claimed_one", async () => {
    const server = await bootSyncServer()
    try {
      const parentStore = makeSettingsStore()
      const parentService = makeService(parentStore)
      await parentService.probe(server.baseUrl)
      const code = ensureClaimCode(server.store)
      if (!code) throw new Error("expected an unclaimed test server to hold a claim code")

      const parentBinding = await parentService.claim(code, "MacBook Air", false)
      expect(parentBinding.approvedBy).toBeNull()

      const childStore = makeSettingsStore()
      const childService = makeService(childStore)
      await childService.probe(server.baseUrl)
      openEnrollmentWindow(server)
      await childService.requestEnrollment("Mac mini", false)

      const pending = await parentService.pendingApproval()
      if (!pending) throw new Error("expected a pending approval to approve")
      await parentService.approve(pending.requestId, pending.code)

      const polled = await childService.pollEnrollment()
      expect(polled.state).toBe("approved")

      const childState = await childService.getState()
      expect(childState.binding?.approvedBy).toBe("MacBook Air")
    } finally {
      await server.close()
    }
  })
})

describe("the Parent's membership view — TC-15", () => {
  it("marks_TC-15_this_Mac_carries_no_credential_anywhere_and_revoking_returns_the_refreshed_list_with_the_device_moved_into_the_revoked_group", async () => {
    const server = await bootSyncServer()
    try {
      const parentCredential = await claimFirstDevice(server, "MacBook Air")
      const activeChildCredential = await enrollSecondDevice(server, "Mac mini")
      const preRevokedCredential = await enrollSecondDevice(server, "iMac")
      revokeDevice(server.store, preRevokedCredential.device.id)

      const binding = bindingFromCredential(server, parentCredential, {role: "parent", approvedBy: null})
      const store = makeSettingsStore({server: {enabled: true, binding}})
      const service = makeService(store)

      const membership = await service.listMembership()

      const parentRow = membership.devices.find((d) => d.id === parentCredential.device.id)
      expect(parentRow?.isThisMac).toBe(true)
      expect(membership.devices.filter((d) => d.isThisMac)).toHaveLength(1)

      const serialized = JSON.stringify(membership)
      expect(serialized).not.toContain(parentCredential.token)
      expect(serialized).not.toContain(activeChildCredential.token)
      expect(serialized).not.toContain(preRevokedCredential.token)

      const afterRevoke = await service.revokeDevice(activeChildCredential.device.id)
      const revokedRow = afterRevoke.devices.find((d) => d.id === activeChildCredential.device.id)
      expect(revokedRow?.revokedAt).toBeTruthy()

      const revokedNames = afterRevoke.devices.filter((d) => d.revokedAt !== null).map((d) => d.name)
      expect(revokedNames.sort()).toEqual(["Mac mini", "iMac"].sort())
    } finally {
      await server.close()
    }
  })
})
