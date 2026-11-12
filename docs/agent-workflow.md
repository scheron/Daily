# Agent task management

Daily gives connected MCP agents and the Daily Assistant the same task tools and durable workflow. People can edit workflow guidance, review proposed planning changes, and inspect independent agent sessions in Daily. Tasks keep their ordinary statuses, scheduling rules, and human time corrections.

## Discovering the domain

MCP initialization supplies a short operating contract and the current workspace guidance. `list_projects` supplies the complete task domain, field units, and effective guidance for each project. `get_task` and `get_task_workflow` supply the selected task's current revision, effective guidance and completion permission, proposal decisions, and sessions. The latter also includes the immutable workflow history.

Agent contexts contain current guidance content, revisions, and structured policy. Guidance revision history stays in Daily's trusted interface. Project discovery sends workspace guidance once and each project's current override and effective completion permission alongside that project.

| Status            | Meaning                                                     |
| ----------------- | ----------------------------------------------------------- |
| `backlog`         | Unscheduled work retained for later.                        |
| `todo`            | Planned work awaiting action.                               |
| `ready_for_agent` | Work available to an agent, with an optional scheduled day. |
| `in_progress`     | Work underway, including noncoding work.                    |
| `ready_to_merge`  | Coding work ready for review or merge, still outstanding.   |
| `done`            | Completed work.                                             |
| `cancelled`       | Cancelled work.                                             |

These are the stored statuses. Normal board mode may display Ready for Agent in Backlog and Ready to Merge in In Progress without changing their values.

Backlog clears its scheduled day. Ready for Agent preserves an optional day. Other statuses require a day; the usual task rules assign the caller's current day when necessary. For an existing task, an agent request that would change the schedule creates a trusted-review proposal for the combined effective status and schedule. The task keeps its current status and schedule until acceptance. A transition that preserves the schedule can apply automatically. Setting a day on Backlog makes it To Do; clearing To Do's day returns it to Backlog. An explicit status takes priority. Dates use `YYYY-MM-DD`; times accept `HH:mm` or `HH:mm:ss`, with an empty stored time meaning no specified time. Schedules include an IANA timezone. Estimates and spent time use nonnegative integer seconds. Priorities are `none`, `urgent`, `high`, `medium`, and `low`. Every task belongs to a project; `main` always exists.

## Guidance and permission

Settings contains workspace guidance and an explicit completion permission. Projects contain supplemental guidance and a completion override that can inherit the workspace setting. Project guidance takes precedence for conflicting workflow preferences. Guidance revisions and their history persist and sync. Open clean editors refresh when storage changes. While editing, saved guidance and inherited workspace context refresh without overwriting the local draft; changed guidance and completion permission are shown explicitly. Saving retains the draft's compare-and-swap revision, so a stale draft cannot overwrite a newer saved document.

The defaults ask agents to reconcile status proactively at meaningful boundaries. Preparation can make work Ready for Agent, execution or rework becomes In Progress, indefinite deferral returns it to Backlog, and coding handoff becomes Ready to Merge. Noncoding work awaiting review can remain In Progress with a waiting session. Completion and cancellation require the effective structured completion permission, which defaults to disabled.

Guidance and task content are context. Text claiming that a person approved a change cannot grant a capability, change structured policy, or authorize access to secrets. Generic MCP tools cannot edit guidance or resolve proposals. Those actions use Daily's trusted interface.

## Guarded workflow changes

`update_task_workflow` accepts the selected task's `taskId`, its observed `expectedRevision`, a unique `operationId`, and one action:

