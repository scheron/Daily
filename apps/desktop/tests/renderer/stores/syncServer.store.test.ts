// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {mockBridgeIPC} from "../../helpers/bridgeIPC"

vi.mock("../../../src/renderer/src/utils/ui/vue", () => ({toRawDeep: (v) => v}))

/**
 * `apps/desktop/src/main/preload.ts` turns the dep the plan freezes, `onProtocolMismatchChanged`
 * (phase 2), into an IPC channel by the same rule its two existing siblings already follow —
 * `onRevoked` → `sync-server:on-revoked`, `onApprovalRequested` → `sync-server:on-approval-requested`
 * — so `sync-server:on-protocol-mismatch-changed` is a name inferred from that established, 2-for-2
 * pattern rather than invented from nothing. Flagged in the test-writer's report regardless, since
 * the plan itself freezes only the dep, not the wire channel name.
 */
const MISMATCH_CHANNEL = "sync-server:on-protocol-mismatch-changed"

function bridgeWithState(mismatch: {appProtocol: number; serverProtocol: number} | null = null) {
  return mockBridgeIPC({
    "sync-server:get-state": vi.fn().mockResolvedValue({binding: null, revoked: false, mismatch}),
    "sync-server:on-revoked": vi.fn(),
    "sync-server:on-approval-requested": vi.fn(),
    [MISMATCH_CHANNEL]: vi.fn(),
  })
}

describe("syncServerStore — the mismatch flag reaches the renderer without reopening Settings (TC-9, TC-11)", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  async function getStore() {
    const {useSyncServerStore} = await import("../../../src/renderer/src/stores/syncServer.store")
    const store = useSyncServerStore()
    await new Promise((r) => setTimeout(r, 0))
    return store
  }

  /**
   * Asserts the subscription itself happened before reading the callback out of it, so a tree
   * that has not wired the channel yet fails this on a clean, named assertion rather than on a
   * `.mock.calls[0]` of `undefined` further down — a crash proves nothing about the behaviour.
   */
  function capturedMismatchListener(bridge: ReturnType<typeof bridgeWithState>): (mismatch: unknown) => void {
    expect(bridge[MISMATCH_CHANNEL], `expected the store to subscribe to ${MISMATCH_CHANNEL} on creation`).toHaveBeenCalledTimes(1)
    return bridge[MISMATCH_CHANNEL].mock.calls[0][0]
  }

  it("subscribes_TC-9_to_the_mismatch_channel_on_creation_so_a_later_broadcast_needs_no_reopen", async () => {
    const bridge = bridgeWithState(null)
    await getStore()

    // A subscription registered on creation, not a poll Settings would have to reopen to re-run,
    // is what "without reopening Settings" means at this seam — the wording of any banner is not.
    const listener = capturedMismatchListener(bridge)
    expect(typeof listener).toBe("function")
  })

  it("reflects_TC-9_a_mismatch_the_moment_the_subscribed_callback_fires_naming_both_versions", async () => {
    const bridge = bridgeWithState(null)
    const store = await getStore()

    expect(store.mismatch).toBeNull()
    expect(bridge["sync-server:get-state"]).toHaveBeenCalledTimes(1)

    capturedMismatchListener(bridge)({appProtocol: 2, serverProtocol: 1})

    expect(store.mismatch).toEqual({appProtocol: 2, serverProtocol: 1})
    // Reflected from the pushed value alone — a second state fetch would defeat "without reopening".
    expect(bridge["sync-server:get-state"]).toHaveBeenCalledTimes(1)
  })

  it("clears_TC-11_the_mismatch_on_its_own_the_moment_the_subscribed_callback_reports_it_gone", async () => {
    const bridge = bridgeWithState(null)
    const store = await getStore()

    const listener = capturedMismatchListener(bridge)
    listener({appProtocol: 2, serverProtocol: 1})
    expect(store.mismatch).not.toBeNull()

    listener(null)

    expect(store.mismatch).toBeNull()
  })
})

/**
 * TC-10 ("the banner ... says the edits made here stay on this Mac and go up once the two sides
 * agree") is wording carried by `ServerDetails.vue`, which is not a listed test seam — the plan's
 * own "Test seams" names only this store file as new, and holds "no new seam is created". There is
 * nothing at this seam to assert the wording against without either inventing a new seam or
 * comparing the test's own copy of the string to the component's, which would just prove the two
 * copies match each other. TC-10 is left to gate-b (browser), consistent with its own label.
 */
