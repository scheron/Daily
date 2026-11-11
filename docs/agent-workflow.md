# Agent task workflow

Daily exposes the same guarded task workflow to connected MCP agents and the Daily Assistant. The person selects the task. Agents read its current workflow, record planning or implementation progress, propose changes, and hand finished implementation back at `ready_to_merge`. The person retains completion, cancellation, reopening, and planning decisions in the app.

## Discovering the contract

MCP tools are model controlled: the client and model decide when to invoke them. Daily supplies descriptions, input schemas and annotations through `tools/list`; these are guidance and metadata. An annotation does not authorize a write or enforce a workflow. Daily validates operations inside shared tools and storage. Domain refusals return a tool result with `isError: true`, a stable error code, a useful message and current workflow state when available, so the model can reconsider its next operation. Unknown tools and malformed protocol requests use JSON-RPC errors. See the [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

The existing initialization path includes optional server `instructions` describing the workflow. Clients negotiate their supported version and capabilities during initialization; the [MCP lifecycle specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle) defines that exchange. Daily retains its existing initialization generations, including `2025-11-25`, and existing `2026-07-28` stateless request handling. This feature introduces no transport or connection-compatibility guarantee beyond those existing paths. Instructions cannot force an external model to call a tool.

## A selected task, one operation at a time

1. Call `get_task_workflow` with `{ "taskId": "selected-task-id" }` before starting work. Its state contains `task`, opaque `revision`, immutable `records`, `activeSessions`, pending `proposals`, and `confirmedSeconds`.
2. Call `update_task_workflow` with that observed revision and a unique `operationId`. Each operation changes one thing: a stage, a session checkpoint, or a proposal.
3. Keep the receipt. It contains `operationId`, `taskId`, `revision`, `kind`, `recordId`, and `confirmedSeconds`.
4. If delivery is uncertain, retry the exact command with the same operation ID. A committed identical retry returns the original receipt even if later operations changed the task. Reusing that ID for different input is rejected.
5. After a stale-revision refusal, read the returned current state or fetch again, reconsider the operation, and use a new operation ID with the current revision. Do not blindly overwrite the revision in an old command.

Revision is an equality token, not a counter for clients to increment. It includes task content, persisted per-task mutation generation and workflow history, so even same-millisecond changes followed by reversals invalidate an older observation. The SQLite guard and write occur together; the server also preserves its snapshot compare-and-swap boundary when reconstructing a workspace for each call.

`get_task` obtains its task fields and revision from the same workflow observation before enriching the response with related details. A concurrent human edit can make that observation stale, in which case a subsequent write refuses it. Tag additions, removals and reversals also advance the task's persisted mutation generation and invalidate active checkpoints.

Sync merges the generation's mutation markers independently of ordinary task fields. A marker remains an invalidation even when a clock-skewed task update loses Last-Write-Wins while its tag update wins. Marker union is deterministic and idempotent; replay or an edit followed by its reversal cannot restore an older observation. These marker sets can grow with merge history.

For example, beginning implementation uses the following tool arguments after reading a scheduled task:

```json
{
  "taskId": "selected-task-id",
  "operationId": "implementation-unique-operation-id",
  "expectedRevision": "revision-from-get-task-workflow",
  "kind": "transition",
  "stage": "implementation"
}
```

The supported operations are:

| `kind`       | Additional arguments      | Effect                                                                     |
| ------------ | ------------------------- | -------------------------------------------------------------------------- |
| `transition` | `stage: "planning"`       | Records planning while retaining the task's current status.                |
| `transition` | `stage: "implementation"` | Moves a scheduled task to `in_progress`, including rework after review.    |
| `transition` | `stage: "ready_to_merge"` | Hands a scheduled task back for human review.                              |
| `start`      | `sessionId`               | Starts an active-work session without changing the stage or granting time. |
| `heartbeat`  | `sessionId`               | Confirms the bounded interval since the session's preceding checkpoint.    |
| `pause`      | `sessionId`               | Confirms that bounded interval and stops the session.                      |
| `propose`    | `changes`, `reason`       | Records an immutable pending planning proposal and a visible task comment. |

Every row also requires `taskId`, `operationId`, and `expectedRevision`. Agents cannot mark a task `done` or `cancelled`, or reopen either resolved status. An implementation or review transition needs a scheduled day already selected by the person; no transition silently chooses one. Planning preserves the current stage, and `start` does not imply implementation. Several agents may work on the same selected task; this API grants no exclusive claim.

## Planning changes stay proposals

`changes` accepts only `scheduled`, `estimatedTime`, and `priority`. `scheduled` uses the task's existing date/time/timezone shape or `null`; `estimatedTime` is in seconds. Supply a reason that explains the suggested change to the person.

```json
{
  "taskId": "selected-task-id",
  "operationId": "estimate-unique-operation-id",
  "expectedRevision": "current-revision",
  "kind": "propose",
  "changes": {"estimatedTime": 1800},
  "reason": "The migration also needs a restart verification pass."
}
```

A proposal does not edit those task fields. It stays pending in workflow history and appears in task comments with its reason. There is no agent apply or approval endpoint. The person manually edits the task in Daily. A model's assertion that approval was granted carries no authority, and matching task values never turns an old proposal into an accepted one.

New proposal records store the presentation's comment ID; protection does not depend on comment text. Storage refuses agent updates and deletes of these comments, including requests by another agent. Ordinary comments retain their editing behavior. The person can intentionally edit or delete a proposal comment in the app; its immutable pending proposal and reason remain in workflow history. Older version 17 proposals retain their history but have no structural comment binding.

Legacy agent writes cannot bypass the workflow by passing status, schedule, estimate, priority or spent time to `save_task` or the underlying agent storage update. Agent-created tasks enter unscheduled Backlog. Ordinary permitted content, project, tag and relation edits remain available. Trusted app edits keep their existing human behavior; this does not add GUI approval controls.

## Recording bounded active time

Start only while actively working. Heartbeat within 60 seconds, and pause before waiting, test queues, approval, or handing work back. Each operation takes one host-owned wall and monotonic clock observation. A checkpoint confirms the preceding interval only when both elapsed values are nonnegative, at most 60 seconds, and agree within 1 millisecond. That tolerance accommodates wall-clock millisecond sampling; credit uses the smaller elapsed value. Larger clock adjustments or either clock regressing forfeit the interval. The wall anchor is used for overlap union only after this agreement check.

`start` grants zero seconds. A gap beyond the bound grants no interval credit, and neither does an unconfirmed tail after the last checkpoint. A restarted host has a new runtime generation, so an old session cannot turn downtime into work time. Persisted monotonic checkpoints survive workspace reconstruction within the same host runtime. Legacy checkpoints without monotonic metadata expire. Task edits and stage transitions conservatively invalidate earlier checkpoints as well; read current state and start a new session instead of attributing an uncertain interval to changed work.

Confirmed intervals are combined by union per task. Two agents working for the same ten seconds contribute ten task seconds. An identical operation retry grants no additional time. `confirmedSeconds` describes confirmed workflow time, not the sum of parallel agent effort or proof that an external model was active.

Workflow interval union stays separate from human-entered time. Effective task spent time combines the human baseline with confirmed workflow time beyond its baseline checkpoint. A trusted absolute spent-time edit atomically checkpoints the already-known workflow contribution, allowing the person to correct the total without repeatedly re-adding old intervals. Later independent intervals still contribute.

## Persistence, synchronization and limits

Immutable workflow records are persisted with task data in SQLite and included in snapshot version 18 as `docs.workflowRecords`, with `checkpointMonotonic` and `proposalCommentId` fields. Task rows also carry the persisted `workflow_generation` mutation marker and `workflow_time_baseline` checkpoint. Reconstructing a server workspace or reopening its SQLite store retains receipts, proposals and confirmed intervals. Independent records merge by identity; overlap and replay do not inflate time. The merge contract treats a reused record identity with different contents as a collision and refuses synchronization instead of choosing a winner. Version 17 records normalize with null values for the two added fields, preserving receipts and confirmed history while expiring old active checkpoints. Earlier supported snapshots normalize without records. A client that cannot understand version 18 refuses it instead of discarding workflow metadata.

Workflow commands, identities, canonical requests, receipts, bounded intervals and task time metadata are validated before import writes and time projections. Validation also checks the combined effective total against the prospective task and complete ledger, including incremental imports, so separately valid values cannot persist an overflowing total. Malformed workflow data aborts import or synchronization with an actionable error and leaves the prior database unchanged; records are not silently discarded. Correct the source snapshot before retrying. Records are appended only after the complete immutable receipt is constructed. The Assistant's actual model message retains the refusal code and current workflow state, so it can recover from stale observations through the same contract as MCP clients.

Daily continues to use Last-Write-Wins for ordinary task fields. A local transaction and server snapshot revision protect their own storage boundary; they do not form a distributed lock across offline Macs. Concurrent human planning edits, offline changes and cross-device clock differences retain those limits. Actor identity and runtime generation come from the host, not arbitrary tool arguments. Guidance and activity records cannot establish that an external agent followed every instruction.

The automated HTTP coverage uses ephemeral loopback servers, temporary SQLite directories, real OAuth fixtures and store restart. It does not establish the macOS GUI gate. Before release, inspect a proposal comment in the actual app and manually edit planning fields, status and spent time; that human check remains required.
