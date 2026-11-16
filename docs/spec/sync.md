# Sync

How the app and a sync provider exchange snapshots, and what survives slow or broken connections.

### edits-survive-transfer — An edit made during a snapshot transfer, a migration upload or a retry pause is kept and sent in a later cycle

Why: such edits were lost

- Edit a task while a snapshot download, a migration upload or a retry pause is running → after the next cycle the server holds the edit, and the edit is still on the Mac.

### lost-reply-merges-first — When a write's reply is lost, the app reads and merges the server's current revision before it writes again

Why: the write may have already gone through, and writing it again blindly would overwrite another device's change

- A write reaches the server but its reply is lost → the app reads and merges the server's current revision before it writes again, and another device's change in that revision survives.

### slow-transfer — A snapshot transfer fails only after 30 seconds with no data or 15 minutes in total, in the app and on the server; the server takes 2 uploads at a time and asks others to retry

Why: large snapshots over slow connections timed out at 30 seconds and never synced

- A snapshot download or upload keeps delivering bytes slowly for longer than 30 seconds → it continues. After 30 seconds with no data, or 15 minutes in total → it ends, and nothing is committed.
- A third upload arrives while two are running → the server asks it to retry. After a sender disconnects → a new upload is accepted.

### upload-rechecked — Before it commits an upload, the server checks the device credential and the expected revision again

Why: during a long upload the device can be revoked, or another device can commit first

- A Mac is revoked while its upload is still arriving → the server does not commit the snapshot.
- Another device commits while an upload is still arriving → the server refuses the stale upload, and the revision stays the other device's.
