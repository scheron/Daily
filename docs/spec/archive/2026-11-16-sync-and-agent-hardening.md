This is history; the rules that hold now are in `docs/spec/`.

# Spec: Search, agent access, MCP and sync over slow connections

## Result

A search with a project or trash filter ranks the whole filtered set before it takes a page. Agents that need a server-issued client ID register dynamically, but only inside a Mac's Agent window and within fixed limits. Searched MCP reads run in a bounded separate process, and every tool call leaves a sanitized record on the data volume. Sync keeps edits made during transfers, merges before it writes again after a lost reply, and lets slow transfers finish while they still deliver data.

## Out of scope

- iCloud sync starting on activation without waiting for a window or a local edit. It is in the same sync change but has no rule.
- The callback and PKCE rules for authorization, and journal rotation and retention. They live in ADR 0005 and `apps/server/MCP-JOURNAL.md`.

## Done and Spec

```text
## Done

1. An agent runs `list_tasks` with a project and a search, while other projects hold higher-ranked matches → the page holds that project's best matches, and the total counts every match in the project.
2. An agent runs `list_tasks` with a search and `deleted: true` → the results come from the trash, ranked the same way.
3. Post to `/oauth/register` with no Agent window open → `403`. Open the window on a Mac and post again → a client ID, and no new agent appears in the agent list.
4. Register a ninth distinct client in one window → `429`, which says to open a new window. Repeat a registration that was already accepted → the same client ID.
5. Register a 33rd distinct client within one minute across windows → `429` with `Retry-After`.
6. Leave a registered client ID unused for 24 hours → it stops working. Register again in an open window → a new ID.
7. An agent with a callback to a local program asks for access → the Mac's card shows the code, the name the agent supplied, the return host and a warning about local programs. A website callback → no such warning.
8. While an agent's search runs, another client completes an OAuth step and a Mac syncs → both get answers without waiting for the search.
9. An agent cancels a search, or its connection drops → the search's process stops, and the next queued search starts.
10. A search waits in the queue and runs past five seconds in total → it ends with a timeout error, and the server keeps serving later searches.
11. An agent with two searches waiting sends a third, or eight searches are waiting across agents → the new search is refused as overloaded.
12. An agent calls a tool → the journal on the data volume holds a start and an end record with the same ID, the tool name, the result code and the times, and no task text, search text or tokens.
13. The journal folder is not writable → the server logs one warning and keeps serving MCP and sync.
14. Edit a task while a snapshot download, a migration upload or a retry pause is running → after the next cycle the server holds the edit, and the edit is still on the Mac.
15. A write reaches the server but its reply is lost → the app reads and merges the server's current revision before it writes again, and another device's change in that revision survives.
16. A snapshot download or upload keeps delivering bytes slowly for longer than 30 seconds → it continues. After 30 seconds with no data, or 15 minutes in total → it ends, and nothing is committed.
17. A third upload arrives while two are running → the server asks it to retry. After a sender disconnects → a new upload is accepted.
18. A Mac is revoked while its upload is still arriving → the server does not commit the snapshot.
19. Another device commits while an upload is still arriving → the server refuses the stale upload, and the revision stays the other device's.

## Spec

+ task-search — Task search
  About: Text search over tasks, with filters, ranking and pages.
+ agent-connection — Connecting an agent
  About: How an MCP client gets access to a Daily server: client identification, registration and approval on a Mac.
+ mcp-server — MCP on the server
  About: The server's MCP endpoint: how agents' tool calls run and are recorded.
+ sync — Sync
  About: How the app and a sync provider exchange snapshots, and what survives slow or broken connections.
+ task-search#filter-before-rank — A search with a project or trash filter ranks every task in that set before it takes a page, and the total counts every match
  Why: results in a project were lost to higher-ranked matches from other projects
  Done: 1, 2
+ agent-connection#registration-needs-window — Dynamic registration issues a client ID only while a Mac's Agent window is open, and creates no approval, grant or token
  Why: the address is public, and only a Mac approval with a matching code grants access ([ADR 0005](../adr/0005-agent-access-approved-on-a-mac.md))
  Done: 3
+ agent-connection#registration-limits — Registration allows 8 new clients per window, 32 per minute across the server and 1,024 stored; an unused ID expires after 24 hours, and repeating a registration returns the same ID
  Why: the endpoint faces the internet and must not be able to fill the database ([ADR 0005](../adr/0005-agent-access-approved-on-a-mac.md))
  Done: 4, 5, 6
+ agent-connection#approval-shows-destination — The Mac's approval card shows the code, the name the agent supplied and where the browser returns; a callback to a local program carries a warning
  Why: the agent declares its own name, so the destination is the only way to spot an impostor
  Done: 7
+ mcp-server#search-isolated — A searched MCP read runs in a separate process, so OAuth and sync keep answering while it runs
  Why: a heavy search blocked the whole server
  Done: 8
+ mcp-server#search-bounded — A search has 5 seconds including its time in the queue, with at most 2 waiting per agent and 8 in total; cancellation or a dropped connection stops its process at once
  Why: one agent must not hold the CPU or memory of a small server
  Done: 9, 10, 11
+ mcp-server#journal — Every authenticated tool call writes a start and an end record to the data volume, without task content, search text or credentials; a failing journal never stops MCP or sync
  Why: failed calls can be diagnosed after a restart without exposing data
  Done: 12, 13
+ sync#edits-survive-transfer — An edit made during a snapshot transfer, a migration upload or a retry pause is kept and sent in a later cycle
  Why: such edits were lost
  Done: 14
+ sync#lost-reply-merges-first — When a write's reply is lost, the app reads and merges the server's current revision before it writes again
  Why: the write may have already gone through, and writing it again blindly would overwrite another device's change
  Done: 15
+ sync#slow-transfer — A snapshot transfer fails only after 30 seconds with no data or 15 minutes in total, in the app and on the server; the server takes 2 uploads at a time and asks others to retry
  Why: large snapshots over slow connections timed out at 30 seconds and never synced
  Done: 16, 17
+ sync#upload-rechecked — Before it commits an upload, the server checks the device credential and the expected revision again
  Why: during a long upload the device can be revoked, or another device can commit first
  Done: 18, 19
```
