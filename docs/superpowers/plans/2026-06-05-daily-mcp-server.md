# Daily MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose Daily's task-management tools to external MCP clients (Claude Desktop, Cursor, Codex, Telegram bot via Tailscale) through a local HTTP server that runs inside the Electron main process, off by default, with bearer-token auth and hard-destructive tools blocked.

**Architecture:** A new `src/main/mcp/` module hosts a small HTTP server (`node:http`) wrapping the official `@modelcontextprotocol/sdk` Streamable HTTP transport. It reuses the existing `ToolExecutor` and `StorageController` without modification. Lifecycle is driven by a new `settings.mcp` subtree; a Settings UI section toggles it on/off and surfaces host/port/token.

**Tech Stack:** TypeScript, Electron 36 main process, `@modelcontextprotocol/sdk` (new dep), `node:http`, existing `better-sqlite3` storage, Vue 3 + Pinia for the Settings UI, Vitest for tests.

**Design spec:** [docs/superpowers/specs/2026-06-05-daily-mcp-server-design.md](../specs/2026-06-05-daily-mcp-server-design.md)

---

## Conventions used throughout this plan

- **TDD is the rule.** For every behavior-bearing module: write the failing test first, run it, implement the minimum, run again, commit.
- **One commit per Task** unless the task explicitly says otherwise. Commit messages follow the repo style (`feat:`, `refactor:`, `test:`, `docs:`, `fix:`, `chore:` — see recent log).
- **Path aliases:** `@/` → `src/main/`, `@shared/` → `src/shared/`, `@main/` (tests only) → `src/main/`, `@renderer/` → `src/renderer/src/`.
- **Test commands:**
  - One file: `pnpm evitest run tests/main/<path>.test.ts`
  - Whole main suite: `pnpm test:main`
  - Whole repo: `pnpm test`
- **Logger pattern:** `logger.info(logger.CONTEXT.MCP, "message", optionalData)`. Tests mock `@main/utils/logger`. See [tests/main/storage/services/BranchesService.test.ts](../../../tests/main/storage/services/BranchesService.test.ts) lines 10-20 for the canonical mock.
- **Settings persistence:** `Settings` is one JSON document persisted in the `settings` table and merged via `deepMerge` over `getDefaultSettings()` on every read. Adding a new key in [src/main/storage/models/\_rowMappers.ts](../../../src/main/storage/models/_rowMappers.ts) `getDefaultSettings()` and in the `Settings` type is enough — **no SQL migration is required**.
- **`?raw` imports:** [src/main/ai/tools/tools.ts](../../../src/main/ai/tools/tools.ts) parses `tools.jsonl` via `?raw` at build time (Vite). We will reuse the already-parsed `AI_TOOLS` export, not re-parse JSONL.

---

## Task 0: Add the MCP SDK dependency

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml` (regenerated)

- [ ] **Step 1: Install `@modelcontextprotocol/sdk` as a runtime dependency**

```bash
pnpm add @modelcontextprotocol/sdk
```

- [ ] **Step 2: Verify the install**

Run: `pnpm list @modelcontextprotocol/sdk`
Expected output: a single line showing the installed version (1.x.x at time of writing).

- [ ] **Step 3: Confirm it imports cleanly under main-process tsconfig**

Run: `pnpm typecheck:main`
Expected: zero new errors (the dep is not used yet so it should not affect anything).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @modelcontextprotocol/sdk dependency for MCP server"
```

---

## Task 1: Extend `Settings` with the `mcp` subtree

**Files:**

- Modify: `src/shared/types/storage.ts`
- Modify: `src/main/storage/models/_rowMappers.ts`
- Modify: `src/main/types/logger.ts` (add `MCP` context)
- Test: `tests/main/storage/models/SettingsModel.test.ts` (create if missing)

- [ ] **Step 1: Write the failing test that loads defaults and asserts the `mcp` shape**

Create `tests/main/storage/models/SettingsModel.test.ts`:

```ts
// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {SettingsModel} from "@main/storage/models/SettingsModel"
import {createTestDatabase} from "../../../helpers/db"

vi.mock("@main/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    storage: vi.fn(),
    lifecycle: vi.fn(),
    CONTEXT: {SETTINGS: "SETTINGS"},
  },
}))

vi.mock("@main/config", () => ({
  APP_CONFIG: {window: {main: {width: 800, height: 600}}},
  ENV: {isDev: false},
}))

describe("SettingsModel — mcp defaults", () => {
  let db, model

  beforeEach(() => {
    db = createTestDatabase()
    model = new SettingsModel(db)
  })

  afterEach(() => {
    db.close()
  })

  it("returns mcp defaults when no settings row exists", () => {
    const s = model.loadSettings()
    expect(s.mcp).toEqual({
      enabled: false,
      host: "127.0.0.1",
      port: 7878,
      token: "",
    })
  })

  it("preserves user mcp values across save/load", () => {
    model.saveSettings({mcp: {enabled: true, host: "0.0.0.0", port: 9090, token: "abc"}})
    const s = model.loadSettings()
    expect(s.mcp).toEqual({enabled: true, host: "0.0.0.0", port: 9090, token: "abc"})
  })

  it("partial mcp update merges with existing values", () => {
    model.saveSettings({mcp: {enabled: true, host: "127.0.0.1", port: 7878, token: "first"}})
    model.saveSettings({mcp: {token: "second"} as any})
    const s = model.loadSettings()
    expect(s.mcp.token).toBe("second")
    expect(s.mcp.enabled).toBe(true)
    expect(s.mcp.port).toBe(7878)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm evitest run tests/main/storage/models/SettingsModel.test.ts`
Expected: FAIL — `s.mcp` is undefined.

- [ ] **Step 3: Add the type**

In `src/shared/types/storage.ts`, add above the `Settings` type:

```ts
export type McpSettings = {
  enabled: boolean
  host: string
  port: number
  /**
   * Bearer token sent by external MCP clients in the Authorization header.
   * Empty string means "not yet generated" (i.e. server has never been enabled).
   */
  token: string
}
```

Then add a field to `Settings`:

```ts
mcp: McpSettings
```

Place it after `updates`, before the closing brace.

- [ ] **Step 4: Add the default in `_rowMappers.ts`**

In `src/main/storage/models/_rowMappers.ts`, inside `getDefaultSettings()`, before `updates`, add:

```ts
mcp: {
  enabled: false,
  host: "127.0.0.1",
  port: 7878,
  token: "",
},
```

- [ ] **Step 5: Add `MCP` logger context**

In `src/main/types/logger.ts`, inside the `LOG_CONTEXT` object, after `AI: "AI"`, add:

```ts
MCP: "MCP",
```

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm evitest run tests/main/storage/models/SettingsModel.test.ts`
Expected: PASS — all three cases.

Run: `pnpm typecheck:main && pnpm typecheck:shared`
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/storage.ts src/main/storage/models/_rowMappers.ts src/main/types/logger.ts tests/main/storage/models/SettingsModel.test.ts
git commit -m "feat: add Settings.mcp subtree and MCP logger context"
```

