# The sync server runs agent tools on a snapshot loaded into memory

Agents such as Claude Code, the Claude app, and Codex need to read and change work, as they do in
Linear. They must also work from a phone while every Mac is asleep.

The Daily Sync Server stores all work in one snapshot document. During sync, it does not read the
snapshot's contents. The server itself serves agents in the same process and on the same port as
sync. Its stored data stays in the same format.

For each tool call, the server loads the snapshot into `packages/core` with an in-memory database.
It runs the tool through the same services as the app. It writes the result only if the stored
revision still matches the revision it read. The write records the agent's Mac as its source.

## Options considered

**Store the server's work in tables.** We could unpack the snapshot into client-style tables and let
agents query them. We rejected this because the data structure still changes often.
`Snapshot.version` went from 4 to 7 between 2026-09-11 and 2026-09-17. Each such app release would
need a server upgrade. An older server would either silently drop unknown fields or stop sync.

Tables would also add a third form of the same data. The snapshot must remain because iCloud and
the sync protocol use it. Sync costs would fall only if the protocol also sent changes to individual
rows. The client once had that approach, with a change log and triggers, and removed it.

**Edit snapshot rows directly on the server.** This avoids a dependency on `packages/core`. We
rejected it because services own the task rules, including events, ordering, and ADR 0002's backlog
rule. A second implementation would eventually behave differently. Sync would spread its errors to
every Mac before anyone noticed.

**Add a separate service that syncs as a device.** This leaves the server unchanged. We rejected it
because every deployment type would need new routing. A self-signed deployment has no proxy to do
that routing. The service would also keep another permanent copy of data the server already stores.

**Forward each call to a Mac.** This keeps processing in the app. We rejected it because a Mac must
be awake with Daily open. Phone access must work without that requirement.

**Run a local MCP server inside the app.** The 2026-07 `feat/mcp-impl` branch used this approach.
We rejected it for the same reason. It also serves only agents on that computer.

## Consequences

The server now makes changes requested by agents. It still does not merge conflicts. If another
write changes the revision first, the server reloads the snapshot and applies the operation again.
`CONTEXT.md` includes this behavior in its definition of the Daily Sync Server.

The server image includes `packages/core`. When the app adds a snapshot version, the server needs
a release before agents can write again. Release tools count changes to `packages/core` as pending
server changes.

An agent never changes the snapshot version. If the stored version is newer than the server supports,
tools refuse access and ask for a server upgrade. If it is older, tools allow reads but refuse writes
until the Macs are updated. People upgrade the server manually; Macs use the app updater. Letting
an agent raise the version could stop sync on an unattended Mac.

The server runs writes one at a time. Each write replaces the whole snapshot, just as a Mac's write
does. This cost is acceptable for one person's data, for the same reason given in ADR 0003. A larger
data size will need a new decision based on measurements.

Agents require a Daily Sync Server. They are not available with iCloud or without sync.
