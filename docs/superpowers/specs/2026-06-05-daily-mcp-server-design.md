# Daily MCP Server — Design

Status: Draft for implementation
Author: Oleg
Date: 2026-06-05

## Goal

Expose Daily's task-management capabilities to external Model Context Protocol (MCP) clients (Claude Desktop, Cursor, Codex, custom bots) over a local HTTP transport. The server runs inside the Electron main process, reuses the existing `StorageController` and `ToolExecutor`, and is off by default.

The motivating scenarios:

1. Manage tasks from any MCP-aware editor or chat client without leaving it.
2. Drive Daily from a Telegram bot reachable via Tailscale, so the user can write "remind me to call mom tomorrow at 5pm" from their phone and have it land in Daily.

## Non-Goals

- Headless / Raspberry Pi deployment without Electron. (See "Future" — sketched only.)
- Two-way sync with a remote SQLite copy on another machine.
- Outbound MCP host mode (Daily's assistant consuming external MCP servers).
- MCP resources or prompts. Only tools in the first iteration.
- stdio transport. HTTP is sufficient for both local and Tailscale use cases.
- Per-client tokens, mTLS, OAuth.
- Replacing or refactoring the existing AI assistant.

## Architecture

```
External MCP client (Claude Desktop / Telegram bot / Cursor)
            |
            | HTTP (Streamable), Authorization: Bearer <token>
            v
Electron main process
  └── McpServer (new)
        ├── HttpTransport            — listens on configured host:port
        ├── bearerAuth middleware    — checks token via timingSafeEqual
        ├── ToolRegistry             — exposes filtered tool set
        └── Dispatcher  ─────────────→ ToolExecutor ──→ StorageController
                                         (existing)        (existing)
```

The MCP server is a regular module inside Electron main, sibling to `StorageController` and `AIController`. It does **not** have its own process, its own database, or its own queue. Concurrency with the in-app AI assistant is handled by the same `StorageController` that already serializes writes via SQLite.

## File Layout

New directory:

```
src/main/mcp/
  McpServer.ts           — start/stop lifecycle, owns HttpTransport instance
  transport/
    HttpTransport.ts     — JSON-RPC over Streamable HTTP (node:http based)
  auth/
    bearerAuth.ts        — Authorization header check, timing-safe compare,
                           failed-attempt counter with per-IP lockout
  tools/
    registry.ts          — Generates MCP tool definitions from existing
                           tools.jsonl, minus the blocked set
    dispatcher.ts        — Maps MCP `tools/call` requests to
                           ToolExecutor.execute(name, params)
  types.ts               — Local types (config, status, error shapes)
```

Touched (existing) files:

- `src/shared/types/storage.ts` — add `mcp` subtree to `Settings`.
- `src/main/app.ts` — start/stop McpServer based on settings.
- `src/main/setup/ipc/mcp.ts` — new IPC handlers.
- `src/main/preload.ts` — expose `mcp:*` methods on `BridgeIPC`.
- `src/shared/types/ipc.ts` — declare new BridgeIPC methods.
- `src/renderer/src/stores/mcp.store.ts` — new store: status, config.
- `src/renderer/src/api/Storage.ts` — wrappers for new IPC methods (or a new `Mcp.ts` API module if the existing one feels overloaded).
- `src/renderer/src/ui/views/Settings/` — new "MCP Server" section.

Not touched in this spec (deliberately): `ToolExecutor.ts`, `AIController.ts`, JSONL files. They stay as they are. The MCP server adapts to them, not the other way around.

## Configuration

New `Settings.mcp`:

```ts
type McpSettings = {
  enabled: boolean // default: false
  host: string // default: "127.0.0.1"
  port: number // default: 7878
  token: string // auto-generated on first enable; empty when disabled
}
```

Persistence:

- Stored in the existing `settings` table. If settings is a JSON document, just add the key. If it is a flat key-value store, add `mcp.enabled`, `mcp.host`, `mcp.port`, `mcp.token`.
- No SQL migration is required if settings is JSON; otherwise a small additive migration.
- Token is generated client-side in main (`crypto.randomBytes(24).toString("base64url")`) the first time the user enables the server, and on every explicit rotate.

## Tool Surface

The server exposes all tools from [src/main/ai/tools/tools.jsonl](../../../src/main/ai/tools/tools.jsonl) **except** the following four:

- `permanently_delete_task` — irreversible
- `delete_project` — destroys all tasks in a project
- `delete_tag` — affects every task with that tag
- `remove_task_attachment` — hard-deletes a file from disk

`delete_task` remains exposed because it is a soft delete: the task moves to trash and `restore_task` can bring it back. `get_deleted_tasks` is exposed so a client can list and restore.

This filter is implemented in `tools/registry.ts` as a single blocklist constant. Adding or removing items is one line.

### Tool parameter and result conventions

- `project_id` stays optional everywhere. If omitted, the operation targets the user's currently active project, exactly as it does for the in-app AI assistant today.
- Every write tool's result MUST include the effective `projectId` so an MCP client can verify where the change landed without parsing strings.
- Tool descriptions and JSON schemas are passed through unchanged from the JSONL.

### Naming

Tool names are kept verbatim from `tools.jsonl` (`create_task`, `list_tasks`, etc). No `daily_` prefix — MCP clients namespace by server name automatically.

## HTTP Transport

- Uses `node:http`, no Express, no Fastify.
- One endpoint: `POST /mcp` accepting JSON-RPC 2.0 over Streamable HTTP per the MCP 2025+ transport spec.
- A second endpoint: `GET /mcp/health` returning `{status: "ok", version}` without requiring auth, for debugging connectivity.
- Server identity: `name: "daily"`, `version: <from package.json>`, `protocolVersion: <whatever @modelcontextprotocol/sdk pins>`.

If `@modelcontextprotocol/sdk` is added as a dependency, it owns JSON-RPC framing, capability negotiation, and tool listing. The custom code is then thin glue: an Express-less adapter that mounts the SDK's transport handler onto `node:http`. If we choose not to depend on the SDK, the same shape can be hand-rolled — JSON-RPC 2.0 is small. Decision is deferred to the implementation plan; the design here works either way.

## Authentication

- Every request must include `Authorization: Bearer <token>`.
- Comparison via `crypto.timingSafeEqual` against `settings.mcp.token`.
- 401 on missing / mismatched / empty token.
- Lockout: an in-memory `Map<string, {failures: number, lockedUntil: number}>` keyed by client IP. After 5 failures in 60s, return 429 for 60s. State is per-process and resets on Daily restart. No persistence required for MVP.
- Tokens are never logged. Auth failures log only the IP and the fact of failure, never the supplied token.

## Lifecycle

- Off by default. The user enables in Settings.
- On Daily startup, after `StorageController.init()` completes, if `settings.mcp.enabled === true`, call `McpServer.start()`.
- On settings change (toggle, host, port, or token rotation), call `McpServer.stop()` then `McpServer.start()` with new config. Token rotation also immediately invalidates in-flight authenticated requests.
- On Daily quit, `McpServer.stop()` is awaited as part of the graceful shutdown sequence (before `StorageController.shutdown()` if such ordering matters).
- If `start()` fails (e.g. port in use), the server enters an `error` status with a human-readable message. The UI shows it; the user can change the port and retry.

Status enum (also surfaced over IPC):

```ts
type McpStatus =
  | {state: "stopped"}
  | {state: "starting"}
  | {state: "running"; host: string; port: number}
  | {state: "stopping"}
  | {state: "error"; message: string}
```

## IPC Surface

New handlers in `src/main/setup/ipc/mcp.ts`:

- `mcp:get-status` → `McpStatus`
- `mcp:get-config` → `McpSettings` with token included (renderer needs it for the Settings UI; never sent to non-renderer surfaces)
- `mcp:set-config` → updates settings + restarts server if `enabled`
- `mcp:rotate-token` → generates new token, restarts server, returns the new value

Events broadcast to renderer:

- `mcp:on-status-changed` → `McpStatus`

## Renderer UI

New section in Settings ("MCP Server"):

- Toggle: Enabled / Disabled
- Status badge: stopped / running on `host:port` / error message
- Host input (default `127.0.0.1`, helper text explaining Tailscale use case for `0.0.0.0`)
- Port input (default `7878`)
- Token row: masked by default, "Reveal" + "Copy" + "Rotate" buttons
- Collapsible "Example client config" with copy-pasteable Claude Desktop / Cursor / generic JSON-RPC examples filled with current host/port/token

The `mcp.store.ts` Pinia store subscribes to `mcp:on-status-changed`, owns the local copy of `McpStatus`, and writes via `mcp:set-config` / `mcp:rotate-token`.

## Concurrency With The Existing AI Assistant

The in-app AI assistant and the MCP server share `StorageController`. SQLite handles concurrent writes. The only nuance is that the AI assistant's `AsyncMutex` (see Phase 1 of the agent roadmap) guards its own turn loop — that mutex does **not** apply to MCP calls and does not need to. Each MCP tool call is a single, self-contained operation against `ToolExecutor`.

## Logging

A new logger context `logger.CONTEXT.MCP` is added. The server logs:

- Lifecycle: `start`, `stop`, `error`.
- Per-request: timestamp, method (`tools/list`, `tools/call`), tool name, duration, success/failure. Tool parameters are summarized (counts, IDs), not dumped.
- Auth failures: IP and failure count only.

No task content, no tags, no user messages, no tokens, no prompts.

## Testing

Unit (`tests/main/mcp/`):

- `bearerAuth.test.ts` — pass, fail, empty, lockout after 5 failures, lockout expires.
- `registry.test.ts` — blocked tools excluded; non-blocked tools all present; schema preserved.
- `dispatcher.test.ts` — known tool dispatched, unknown tool returns proper JSON-RPC error.

Integration (`tests/main/mcp/integration/`):

- `lifecycle.test.ts` — start/stop, port-in-use error, restart on settings change.
- `endToEnd.test.ts` — spin up `McpServer` against an in-memory SQLite, send real HTTP requests via `fetch`, validate JSON-RPC responses for `initialize`, `tools/list`, `tools/call create_task`, `tools/call list_tasks`, and an unauthorized request.

Manual E2E:

- Document a Claude Desktop config example in README. Verify the round-trip: create, list, complete, delete, restore.

## Future (out of scope here, sketched for context)

- **Phase 2 of agent roadmap (Tool Registry) integration**: when the registry lands, `src/main/mcp/tools/registry.ts` switches from reading JSONL directly to consuming the shared registry. The blocklist remains.
- **Per-client tokens**: replace the single token with a list, each labeled, each rotatable independently. Same auth middleware, indexed lookup.
- **Headless mode on a Raspberry Pi**: extract `src/main/storage/` and the MCP server into a `packages/mcp-headless` workspace package, build it as a Node binary on arm64, and design a Mac ↔ Pi sync strategy. This is a separate, larger spec.
- **stdio transport**: add as an alternative transport in `src/main/mcp/transport/StdioTransport.ts` if a use case appears that HTTP cannot serve.

## Open Questions

These are intentionally deferred to the implementation plan, not the design:

1. Do we depend on `@modelcontextprotocol/sdk` or hand-roll JSON-RPC framing? Both are workable; SDK saves code, hand-rolled removes a dependency.
2. Does the existing settings storage support nested JSON values cleanly, or do we add flat keys (`mcp.enabled`, etc.)? Verify in code, no design impact.
3. Where exactly does `McpServer` get wired into `app.ts` — alongside `AIController` init, or in its own setup function? Style choice, no design impact.

## Acceptance Criteria

- A new user opens Daily, goes to Settings → MCP Server, flips the toggle. A token is generated and displayed. The status badge shows "running on 127.0.0.1:7878".
- The user pastes the generated config into Claude Desktop, restarts it, and can immediately call `create_task`, `list_tasks`, `complete_task` against their real Daily database.
- The user binds to `0.0.0.0`, exposes via Tailscale, and a remote Telegram bot can perform the same operations.
- Destructive operations (`permanently_delete_task`, `delete_project`, `delete_tag`, `remove_task_attachment`) are not visible in `tools/list` and return a method-not-found error if called directly.
- Daily restart preserves enabled state, host, port, and token.
- All new files have unit and integration test coverage matching the patterns used elsewhere in `tests/main/`.
- No regression in the in-app AI assistant: existing tests still pass; the assistant's behavior is unchanged.