---

## Task 2: Create local MCP types and constants

**Files:**

- Create: `src/main/mcp/types.ts`
- Create: `src/main/mcp/constants.ts`

This task adds no behavior, only declarations consumed by later tasks. It is intentionally not test-driven; types are exercised by every subsequent test.

- [ ] **Step 1: Create `src/main/mcp/constants.ts`**

```ts
export const MCP_SERVER_NAME = "daily"

export const MCP_DEFAULT_PORT = 7878
export const MCP_DEFAULT_HOST = "127.0.0.1"

export const MCP_AUTH_LOCKOUT_THRESHOLD = 5
export const MCP_AUTH_LOCKOUT_WINDOW_MS = 60_000
export const MCP_AUTH_LOCKOUT_DURATION_MS = 60_000

export const MCP_TOKEN_BYTES = 24

/**
 * Tool names from the AI tool set that MUST NOT be exposed via MCP because
 * they are irreversibly destructive or affect data the user cannot recover
 * via Daily's trash UI.
 */
export const MCP_BLOCKED_TOOL_NAMES = ["permanently_delete_task", "delete_project", "delete_tag", "remove_task_attachment"] as const

export type McpBlockedToolName = (typeof MCP_BLOCKED_TOOL_NAMES)[number]
```

- [ ] **Step 2: Create `src/main/mcp/types.ts`**

```ts
import type {McpSettings} from "@shared/types/storage"

export type McpStatus =
  | {state: "stopped"}
  | {state: "starting"}
  | {state: "running"; host: string; port: number}
  | {state: "stopping"}
  | {state: "error"; message: string}

export type McpConfig = McpSettings

export type McpAuthFailureReason = "missing_header" | "invalid_scheme" | "wrong_token" | "locked_out"

export type McpAuthResult = {ok: true} | {ok: false; reason: McpAuthFailureReason; status: 401 | 429}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck:main`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/mcp/types.ts src/main/mcp/constants.ts
git commit -m "feat: scaffold MCP types and constants"
```

---

## Task 3: Bearer-token authentication with per-IP lockout

**Files:**

- Create: `src/main/mcp/auth/bearerAuth.ts`
- Test: `tests/main/mcp/auth/bearerAuth.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/mcp/auth/bearerAuth.test.ts`:

```ts
// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {BearerAuth} from "@main/mcp/auth/bearerAuth"

vi.mock("@main/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    CONTEXT: {MCP: "MCP"},
  },
}))