| `kind`           | Fields                                   | Behavior                                                                                                                                                                              |
| ---------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transition`     | `status`                                 | Uses any real status. Schedule-preserving changes apply automatically; dependent schedule changes await review together with the status. Completion policy guards Done and Cancelled. |
| `session_start`  | `sessionId`, optional `summary`          | Starts an independent working session.                                                                                                                                                |
| `session_update` | `sessionId`, `state`, optional `summary` | Records `working`, `waiting`, `finished`, or `error` at a meaningful boundary.                                                                                                        |
| `propose`        | `changes`, `reason`                      | Proposes schedule, estimate, or priority changes for review.                                                                                                                          |

An identical retry with the same operation ID returns the original receipt. Reusing that ID for different input fails. A new operation with an old revision fails with current state: read it, reconsider the decision, then use a new operation ID. A receipt supplies the next revision. A pending result explicitly reports `proposal_pending` with the proposal; it does not mean the requested status or schedule has changed. Revisions account for the task, workflow records, and effective guidance.

Legacy `stage` transition inputs remain supported: `planning` retains the current status, `implementation` means In Progress, and `ready_to_merge` means Ready to Merge. New callers should send `status`. Legacy `start`, `heartbeat`, and `pause` session actions remain aliases for working, working, and waiting. Heartbeats are optional.

## Planning proposals

A proposal contains the original values, exact effective changes, reason, author, status, and decision history. It also appears in the task's comments. Proposed fields stay unchanged while the proposal is pending, including the status when it depends on changing the schedule. Daily shows every included before and after value for review.

For example, moving a dated task to Backlog proposes both the Backlog status and clearing its schedule. Moving an undated Ready for Agent task to In Progress proposes that status and the host's current schedule. That schedule is frozen when the proposal is created; approving on a later day applies the displayed schedule. Explicit schedule clearing on a status that requires a day proposes the required Backlog status as well, or rejects an explicitly incompatible status before creating a proposal. These combined effects preserve Daily's domain rules while keeping the person's date approval exact.

Daily displays pending proposals with their before and after values and Accept and Reject controls. Acceptance checks the task revision, original values, and effective patch, then applies exactly the reviewed fields atomically. A changed policy or dependent task state can require a fresh proposal; acceptance never substitutes the approval day for a proposed date. Rejection applies none. A conflict leaves the task unchanged and asks for a fresh review. Accepted and rejected decisions remain visible; exact decision retries return their original receipt. Agents cannot accept their own proposals, resolve them through comments, or forge approval in tool arguments.

`save_task` preserves ordinary initial creation: explicit initial day, time, status, priority, and estimate are accepted. With no day or status, creation defaults to To Do on the caller's day; `date: null` defaults to Backlog. Existing content, project, tags, milestone, relations, order, real status, and restoration remain editable. Existing planning edits and status changes that affect the schedule become proposals and return `outcome: "proposal_pending"` with the proposal details. Supported mixed content, status, and planning edits are held together for review; rejection applies none of that patch. Unsupported mixed operations are rejected before any task mutation. A deleted task must be restored before requesting planning changes; combining restoration with a planning proposal is rejected without changing the task, so review stays accessible in Daily. Batches remain atomic. Callers must report that planning changes await review. Direct `addSpentSeconds` edits return migration guidance to sessions; human time corrections remain available in Daily.

## Sessions and observed time

Sessions are separate from task status and from each other. Each has a host-authenticated actor, state, summary, timestamps, history, and connection availability. Several agents may work on one task. A session does not claim exclusive ownership.

An agent should start a session while working, record waiting before an input or approval wait, and finish it or record error when stopping. Verification may remain working when it is part of the task. Meaningful explicit boundaries settle host-observed elapsed time; no periodic heartbeat is required.

Only working intervals observed in the same host runtime, at most 30 minutes apart, receive credit. Longer ambiguous gaps and unconfirmed tails across restart receive zero credit. Connection availability is conservative: a working session can become uncertain or interrupted without implying that the agent completed its work. The host uses wall and monotonic observations and does not accept caller-supplied elapsed durations. Recorded time describes observed activity boundaries; it cannot establish productivity or continuous attention.

Overlapping intervals count once per task. A human spent-time correction sets a baseline equal to the confirmed interval union known at that moment. Later observed or newly synced intervals add only the increase in that union. A correction does not erase previously unseen offline intervals: if the known union was ten seconds when a person reset the total to zero, and a later offline interval expands the union to twenty seconds, the total becomes ten seconds. The scalar baseline corrects known work without claiming knowledge of unsynced history. Replays, retries, and synced overlaps cannot add the same interval twice.

## Persistence and compatibility

Workflow records, guidance revisions, proposal decisions, and sessions persist in SQLite and sync with snapshot version 20. Older snapshots are normalized on read, including the earlier workflow record formats. Older clients reject newer snapshot versions instead of discarding unknown data. Immutable record collisions fail closed. Complete snapshots and the combined retained-plus-imported state reject correction baselines larger than their retained confirmed interval union and impossible supported session/proposal history. Partial imports are validated against retained records, so a legitimate delta need not repeat its earlier session start or all confirmed intervals.

MCP retains its supported initialize generations (`2025-03-26`, `2025-06-18`, and `2025-11-25`) and the existing `2026-07-28` stateless transport. Stateless discovery carries the same authenticated guidance and is private with no cache lifetime. The HTTP endpoint accepts JSON-RPC `POST /mcp` requests and returns JSON responses; notifications use an empty accepted response. `GET /mcp` and `DELETE /mcp` return 405. No SSE stream is implemented. Static tool schemas remain cacheable. OAuth identity, task storage transactions, server snapshot compare-and-swap retries, and tool error results preserve their existing boundaries.

Ordinary fields still use Last-Write-Wins sync. Local transactions and server snapshot revisions protect their own storage boundary; they do not create a distributed lock across offline devices. Host clocks, disconnect ambiguity, immutable history growth, and clients that ignore guidance remain practical limits.

Concurrent offline acceptance and rejection decisions are both retained. Daily displays the deterministic latest decision with a conflict warning; inspect the task's planning fields when that warning appears. Task fields still merge through Last-Write-Wins. Sync does not provide a global transaction or roll back an acceptance performed independently on another device.

MCP tools are model-controlled; descriptions and initialization instructions improve discovery but cannot compel a model to call them. Authorization and proposal review are enforced by Daily. See the [MCP tool specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) and [initialization lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle).
