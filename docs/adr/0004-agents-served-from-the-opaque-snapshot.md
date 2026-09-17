# Agents are served by the sync server from its opaque snapshot, through an in-memory core

Agents — Claude Code, the Claude app, Codex — need to read and change the work the way they do in
Linear, including from a phone while every Mac is asleep. The Daily Sync Server stores the whole of
that work as one snapshot document and never looks inside it. We decided that the server itself
serves agents, on the same process and port as sync, and that its storage stays exactly as it is:
for a tool call it loads the stored snapshot into `packages/core` running on an in-memory database,
runs the tool through the same services the app runs, and writes the result back with the existing
conditional write at the revision it read, attributed to the agent's Mac.

## Considered Options

**A tabular server.** Unpack the snapshot into the same tables the client has, and let agents query
them. Rejected because it binds the server to a schema that is still moving — `Snapshot.version`
went from 4 to 7 between 2026-09-11 and 2026-09-17 — so every such app release would need a server
upgrade, and an older server receiving a newer snapshot could only drop the fields it does not know,
silently, or stop sync. It would also be a third representation of the same data: the snapshot
stays regardless, because iCloud and the sync protocol carry it. Sync would not get cheaper unless
the protocol moved to row deltas as well, and the client already had delta sync, with a change log
and triggers, and removed it.

**Edit the snapshot's rows directly on the server.** No dependency on `packages/core`. Rejected
because the rules about tasks live in the services — task events, ordering, the backlog invariant
of ADR 0002 — and a second copy of them written against snapshot rows would drift, with the drift
spreading to every Mac through sync before anyone noticed.

**A separate service beside the server that syncs as a device.** Keeps the server untouched.
Rejected because each install shape would need new routing, the self-signed install has no proxy
to route through at all, and the service would keep a persistent copy of data the server already
holds.

**A relay that forwards each call to a Mac.** Keeps the server dumb and runs every tool on a real
app. Rejected because agents would work only while some Mac is awake with Daily open, which is the
case the phone exists to escape.

**A local MCP server inside the app**, the approach of the 2026-07 `feat/mcp-impl` branch. Rejected
for the same reason, and because it reaches only an agent on that same computer.

## Consequences

The server stops being purely a store. It still resolves no conflict — the conditional write means
it never merges, and a lost race is reloaded and re-applied — but it now makes changes an agent
asked for. `CONTEXT.md` says so in its definition of the Daily Sync Server.

The server image carries `packages/core`, and a snapshot version bump in the app now needs a server
release before agents can write again. The release tooling counts changes to `packages/core` as
pending for the server so this cannot be forgotten.

An agent never moves the data's version. If the stored snapshot is newer than the server knows,
tools refuse and ask for a server upgrade; if it is older, tools read and refuse to write until the
Macs are updated. The server is upgraded by hand and the Macs by their updater, and a version raised
by an agent would stop sync on a Mac nobody was looking at.

Writes are serialised in the server, and each is a whole-snapshot write, as a Mac's is. That is the
right cost at a single person's data size, for the same reason ADR 0003 gives for holding every task
in memory; the size at which it stops being right is a new decision with a measurement in front of
it.

Agents exist only for people who run a server. iCloud and no-sync users get none.
