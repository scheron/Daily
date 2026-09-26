// @ts-nocheck
import {vi} from "vitest"

export function mockBridgeIPC(overrides = {}) {
  const noop = vi.fn().mockResolvedValue(undefined)
  const noopOn = vi.fn()

  const bridge = {
    "settings:load": vi.fn().mockResolvedValue({
      version: "v1",
      themes: {current: "github-light", preferredLight: "github-light", preferredDark: "github-dark", useSystem: true, glassUI: false},
      sync: {iCloud: {enabled: false}, server: {enabled: false, binding: null}},
      ai: null,
      branch: {activeId: "main"},
      layout: {
        sectionsCollapsed: {active: false, discarded: false, done: false},
      },
      window: {main: {width: 800, height: 600, isMaximized: false, isFullScreen: false}},
      updates: {skippedReleaseId: null, cached: null, installed: null},
    }),
    "settings:save": noop,
    "settings:on-changed": noopOn,
    "platform:is-mac": vi.fn().mockReturnValue(false),
    "tasks:get-one": vi.fn().mockResolvedValue(null),
    "tasks:create": noop,
    "tasks:update": noop,
    "tasks:delete": vi.fn().mockResolvedValue(true),
    "tasks:move-by-order": noop,
    "tasks:move-to-branch": vi.fn().mockResolvedValue(true),
    "relations:get-all": vi.fn().mockResolvedValue([]),
    "relations:set": vi.fn().mockResolvedValue({}),
    "tags:get-many": vi.fn().mockResolvedValue([]),
    "tags:create": noop,
    "tags:delete": noop,
    "branches:get-many": vi.fn().mockResolvedValue([]),
    "branches:create": noop,
    "branches:update": noop,
    "branches:delete": vi.fn().mockResolvedValue(true),
    "branches:set-active": noop,
    "storage-sync:get-status": vi.fn().mockResolvedValue("inactive"),
    "storage-sync:sync": noop,
    "storage-sync:on-status-changed": noopOn,
    "storage:on-changed": noopOn,
    "search:query": vi.fn().mockResolvedValue([]),
    "updates:get-state": noop,
    "updates:download": noop,
    "updates:on-state-changed": noopOn,
    "sync-server:get-state": vi.fn().mockResolvedValue({binding: null, revoked: false, mismatch: null, isReachable: true}),
    "sync-server:retry": noop,
    "sync-server:on-revoked": noopOn,
    "sync-server:on-protocol-mismatch-changed": noopOn,
    "sync-server:on-role-changed": noopOn,
    "sync-server:on-agents-accepted-changed": noopOn,
    "sync-server:on-reachability-changed": noopOn,
    ...overrides,
  }

  ;(globalThis as any).window = (globalThis as any).window || {}
  ;(globalThis as any).window.BridgeIPC = bridge

  return bridge
}