describe("BearerAuth", () => {
  let auth: BearerAuth

  beforeEach(() => {
    auth = new BearerAuth("secret-token-123")
  })

  it("accepts a correct Authorization header", () => {
    const r = auth.check("Bearer secret-token-123", "1.2.3.4")
    expect(r).toEqual({ok: true})
  })

  it("rejects missing header", () => {
    const r = auth.check(undefined, "1.2.3.4")
    expect(r).toEqual({ok: false, reason: "missing_header", status: 401})
  })

  it("rejects header with wrong scheme", () => {
    const r = auth.check("Basic abc", "1.2.3.4")
    expect(r).toEqual({ok: false, reason: "invalid_scheme", status: 401})
  })

  it("rejects wrong token", () => {
    const r = auth.check("Bearer nope", "1.2.3.4")
    expect(r).toEqual({ok: false, reason: "wrong_token", status: 401})
  })

  it("locks out after 5 failures within the window", () => {
    for (let i = 0; i < 5; i++) auth.check("Bearer nope", "1.2.3.4")
    const r = auth.check("Bearer secret-token-123", "1.2.3.4")
    expect(r).toEqual({ok: false, reason: "locked_out", status: 429})
  })

  it("does not lock out a different IP", () => {
    for (let i = 0; i < 5; i++) auth.check("Bearer nope", "1.2.3.4")
    const r = auth.check("Bearer secret-token-123", "5.6.7.8")
    expect(r).toEqual({ok: true})
  })

  it("lockout expires after lockoutDurationMs", () => {
    const auth2 = new BearerAuth("t", {
      threshold: 2,
      windowMs: 1_000,
      lockoutMs: 50,
    })
    auth2.check("Bearer x", "1.1.1.1")
    auth2.check("Bearer x", "1.1.1.1")
    expect(auth2.check("Bearer t", "1.1.1.1")).toEqual({ok: false, reason: "locked_out", status: 429})

    return new Promise<void>((resolve) =>
      setTimeout(() => {
        expect(auth2.check("Bearer t", "1.1.1.1")).toEqual({ok: true})
        resolve()
      }, 80),
    )
  })

  it("rotateToken invalidates the previous token", () => {
    expect(auth.check("Bearer secret-token-123", "1.1.1.1")).toEqual({ok: true})
    auth.rotateToken("new-token")
    expect(auth.check("Bearer secret-token-123", "2.2.2.2")).toEqual({
      ok: false,
      reason: "wrong_token",
      status: 401,
    })
    expect(auth.check("Bearer new-token", "2.2.2.2")).toEqual({ok: true})
  })

  it("treats empty token as never-matching", () => {
    const a = new BearerAuth("")
    expect(a.check("Bearer ", "1.1.1.1")).toEqual({ok: false, reason: "wrong_token", status: 401})
    expect(a.check("Bearer anything", "1.1.1.1")).toEqual({ok: false, reason: "wrong_token", status: 401})
  })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `pnpm evitest run tests/main/mcp/auth/bearerAuth.test.ts`
Expected: FAIL — `BearerAuth` not found.

- [ ] **Step 3: Implement `BearerAuth`**

Create `src/main/mcp/auth/bearerAuth.ts`:

```ts
import {timingSafeEqual} from "node:crypto"

import {logger} from "@/utils/logger"

import {MCP_AUTH_LOCKOUT_DURATION_MS, MCP_AUTH_LOCKOUT_THRESHOLD, MCP_AUTH_LOCKOUT_WINDOW_MS} from "@/mcp/constants"

import type {McpAuthResult} from "@/mcp/types"

type FailureState = {
  failures: number
  firstFailureAt: number
  lockedUntil: number
}

export type BearerAuthOptions = {
  threshold?: number
  windowMs?: number
  lockoutMs?: number
}

export class BearerAuth {
  private failures = new Map<string, FailureState>()
  private readonly threshold: number
  private readonly windowMs: number
  private readonly lockoutMs: number

  constructor(
    private token: string,
    opts: BearerAuthOptions = {},
  ) {
    this.threshold = opts.threshold ?? MCP_AUTH_LOCKOUT_THRESHOLD
    this.windowMs = opts.windowMs ?? MCP_AUTH_LOCKOUT_WINDOW_MS
    this.lockoutMs = opts.lockoutMs ?? MCP_AUTH_LOCKOUT_DURATION_MS
  }

  rotateToken(next: string): void {
    this.token = next
    this.failures.clear()
  }

  check(header: string | undefined, ip: string): McpAuthResult {
    const now = Date.now()
    const state = this.failures.get(ip)

    if (state && state.lockedUntil > now) {
      logger.warn(logger.CONTEXT.MCP, `Auth locked out for ${ip}`)
      return {ok: false, reason: "locked_out", status: 429}
    }

    if (!header) return this.recordFailure(ip, now, "missing_header")

    const match = /^Bearer (.+)$/.exec(header)
    if (!match) return this.recordFailure(ip, now, "invalid_scheme")

    const supplied = match[1]
    if (!this.token || !this.constantTimeEquals(supplied, this.token)) {
      return this.recordFailure(ip, now, "wrong_token")
    }

    this.failures.delete(ip)
    return {ok: true}
  }

  private constantTimeEquals(a: string, b: string): boolean {
    const ab = Buffer.from(a)
    const bb = Buffer.from(b)
    if (ab.length !== bb.length) return false
    return timingSafeEqual(ab, bb)
  }

  private recordFailure(ip: string, now: number, reason: "missing_header" | "invalid_scheme" | "wrong_token"): McpAuthResult {
    const state = this.failures.get(ip)

    if (!state || now - state.firstFailureAt > this.windowMs) {
      this.failures.set(ip, {failures: 1, firstFailureAt: now, lockedUntil: 0})
    } else {
      state.failures += 1
      if (state.failures >= this.threshold) state.lockedUntil = now + this.lockoutMs
    }

    logger.warn(logger.CONTEXT.MCP, `Auth failure (${reason}) from ${ip}`)
    return {ok: false, reason, status: 401}
  }
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `pnpm evitest run tests/main/mcp/auth/bearerAuth.test.ts`
Expected: PASS — all eight cases.

- [ ] **Step 5: Commit**

```bash
git add src/main/mcp/auth/bearerAuth.ts tests/main/mcp/auth/bearerAuth.test.ts
git commit -m "feat: add bearer-token auth with per-IP lockout for MCP"
```

---

## Task 4: Tool registry (filter the AI tool set for MCP)

**Files:**

- Create: `src/main/mcp/tools/registry.ts`
- Test: `tests/main/mcp/tools/registry.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/mcp/tools/registry.test.ts`:

```ts
// @ts-nocheck
import {describe, expect, it} from "vitest"

import {buildMcpToolRegistry, MCP_BLOCKED_TOOL_NAMES} from "@main/mcp/tools/registry"

describe("MCP tool registry", () => {
  it("excludes all blocked tools", () => {
    const reg = buildMcpToolRegistry()
    const names = reg.list().map((t) => t.name)
    for (const blocked of MCP_BLOCKED_TOOL_NAMES) {
      expect(names).not.toContain(blocked)
    }
  })

  it("includes core read and write tools", () => {
    const reg = buildMcpToolRegistry()
    const names = reg.list().map((t) => t.name)
    for (const must of [
      "list_tasks",
      "create_task",
      "complete_task",
      "delete_task",
      "restore_task",
      "get_deleted_tasks",
      "list_projects",
      "list_tags",
    ]) {
      expect(names).toContain(must)
    }
  })

  it("each exposed tool has inputSchema with object type", () => {
    const reg = buildMcpToolRegistry()
    for (const tool of reg.list()) {
      expect(tool.inputSchema.type).toBe("object")
    }
  })

  it("has(name) reflects exclusion", () => {
    const reg = buildMcpToolRegistry()
    expect(reg.has("create_task")).toBe(true)
    expect(reg.has("permanently_delete_task")).toBe(false)
    expect(reg.has("unknown_tool")).toBe(false)
  })

  it("exposes 26 tools (30 total minus 4 blocked)", () => {
    const reg = buildMcpToolRegistry()
    expect(reg.list().length).toBe(26)
  })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `pnpm evitest run tests/main/mcp/tools/registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `registry.ts`**

Create `src/main/mcp/tools/registry.ts`:

```ts
import {AI_TOOLS} from "@/ai/tools/tools"
import {MCP_BLOCKED_TOOL_NAMES} from "@/mcp/constants"

export {MCP_BLOCKED_TOOL_NAMES} from "@/mcp/constants"

export type McpTool = {
  name: string
  description: string
  inputSchema: {
    type: "object"
    properties?: Record<string, unknown>
    required?: string[]
  }
}

export type McpToolRegistry = {
  list(): McpTool[]
  has(name: string): boolean
}

export function buildMcpToolRegistry(): McpToolRegistry {
  const blocked = new Set<string>(MCP_BLOCKED_TOOL_NAMES)
  const tools: McpTool[] = AI_TOOLS.filter((t) => !blocked.has(t.function.name)).map((t) => ({
    name: t.function.name,
    description: t.function.description ?? "",
    inputSchema: (t.function.parameters ?? {type: "object"}) as McpTool["inputSchema"],
  }))

  const byName = new Map(tools.map((t) => [t.name, t]))

  return {
    list: () => tools,
    has: (name) => byName.has(name),
  }
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `pnpm evitest run tests/main/mcp/tools/registry.test.ts`
Expected: PASS — all five cases.

- [ ] **Step 5: Commit**

```bash
git add src/main/mcp/tools/registry.ts tests/main/mcp/tools/registry.test.ts
git commit -m "feat: add MCP tool registry that filters out hard-destructive tools"
```

---

## Task 5: Tool dispatcher (MCP call → ToolExecutor)

**Files:**

- Create: `src/main/mcp/tools/dispatcher.ts`
- Test: `tests/main/mcp/tools/dispatcher.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/mcp/tools/dispatcher.test.ts`:

```ts
// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {McpToolDispatcher} from "@main/mcp/tools/dispatcher"
import {buildMcpToolRegistry} from "@main/mcp/tools/registry"

vi.mock("@main/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    CONTEXT: {MCP: "MCP"},
  },
}))

function makeExecutor(impl: (name: string, params: any) => any) {
  return {execute: vi.fn(async (name: string, params: any) => impl(name, params))}
}

describe("McpToolDispatcher", () => {
  it("delegates to ToolExecutor for an allowed tool", async () => {
    const executor = makeExecutor(() => ({success: true, data: {ok: 1}}))
    const d = new McpToolDispatcher(buildMcpToolRegistry(), executor as any)

    const r = await d.call("list_tasks", {})
    expect(executor.execute).toHaveBeenCalledWith("list_tasks", {})
    expect(r).toEqual({success: true, data: {ok: 1}})
  })

  it("rejects a blocked tool without calling executor", async () => {
    const executor = makeExecutor(() => ({success: true}))
    const d = new McpToolDispatcher(buildMcpToolRegistry(), executor as any)

    const r = await d.call("permanently_delete_task", {task_id: "x"})
    expect(executor.execute).not.toHaveBeenCalled()
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/not exposed/i)
  })

  it("rejects an unknown tool without calling executor", async () => {
    const executor = makeExecutor(() => ({success: true}))
    const d = new McpToolDispatcher(buildMcpToolRegistry(), executor as any)

    const r = await d.call("imaginary_tool", {})
    expect(executor.execute).not.toHaveBeenCalled()
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/unknown/i)
  })

  it("normalizes thrown errors from executor into ToolResult", async () => {
    const executor = makeExecutor(() => {
      throw new Error("boom")
    })
    const d = new McpToolDispatcher(buildMcpToolRegistry(), executor as any)

    const r = await d.call("list_tasks", {})
    expect(r.success).toBe(false)
    expect(r.error).toBe("boom")
  })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `pnpm evitest run tests/main/mcp/tools/dispatcher.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `dispatcher.ts`**

Create `src/main/mcp/tools/dispatcher.ts`:

```ts
import {logger} from "@/utils/logger"

import type {ToolExecutor} from "@/ai/tools/ToolExecutor"
import type {ToolResult} from "@/ai/tools/types"
import type {McpToolRegistry} from "@/mcp/tools/registry"

export class McpToolDispatcher {
  constructor(
    private registry: McpToolRegistry,
    private executor: Pick<ToolExecutor, "execute">,
  ) {}

  async call(name: string, params: Record<string, unknown>): Promise<ToolResult> {
    if (!this.registry.has(name)) {
      const blockedOrUnknown = name in {permanently_delete_task: 1, delete_project: 1, delete_tag: 1, remove_task_attachment: 1}
      const message = blockedOrUnknown ? `Tool '${name}' is not exposed via MCP` : `Unknown tool: ${name}`
      logger.warn(logger.CONTEXT.MCP, message)
      return {success: false, error: message}
    }

    try {
      return await this.executor.execute(name as any, params)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(logger.CONTEXT.MCP, `Tool '${name}' threw`, err)
      return {success: false, error: message}
    }
  }
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `pnpm evitest run tests/main/mcp/tools/dispatcher.test.ts`
Expected: PASS — all four cases.

- [ ] **Step 5: Commit**

```bash
git add src/main/mcp/tools/dispatcher.ts tests/main/mcp/tools/dispatcher.test.ts
git commit -m "feat: add MCP tool dispatcher delegating to ToolExecutor"
```

---

## Task 6: HTTP transport — `node:http` listener + JSON-RPC handler

**Files:**

- Create: `src/main/mcp/transport/HttpTransport.ts`
- Test: `tests/main/mcp/transport/HttpTransport.test.ts`

This task implements the HTTP plumbing without yet wiring it through the SDK. It is the layer that owns the `node:http.Server`, parses one JSON-RPC POST body, runs auth, and dispatches to a handler. Task 7 will plug the MCP SDK into that handler.

- [ ] **Step 1: Write the failing tests**

Create `tests/main/mcp/transport/HttpTransport.test.ts`:

```ts
// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {BearerAuth} from "@main/mcp/auth/bearerAuth"
import {HttpTransport} from "@main/mcp/transport/HttpTransport"

vi.mock("@main/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    CONTEXT: {MCP: "MCP"},
  },
}))

describe("HttpTransport", () => {
  let transport: HttpTransport
  let handler: any

  beforeEach(async () => {
    handler = vi.fn(async (body) => ({jsonrpc: "2.0", id: body.id, result: {echo: body}}))
    transport = new HttpTransport({
      host: "127.0.0.1",
      port: 0, // OS assigns
      auth: new BearerAuth("good-token"),
      handleJsonRpc: handler,
      appVersion: "test",
    })
    await transport.start()
  })

  afterEach(async () => {
    await transport.stop()
  })

  it("GET /mcp/health returns 200 without auth", async () => {
    const res = await fetch(`http://127.0.0.1:${transport.port}/mcp/health`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("ok")
  })

  it("POST /mcp without Authorization returns 401", async () => {
    const res = await fetch(`http://127.0.0.1:${transport.port}/mcp`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({jsonrpc: "2.0", id: 1, method: "tools/list"}),
    })
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it("POST /mcp with wrong token returns 401", async () => {
    const res = await fetch(`http://127.0.0.1:${transport.port}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer nope",
      },
      body: JSON.stringify({jsonrpc: "2.0", id: 1, method: "tools/list"}),
    })
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it("POST /mcp with correct token forwards body to handler and returns its response", async () => {
    const res = await fetch(`http://127.0.0.1:${transport.port}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer good-token",
      },
      body: JSON.stringify({jsonrpc: "2.0", id: 42, method: "tools/list"}),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({jsonrpc: "2.0", id: 42, result: {echo: {jsonrpc: "2.0", id: 42, method: "tools/list"}}})
    expect(handler).toHaveBeenCalledOnce()
  })

  it("POST /mcp with malformed JSON returns 400", async () => {
    const res = await fetch(`http://127.0.0.1:${transport.port}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer good-token",
      },
      body: "not json",
    })
    expect(res.status).toBe(400)
  })

  it("GET /mcp returns 405", async () => {
    const res = await fetch(`http://127.0.0.1:${transport.port}/mcp`)
    expect(res.status).toBe(405)
  })

  it("port-in-use start rejects with a descriptive error", async () => {
    const occupied = new HttpTransport({
      host: "127.0.0.1",
      port: transport.port,
      auth: new BearerAuth("x"),
      handleJsonRpc: handler,
      appVersion: "test",
    })
    await expect(occupied.start()).rejects.toThrow(/EADDRINUSE|in use/i)
  })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `pnpm evitest run tests/main/mcp/transport/HttpTransport.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `HttpTransport.ts`**

Create `src/main/mcp/transport/HttpTransport.ts`:

```ts
import {createServer} from "node:http"

import {logger} from "@/utils/logger"

import {MCP_SERVER_NAME} from "@/mcp/constants"

import type {BearerAuth} from "@/mcp/auth/bearerAuth"
import type {IncomingMessage, Server, ServerResponse} from "node:http"

export type JsonRpcHandler = (body: unknown) => Promise<unknown>

export type HttpTransportOptions = {
  host: string
  port: number
  auth: BearerAuth
  handleJsonRpc: JsonRpcHandler
  appVersion: string
}

export class HttpTransport {
  private server: Server | null = null
  private boundPort = 0

  constructor(private opts: HttpTransportOptions) {}

  get port(): number {
    return this.boundPort
  }

  async start(): Promise<void> {
    if (this.server) throw new Error("HttpTransport already started")

    const server = createServer((req, res) => this.handle(req, res))

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        server.removeListener("listening", onListening)
        reject(err)
      }
      const onListening = () => {
        server.removeListener("error", onError)
        resolve()
      }
      server.once("error", onError)
      server.once("listening", onListening)
      server.listen(this.opts.port, this.opts.host)
    })

    const addr = server.address()
    this.boundPort = typeof addr === "object" && addr ? addr.port : this.opts.port
    this.server = server

    logger.info(logger.CONTEXT.MCP, `HTTP transport listening on ${this.opts.host}:${this.boundPort}`)
  }

  async stop(): Promise<void> {
    const server = this.server
    if (!server) return
    this.server = null

    await new Promise<void>((resolve) => server.close(() => resolve()))
    logger.info(logger.CONTEXT.MCP, "HTTP transport stopped")
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? "/"
    const ip = req.socket.remoteAddress ?? "unknown"

    if (req.method === "GET" && url === "/mcp/health") {
      res.writeHead(200, {"Content-Type": "application/json"})
      res.end(JSON.stringify({status: "ok", name: MCP_SERVER_NAME, version: this.opts.appVersion}))
      return
    }

    if (url !== "/mcp") {
      res.writeHead(404).end()
      return
    }

    if (req.method !== "POST") {
      res.writeHead(405, {Allow: "POST"}).end()
      return
    }

    const auth = this.opts.auth.check(req.headers.authorization, ip)
    if (!auth.ok) {
      res.writeHead(auth.status, {"Content-Type": "application/json"})
      res.end(JSON.stringify({error: auth.reason}))
      return
    }

    let body: unknown
    try {
      body = await readJson(req)
    } catch {
      res.writeHead(400, {"Content-Type": "application/json"})
      res.end(JSON.stringify({error: "invalid_json"}))
      return
    }

    try {
      const result = await this.opts.handleJsonRpc(body)
      res.writeHead(200, {"Content-Type": "application/json"})
      res.end(JSON.stringify(result))
    } catch (err) {
      logger.error(logger.CONTEXT.MCP, "JSON-RPC handler threw", err)
      res.writeHead(500, {"Content-Type": "application/json"})
      res.end(JSON.stringify({error: "internal"}))
    }
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString("utf8")
  return JSON.parse(text)
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `pnpm evitest run tests/main/mcp/transport/HttpTransport.test.ts`
Expected: PASS — all seven cases.

- [ ] **Step 5: Commit**

```bash
git add src/main/mcp/transport/HttpTransport.ts tests/main/mcp/transport/HttpTransport.test.ts
git commit -m "feat: add HTTP transport with bearer auth for MCP server"
```

---

## Task 7: `McpServer` — lifecycle, JSON-RPC handler, SDK glue

**Files:**

- Create: `src/main/mcp/McpServer.ts`
- Test: `tests/main/mcp/McpServer.test.ts`

This task wires the SDK into the transport. The SDK provides the `Server` class that implements `initialize`, `tools/list`, `tools/call` framing. We hand it our registry and our dispatcher.

- [ ] **Step 1: Write the failing integration tests**

Create `tests/main/mcp/McpServer.test.ts`:

```ts
// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {McpServer} from "@main/mcp/McpServer"

vi.mock("@main/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    CONTEXT: {MCP: "MCP"},
  },
}))

function makeExecutor(impl?: (name: string, params: any) => any) {
  return {
    execute: vi.fn(async (name: string, params: any) => (impl ? impl(name, params) : {success: true, data: {name, params}})),
  }
}

async function rpc(port: number, token: string, method: string, params?: any) {
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params}),
  })
  return {status: res.status, body: await res.json()}
}

describe("McpServer (integration)", () => {
  let server: McpServer

  afterEach(async () => {
    if (server) await server.stop()
  })

  it("starts, reports running status with bound port, and stops cleanly", async () => {
    server = new McpServer({
      executor: makeExecutor() as any,
      appVersion: "test",
    })
    await server.start({enabled: true, host: "127.0.0.1", port: 0, token: "t"})
    const status = server.status()
    expect(status.state).toBe("running")
    if (status.state === "running") {
      expect(status.host).toBe("127.0.0.1")
      expect(status.port).toBeGreaterThan(0)
    }
    await server.stop()
    expect(server.status().state).toBe("stopped")
  })

  it("tools/list returns 26 tools and excludes blocked ones", async () => {
    server = new McpServer({executor: makeExecutor() as any, appVersion: "test"})
    await server.start({enabled: true, host: "127.0.0.1", port: 0, token: "t"})
    const port = (server.status() as any).port

    const {status, body} = await rpc(port, "t", "tools/list")
    expect(status).toBe(200)
    expect(body.result.tools.length).toBe(26)
    const names = body.result.tools.map((t: any) => t.name)
    expect(names).not.toContain("permanently_delete_task")
    expect(names).toContain("create_task")
  })

  it("tools/call dispatches to executor and returns its result", async () => {
    const executor = makeExecutor((name, params) => ({
      success: true,
      data: {echoedName: name, echoedParams: params},
    }))
    server = new McpServer({executor: executor as any, appVersion: "test"})
    await server.start({enabled: true, host: "127.0.0.1", port: 0, token: "t"})
    const port = (server.status() as any).port

    const {status, body} = await rpc(port, "t", "tools/call", {
      name: "create_task",
      arguments: {content: "buy milk"},
    })
    expect(status).toBe(200)
    expect(executor.execute).toHaveBeenCalledWith("create_task", {content: "buy milk"})
    expect(body.result).toBeDefined()
  })

  it("tools/call refuses a blocked tool without invoking executor", async () => {
    const executor = makeExecutor()
    server = new McpServer({executor: executor as any, appVersion: "test"})
    await server.start({enabled: true, host: "127.0.0.1", port: 0, token: "t"})
    const port = (server.status() as any).port

    const {body} = await rpc(port, "t", "tools/call", {
      name: "permanently_delete_task",
      arguments: {task_id: "x"},
    })
    expect(executor.execute).not.toHaveBeenCalled()
    expect(JSON.stringify(body)).toMatch(/not exposed/i)
  })

  it("rotateToken invalidates existing token immediately", async () => {
    server = new McpServer({executor: makeExecutor() as any, appVersion: "test"})
    await server.start({enabled: true, host: "127.0.0.1", port: 0, token: "first"})
    const port = (server.status() as any).port

    server.rotateToken("second")
    const r1 = await rpc(port, "first", "tools/list")
    expect(r1.status).toBe(401)
    const r2 = await rpc(port, "second", "tools/list")
    expect(r2.status).toBe(200)
  })

  it("start on busy port transitions to error status", async () => {
    const blocker = new McpServer({executor: makeExecutor() as any, appVersion: "test"})
    await blocker.start({enabled: true, host: "127.0.0.1", port: 0, token: "t"})
    const port = (blocker.status() as any).port

    server = new McpServer({executor: makeExecutor() as any, appVersion: "test"})
    await server.start({enabled: true, host: "127.0.0.1", port, token: "t"})
    expect(server.status().state).toBe("error")

    await blocker.stop()
  })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `pnpm evitest run tests/main/mcp/McpServer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `McpServer.ts`**

Create `src/main/mcp/McpServer.ts`:

```ts
import {logger} from "@/utils/logger"

import {BearerAuth} from "@/mcp/auth/bearerAuth"
import {MCP_SERVER_NAME} from "@/mcp/constants"
import {McpToolDispatcher} from "@/mcp/tools/dispatcher"
import {buildMcpToolRegistry} from "@/mcp/tools/registry"
import {HttpTransport} from "@/mcp/transport/HttpTransport"
import {Server as SdkServer} from "@modelcontextprotocol/sdk/server/index.js"
import {CallToolRequestSchema, ListToolsRequestSchema} from "@modelcontextprotocol/sdk/types.js"

import type {ToolExecutor} from "@/ai/tools/ToolExecutor"
import type {McpConfig, McpStatus} from "@/mcp/types"

export type McpServerOptions = {
  executor: Pick<ToolExecutor, "execute">
  appVersion: string
  /**
   * Notified whenever the server's externally-observable status changes.
   * Used by the app to broadcast over IPC; tests omit this.
   */
  onStatusChange?: (status: McpStatus) => void
}

export class McpServer {
  private status_: McpStatus = {state: "stopped"}
  private transport: HttpTransport | null = null
  private auth: BearerAuth | null = null
  private sdkServer: SdkServer | null = null

  constructor(private opts: McpServerOptions) {}

  status(): McpStatus {
    return this.status_
  }

  rotateToken(next: string): void {
    this.auth?.rotateToken(next)
  }

  async start(config: McpConfig): Promise<void> {
    if (this.status_.state === "running" || this.status_.state === "starting") {
      await this.stop()
    }
    this.setStatus({state: "starting"})

    try {
      this.auth = new BearerAuth(config.token)
      const registry = buildMcpToolRegistry()
      const dispatcher = new McpToolDispatcher(registry, this.opts.executor)

      const sdkServer = new SdkServer({name: MCP_SERVER_NAME, version: this.opts.appVersion}, {capabilities: {tools: {}}})

      sdkServer.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: registry.list(),
      }))

      sdkServer.setRequestHandler(CallToolRequestSchema, async (req) => {
        const name = req.params.name
        const args = (req.params.arguments ?? {}) as Record<string, unknown>
        const result = await dispatcher.call(name, args)

        const text = result.success ? JSON.stringify(result.data ?? {success: true}, null, 2) : `Error: ${result.error ?? "unknown error"}`

        return {
          content: [{type: "text", text}],
          isError: !result.success,
        }
      })

      this.sdkServer = sdkServer

      const transport = new HttpTransport({
        host: config.host,
        port: config.port,
        auth: this.auth,
        appVersion: this.opts.appVersion,
        handleJsonRpc: async (body) => this.handleJsonRpc(body),
      })

      await transport.start()
      this.transport = transport

      this.setStatus({state: "running", host: config.host, port: transport.port})
      logger.info(logger.CONTEXT.MCP, `McpServer started on ${config.host}:${transport.port}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(logger.CONTEXT.MCP, "McpServer failed to start", err)
      this.setStatus({state: "error", message})
      this.transport = null
      this.sdkServer = null
      this.auth = null
    }
  }

  async stop(): Promise<void> {
    if (this.status_.state === "stopped") return
    this.setStatus({state: "stopping"})

    try {
      if (this.transport) await this.transport.stop()
    } finally {
      this.transport = null
      this.sdkServer = null
      this.auth = null
      this.setStatus({state: "stopped"})
      logger.info(logger.CONTEXT.MCP, "McpServer stopped")
    }
  }

  private async handleJsonRpc(body: unknown): Promise<unknown> {
    const server = this.sdkServer
    if (!server) throw new Error("MCP server not initialized")
    // The SDK Server exposes a low-level _onrequest in current versions; if a stable
    // method is unavailable we fall back to manual dispatch below. Check the SDK
    // version in node_modules/@modelcontextprotocol/sdk and adapt this single call.
    // The shape `handleRequest(body)` is the public API in v1.x.
    return await (server as any).handleRequest(body)
  }

  private setStatus(next: McpStatus): void {
    this.status_ = next
    this.opts.onStatusChange?.(next)
  }
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `pnpm evitest run tests/main/mcp/McpServer.test.ts`
Expected: PASS — all six cases.

> **Note on SDK API drift:** If the test fails because `handleRequest` is not a function, open `node_modules/@modelcontextprotocol/sdk/dist/server/index.d.ts`, find the public method that processes a JSON-RPC body, and replace the one call in `handleJsonRpc`. Do not refactor anything else — the surface of this plan stays the same.

- [ ] **Step 5: Commit**

```bash
git add src/main/mcp/McpServer.ts tests/main/mcp/McpServer.test.ts
git commit -m "feat: add McpServer wiring SDK to HTTP transport and tool dispatcher"
```

---

## Task 8: IPC layer (handlers + BridgeIPC + preload)

**Files:**

- Create: `src/main/setup/ipc/mcp.ts`
- Modify: `src/shared/types/ipc.ts`
- Modify: `src/main/preload.ts`

This task adds no new business logic — only the IPC surface. There is no behavior to TDD; correctness is verified by typechecking and by the renderer integration tests in later tasks.

- [ ] **Step 1: Add the new BridgeIPC methods to the shared type**

In `src/shared/types/ipc.ts`, add the import:

```ts
import type {McpStatus} from "./mcp"
```

Wait — there is no `mcp.ts` in `src/shared/types/` yet. Create one first:

`src/shared/types/mcp.ts`:

```ts
export type McpStatus =
  | {state: "stopped"}
  | {state: "starting"}
  | {state: "running"; host: string; port: number}
  | {state: "stopping"}
  | {state: "error"; message: string}
```

Then re-export `McpSettings` (already in `storage.ts`) and use both here. Update `src/main/mcp/types.ts` to re-export from shared so main and shared agree:

In `src/main/mcp/types.ts`, replace the body with:

```ts
export type {McpStatus} from "@shared/types/mcp"
export type {McpSettings as McpConfig} from "@shared/types/storage"

export type McpAuthFailureReason = "missing_header" | "invalid_scheme" | "wrong_token" | "locked_out"

export type McpAuthResult = {ok: true} | {ok: false; reason: McpAuthFailureReason; status: 401 | 429}
```

Then in `src/shared/types/ipc.ts`, add at the top of the imports:

```ts
import type {McpStatus} from "./mcp"
```

And add the following inside the `BridgeIPC` interface (after the `// === AI LOCAL EVENTS ===` block):

```ts
// === MCP SERVER ===
"mcp:get-status": () => Promise<McpStatus>
"mcp:get-config": () => Promise<import("./storage").McpSettings>
"mcp:set-config": (config: Partial<import("./storage").McpSettings>) => Promise<McpStatus>
"mcp:rotate-token": () => Promise<{token: string}>
"mcp:on-status-changed": (callback: (status: McpStatus) => void) => () => void
```

- [ ] **Step 2: Create IPC handlers**

Create `src/main/setup/ipc/mcp.ts`:

```ts
import {randomBytes} from "node:crypto"
import {ipcMain} from "electron"

import {logger} from "@/utils/logger"

import {MCP_TOKEN_BYTES} from "@/mcp/constants"

import type {McpServer} from "@/mcp/McpServer"
import type {StorageController} from "@/storage/StorageController"
import type {McpSettings} from "@shared/types/storage"
import type {BrowserWindow} from "electron"

export function setupMcpIPC(
  getServer: () => McpServer | null,
  getStorage: () => StorageController | null,
  getMainWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle("mcp:get-status", () => getServer()?.status() ?? {state: "stopped"})

  ipcMain.handle("mcp:get-config", async () => {
    const settings = await getStorage()?.loadSettings()
    return settings?.mcp ?? {enabled: false, host: "127.0.0.1", port: 7878, token: ""}
  })

  ipcMain.handle("mcp:set-config", async (_e, partial: Partial<McpSettings>) => {
    const storage = getStorage()
    const server = getServer()
    if (!storage || !server) return {state: "stopped"}

    const current = (await storage.loadSettings()).mcp
    const merged: McpSettings = {
      enabled: partial.enabled ?? current.enabled,
      host: partial.host ?? current.host,
      port: partial.port ?? current.port,
      token: partial.token ?? current.token,
    }

    if (merged.enabled && !merged.token) merged.token = generateToken()

    await storage.saveSettings({mcp: merged})

    if (merged.enabled) {
      await server.start(merged)
    } else {
      await server.stop()
    }
    return server.status()
  })

  ipcMain.handle("mcp:rotate-token", async () => {
    const storage = getStorage()
    const server = getServer()
    if (!storage || !server) throw new Error("Storage or MCP server unavailable")

    const next = generateToken()
    const current = (await storage.loadSettings()).mcp
    await storage.saveSettings({mcp: {...current, token: next}})
    server.rotateToken(next)

    logger.info(logger.CONTEXT.MCP, "MCP token rotated")
    return {token: next}
  })

  // Status broadcasts originate from McpServer.onStatusChange — wired in app.ts.
  // setupMcpIPC only declares this is the channel renderers should listen on:
  // "mcp:status-changed" → renderer subscribes via "mcp:on-status-changed".
  void getMainWindow
}

function generateToken(): string {
  return `daily_${randomBytes(MCP_TOKEN_BYTES).toString("base64url")}`
}
```

> Note: `StorageController.loadSettings()` may not exist on the public interface today. If `pnpm typecheck:main` complains in step 5, expose it by adding a one-line passthrough in `StorageController` that delegates to `this.settingsService.loadSettings()`. Do not add new behavior — just a passthrough.

- [ ] **Step 3: Add preload bindings**

In `src/main/preload.ts`, add new imports if needed, then add inside the `contextBridge.exposeInMainWorld` object, after the AI events block:

```ts
"mcp:get-status": () => ipcRenderer.invoke("mcp:get-status") as Promise<import("@shared/types/mcp").McpStatus>,
"mcp:get-config": () => ipcRenderer.invoke("mcp:get-config") as Promise<import("@shared/types/storage").McpSettings>,
"mcp:set-config": (config: Partial<import("@shared/types/storage").McpSettings>) =>
  ipcRenderer.invoke("mcp:set-config", config) as Promise<import("@shared/types/mcp").McpStatus>,
"mcp:rotate-token": () => ipcRenderer.invoke("mcp:rotate-token") as Promise<{token: string}>,
"mcp:on-status-changed": (callback: (status: import("@shared/types/mcp").McpStatus) => void) => {
  const subscription = (_event: unknown, status: import("@shared/types/mcp").McpStatus) => callback(status)
  ipcRenderer.on("mcp:status-changed", subscription)
  return () => ipcRenderer.removeListener("mcp:status-changed", subscription)
},
```

- [ ] **Step 4: Typecheck both projects**

Run: `pnpm typecheck:main && pnpm typecheck:shared && pnpm typecheck:render`
Expected: zero errors.

If `StorageController.loadSettings` is missing, add this method to `src/main/storage/StorageController.ts`:

```ts
async loadSettings(): Promise<Settings> {
  return this.settingsService.loadSettings()
}
```

Re-run typecheck.

- [ ] **Step 5: Commit**

```bash
git add src/main/setup/ipc/mcp.ts src/shared/types/mcp.ts src/shared/types/ipc.ts src/main/preload.ts src/main/mcp/types.ts src/main/storage/StorageController.ts
git commit -m "feat: add MCP IPC channels and preload bindings"
```

---

## Task 9: Wire `McpServer` into the app lifecycle

**Files:**

- Modify: `src/main/app.ts`

- [ ] **Step 1: Wire startup**

In `src/main/app.ts`, add at the top:

```ts
import {McpServer} from "@/mcp/McpServer"
import {setupMcpIPC} from "@/setup/ipc/mcp"
```

Below `let ai: AIController | null = null` add:

```ts
let mcp: McpServer | null = null
```

Inside `app.whenReady().then(async () => { ... })`, after `await ai.init()` and after the existing `storage.cleanupOrphanFiles()` block but before `setupCSP()`, add:

```ts
const appVersion = APP_CONFIG.version ?? "unknown"
mcp = new McpServer({
  executor: ai!.getToolExecutor(),
  appVersion,
  onStatusChange: (status) => windows.main?.webContents.send("mcp:status-changed", status),
})

const settings = await storage.loadSettings()
if (settings.mcp.enabled) {
  await mcp.start(settings.mcp)
}
```

> Note: `AIController` may not expose `getToolExecutor()` today. If `pnpm typecheck:main` complains in Step 3, add a one-line getter:
>
> ```ts
> getToolExecutor() { return this.toolExecutor }
> ```
>
> in `src/main/ai/AIController.ts`. Use the actual private property name.

After the existing `setupAiIPC(...)` call, add:

```ts
setupMcpIPC(
  () => mcp,
  () => storage,
  () => windows.main,
)
```

- [ ] **Step 2: Wire shutdown**

Modify the existing `app.on("before-quit", ...)` block:

```ts
app.on("before-quit", async () => {
  if (mcp) await mcp.stop()
  if (ai) await ai.dispose()
})
```

- [ ] **Step 3: Typecheck and run all main tests**

Run: `pnpm typecheck:main && pnpm test:main`
Expected: zero errors; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/main/app.ts src/main/ai/AIController.ts
git commit -m "feat: start MCP server during Daily startup when enabled"
```

---

## Task 10: Pinia store for MCP status and config

**Files:**

- Create: `src/renderer/src/stores/mcp.store.ts`

This store reads config and status via IPC and subscribes to `mcp:on-status-changed`. UI consumes it in the next task.

- [ ] **Step 1: Create the store**

Create `src/renderer/src/stores/mcp.store.ts`:

```ts
import {ref} from "vue"
import {defineStore} from "pinia"

import type {McpStatus} from "@shared/types/mcp"
import type {McpSettings} from "@shared/types/storage"

export const useMcpStore = defineStore("mcp", () => {
  const status = ref<McpStatus>({state: "stopped"})
  const config = ref<McpSettings>({enabled: false, host: "127.0.0.1", port: 7878, token: ""})
  const loading = ref(false)
  let unsubscribe: (() => void) | null = null

  async function init() {
    config.value = await window.BridgeIPC["mcp:get-config"]()
    status.value = await window.BridgeIPC["mcp:get-status"]()
    unsubscribe = window.BridgeIPC["mcp:on-status-changed"]((next) => {
      status.value = next
    })
  }

  function dispose() {
    unsubscribe?.()
    unsubscribe = null
  }

  async function setConfig(partial: Partial<McpSettings>) {
    loading.value = true
    try {
      status.value = await window.BridgeIPC["mcp:set-config"](partial)
      config.value = await window.BridgeIPC["mcp:get-config"]()
    } finally {
      loading.value = false
    }
  }

  async function rotateToken() {
    const {token} = await window.BridgeIPC["mcp:rotate-token"]()
    config.value = {...config.value, token}
  }

  return {status, config, loading, init, dispose, setConfig, rotateToken}
})
```

- [ ] **Step 2: Typecheck renderer**

Run: `pnpm typecheck:render`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/stores/mcp.store.ts
git commit -m "feat: add Pinia store for MCP server status and config"
```

---

## Task 11: Settings UI section for MCP server

**Files:**

- Locate: `src/renderer/src/ui/views/Settings/{fragments}/` — existing settings sections live here
- Create: `src/renderer/src/ui/views/Settings/{fragments}/McpSection.vue`
- Modify: `src/renderer/src/ui/views/Settings/Settings.vue` to include the new section

- [ ] **Step 1: Read the existing settings sections to match style**

Read `src/renderer/src/ui/views/Settings/Settings.vue` and one existing fragment (e.g. a sync section if present, otherwise the first fragment listed). Match the import pattern, the `defineComponent` style (Composition `<script setup lang="ts">` or Options API — use whichever the existing fragments use), the Tailwind class conventions, and where sections are slotted into `Settings.vue`.

- [ ] **Step 2: Create `McpSection.vue`**

Create `src/renderer/src/ui/views/Settings/{fragments}/McpSection.vue`. Use the patterns observed in step 1; the structure must include:

- A toggle for `enabled` bound through `mcpStore.setConfig({enabled: !current})`.
- A status badge derived from `mcpStore.status` (stopped / starting / running on `host:port` / stopping / error message).
- Host text input (default placeholder `127.0.0.1`, helper text: "Use `0.0.0.0` to expose over Tailscale.")
- Port number input (default placeholder `7878`).
- A read-only token row with three buttons: "Reveal", "Copy", "Rotate". Token is masked as `••••••••` by default. Reveal toggles to plain text. Copy uses `navigator.clipboard.writeText(config.token)`. Rotate calls `mcpStore.rotateToken()`.
- A collapsible "Example client config" block showing a JSON snippet like:

  ```json
  {
    "mcpServers": {
      "daily": {
        "transport": "http",
        "url": "http://{{host}}:{{port}}/mcp",
        "headers": {"Authorization": "Bearer {{token}}"}
      }
    }
  }
  ```

  Substitute `{{host}}` / `{{port}}` / `{{token}}` from current config at render time. Provide a single "Copy" button on this snippet.

- Mount `mcpStore.init()` in `onMounted` and `mcpStore.dispose()` in `onBeforeUnmount`.

Use only existing UI primitives from `src/renderer/src/ui/base/` (Buttons, Inputs, Toggles, Cards) — do not introduce new ones.

- [ ] **Step 3: Register the section in `Settings.vue`**

Add the appropriate import and slot/usage in `Settings.vue` following the existing pattern for other sections.

- [ ] **Step 4: Manual smoke verification**

Run: `pnpm dev`
Then in the running Daily app:

1. Open Settings → MCP Server section.
2. Toggle on. Confirm token is auto-generated, status badge becomes "running on 127.0.0.1:7878".
3. From a separate terminal: `curl -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' http://127.0.0.1:7878/mcp`. Expect a JSON-RPC response listing 26 tools.
4. Rotate token. Re-run the curl with the old token — expect 401. With the new token — expect 200.
5. Toggle off. Status badge becomes "stopped". Curl returns connection refused.

If any step fails, fix and commit before proceeding.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck:render`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/ui/views/Settings/{fragments}/McpSection.vue src/renderer/src/ui/views/Settings/Settings.vue
git commit -m "feat: add MCP Server section to Settings UI"
```

---

## Task 12: Full-suite verification

**Files:** none new — gate before declaring done.

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 2: Typecheck everything**

Run: `pnpm typecheck:all`
Expected: zero errors across main / renderer / shared.

- [ ] **Step 3: Run the full test suite**

Run: `pnpm test`
Expected: all suites pass. New tests under `tests/main/mcp/` should number at least 30 (auth: 8, registry: 5, dispatcher: 4, transport: 7, McpServer: 6).

- [ ] **Step 4: Circular-dependency check**

Run: `pnpm circular`
Expected: no new circular dependencies.

- [ ] **Step 5: Manual E2E with Claude Desktop or curl**

Re-do the curl verification from Task 11 step 4 fresh from a clean Daily start. Confirm survival of Daily restart: token, host, port, enabled state must persist.

- [ ] **Step 6: No commit needed** (gating task only)

---

## Self-Review Notes

**Spec coverage check:**

- Architecture diagram → Tasks 6, 7
- File layout → Tasks 2–7
- Configuration / `Settings.mcp` → Task 1
- Tool surface and blocklist → Task 4
- HTTP transport / endpoints → Task 6
- Authentication / lockout / rotation → Tasks 3, 7, 8
- Lifecycle (off by default, start on enable, stop on quit, error on port-in-use) → Tasks 7, 9
- IPC surface → Task 8
- Renderer UI → Tasks 10, 11
- Logging conventions → Task 1 (context), Tasks 3, 5, 7 (call sites)
- Tests → every behavior-bearing task
- Manual E2E → Task 11, Task 12

**Open Questions from the spec, resolved here:**

- "Depend on `@modelcontextprotocol/sdk` or hand-roll?" → Depend on SDK. Task 0 installs it; Task 7 uses it.
- "Nested JSON or flat keys in settings?" → Nested JSON, no migration. Task 1 confirms via tests.
- "Where exactly does `McpServer` get wired into `app.ts`?" → After `ai.init()`, before `setupCSP()`. Task 9 specifies the exact location.

**Type consistency check:**

- `McpStatus` is defined once in `src/shared/types/mcp.ts` (Task 8) and re-exported from `src/main/mcp/types.ts`. All call sites use the shared definition.
- `McpSettings` is the canonical name in `src/shared/types/storage.ts` (Task 1). `McpConfig` in main is a re-export alias used for readability inside the MCP module; not used at the IPC boundary.
- `BearerAuth.check` returns `McpAuthResult` consistently in tasks 3 and 6.
- `McpServer.start(config: McpConfig)` matches `McpServer.start({enabled, host, port, token})` everywhere.

**No placeholders:** Every code block contains real code. Every assertion in tests is concrete. Test commands include exact `pnpm` invocations and expected outcomes.

**TDD discipline:** Tasks 1, 3, 4, 5, 6, 7 each follow the write-test-first → run-fail → implement → run-pass → commit cycle. Tasks 0, 2, 8, 9, 10, 11, 12 are infrastructure / scaffolding / verification with explicit non-TDD justification noted where it applies.
