# Agents and the Daily Assistant share one tool set, over one write path

Daily gives an AI two ways into the work: agents over MCP on the sync server, and the Daily
Assistant built into the app. Each had its own tool set, written separately over the same core, and
they drifted — the Assistant could not see the backlog, had no milestones, and saw only the active
project's tags, while a task moved to another project left its comments behind on both sides,
because the step that moves them lived in one desktop-only method neither tool set called. We
decided that there is one tool set, defined once in `packages/tools`, and that it reads and writes
only through `IWorkStorage`, whose single implementation `WorkStorage` in `packages/core` carries
every step of a write. Each host differs only in what it wires in: the desktop's `StorageController`
routes its own writes through the same `WorkStorage` and adds the renderer update and the sync push
after them; the server builds a `WorkStorage` over its snapshot and adds nothing.

The Assistant may do exactly what an agent may — no tool is withheld from either side, even where
the Assistant cannot use one yet (it has no source of image bytes for `save_attachment` until the
chat accepts images). Every delete is soft, attachments included. A tool marked as deleting makes
the Assistant ask the person first, and is advertised to an agent's client with `destructiveHint`;
Daily itself does not hold an agent's delete for confirmation.

## Considered Options

**Keep two tool sets and close the gaps by hand.** Cheapest now. Rejected because the drift is
structural: any capability added on one side has to be remembered on the other, and the comment bug
shows it is not remembered.

**Two sets with a test that their capabilities match.** Catches the drift, keeps the duplication.
Rejected for the same reason one level down: the test says that both sides can move a task, not
that both move its comments.

**A shared interface implemented separately by each host.** Rejected because it moves the
duplication from the tools into the adapters, which is exactly where the comment bug sat.

**An abstract controller each host extends.** Rejected in favour of composition: the desktop
controller also owns sync, settings and the server provider, and inheriting the work operations from
a base class would tie those to the data path.

## Consequences

The Assistant's tools now have the MCP shape — fewer, wider tools such as a `save_task` that
creates, updates, moves and restores. Small local models were the reason for the narrow shape and
the three prompt tiers; they are no longer a target, so the Assistant keeps one prompt.
