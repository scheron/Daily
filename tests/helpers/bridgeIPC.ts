// @ts-nocheck
import {vi} from "vitest"

export function mockBridgeIPC(overrides = {}) {
  const noop = vi.fn().mockResolvedValue(undefined)
  const noopOn = vi.fn()

  const bridge = {
    "settings:load": vi.fn().mockResolvedValue({
      version: "v1",
      themes: {current: "github-light", preferredLight: "github-light", preferredDark: "github-dark", useSystem: true, glassUI: false},
      sidebar: {collapsed: false},
      sync: {enabled: false},
      ai: null,
      branch: {activeId: "main"},
      layout: {
        type: "list",
        columnsHideEmpty: false,
        columnsAutoCollapseEmpty: false,
        columnsCollapsed: {active: false, discarded: false, done: false},
      },
      window: {main: {width: 800, height: 600, isMaximized: false, isFullScreen: false}},
      updates: {skippedReleaseId: null, cached: null, installed: null},
    }),
    "settings:save": noop,
    "days:get-many": vi.fn().mockResolvedValue([]),
    "days:get-one": vi.fn().mockResolvedValue(null),
    "tasks:create": noop,
    "tasks:update": noop,
    "tasks:delete": vi.fn().mockResolvedValue(true),
    "tasks:move-by-order": noop,
    "tasks:move-to-branch": vi.fn().mockResolvedValue(true),
    "tasks:toggle-minimized": noop,
    "tags:get-many": vi.fn().mockResolvedValue([]),
    "tags:create": noop,
    "tags:update": noop,
    "tags:delete": noop,
    "branches:get-many": vi.fn().mockResolvedValue([]),
    "branches:create": noop,
    "branches:update": noop,
    "branches:delete": vi.fn().mockResolvedValue(true),
    "branches:set-active": noop,
    "deleted-tasks:get-many": vi.fn().mockResolvedValue([]),
    "storage-sync:get-status": vi.fn().mockResolvedValue("inactive"),
    "storage-sync:activate": noop,
    "storage-sync:deactivate": noop,
    "storage-sync:sync": noop,
    "storage-sync:on-status-changed": noopOn,
    "storage-sync:on-data-changed": noopOn,
    "search:query": vi.fn().mockResolvedValue([]),
    "updates:get-state": noop,
    "updates:check": noop,
    "updates:download": noop,
    "updates:on-state-changed": noopOn,
    ...overrides,
  }

  ;(globalThis as any).window = (globalThis as any).window || {}
  ;(globalThis as any).window.BridgeIPC = bridge

  return bridge
}
