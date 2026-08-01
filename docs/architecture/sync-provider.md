# Primary sync provider

**Status:** Accepted

## Decision

A Daily profile has exactly one active synchronization provider:

- iCloud Drive; or
- a self-hosted backend compatible with the versioned Daily Sync Protocol.

Local SQLite remains the authoritative working database on each device. The selected provider is the canonical shared synchronization authority between devices.

## Provider responsibilities

Daily commits every user change to local SQLite before any network operation. The application remains fully usable when the provider is unavailable.

During synchronization, Daily:

1. reads the provider's current revision;
2. merges the remote state with local state on the client;
3. writes the merged state conditionally against that revision;
4. re-reads, merges, and retries when another device has advanced the revision.

A self-hosted backend provides authenticated, isolated storage for snapshots and assets, revision-aware conditional writes, and health/diagnostic endpoints. It does not become Daily's application database and does not own task business logic or conflict resolution.

## Backend compatibility

A self-hosted backend must implement the Daily Sync Protocol. Daily will provide an official server implementation and a Daily Server SDK for compatible implementations. The SDK is an implementation aid; protocol compatibility is the product contract.

The user-facing provider name is **Self-hosted Daily Sync Server** or **Custom Sync Server**, not "backend with SDK".

## Invariants

- A profile must not have iCloud and a custom backend active for bidirectional synchronization at the same time.
- Additional remote locations may be implemented only as explicitly one-way backup or export targets. They must not independently participate in pull/merge/push.
- Remote connection configuration, credentials, and local paths remain device-local and are excluded from synchronized snapshots.
- A provider written by a newer protocol or snapshot version must not be overwritten by an older client.
- Provider failure must preserve local data and report an actionable sync status; it must not block normal local work.

## Provider migration

Changing the active provider is a controlled migration, not a settings toggle.

1. Verify the new provider's endpoint, authentication, protocol version, and writable namespace.
2. Inspect the local state and any existing state at the new provider.
3. Require an explicit migration direction: publish the current synchronized state to the new provider, adopt the existing provider state, or cancel.
4. Perform the required client-side merge and establish a confirmed revision at the new provider.
5. Mark the new provider active only after confirmation, then deactivate the old provider.

Daily must never enable two bidirectional providers during migration.

## Non-goals

- Replacing local SQLite with a central online-only application database.
- Sending ordinary task reads and writes to the server before local persistence.
- Supporting arbitrary unversioned HTTP endpoints.
- Treating several independently writable remotes as equal synchronization authorities.
