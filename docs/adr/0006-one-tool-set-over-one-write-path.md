# Agents and the Daily Assistant share one tool set and write path

AI can access Daily through MCP agents on the sync server or through the app's Daily Assistant.
Each had a separate tool set built over the same core. Their features became different. The
Assistant could not see the backlog or milestones. It could see tags only from the active project.

Both tool sets also left comments behind when moving a task to another project. The code that moved
comments lived in one desktop-only method. Neither tool set called it.

We define one tool set in `packages/tools`. It reads and writes only through `IWorkStorage`.
`WorkStorage` in `packages/core` is its only implementation and performs every step of a write.
Hosts differ only in the dependencies and follow-up actions they provide:

- The desktop's `StorageController` sends its writes through the same `WorkStorage`. It then updates
  the renderer and pushes sync changes.
- The server builds a `WorkStorage` over its snapshot and adds no follow-up actions.

The Assistant and agents have the same tools. This includes tools that the Assistant cannot use yet.
For example, it cannot supply image bytes to `save_attachment` until chat accepts images.

Every delete is soft, including attachment deletes. The Assistant asks for confirmation before
running a tool marked as deleting. Agent clients receive the `destructiveHint` flag for these tools.
Daily itself does not pause an agent's delete for confirmation.

## Options considered

**Keep two tool sets and fix their differences manually.** This is cheapest now. We rejected it
because every new feature would need changes in both places. The comment bug shows that this is
easy to miss.

**Keep two tool sets and test that their features match.** This finds missing tools but keeps two
implementations. A test may show that both tools move tasks without checking that both move comments.
We rejected it for this reason.

**Share an interface but let each host implement it.** We rejected this because it moves duplicate
code from tools into adapters. The comment bug already came from that layer.

**Give each host a shared abstract controller.** We chose composition instead of inheritance. The
desktop controller also manages sync, settings, and the server provider. A base controller would
couple those responsibilities to data operations.

## Consequences

The Assistant uses the MCP tool structure. There are fewer tools, and each supports more operations.
For example, `save_task` creates, updates, moves, and restores tasks. Small local models required
narrow tools and three prompt tiers. Those models are no longer a target, so the Assistant uses one
prompt.
