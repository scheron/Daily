# Primary sync provider

**Status:** Accepted

## Decision

A Daily workspace has exactly one active bidirectional synchronization provider:

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

## Provider binding and device settings

The provider binding is shared workspace topology. It contains the provider kind, stable server identity, workspace identifier, public endpoint and identity-provider metadata. Changing the binding is a controlled provider migration.

A new device reads this binding and must connect to the same provider. It verifies the pinned server identity before sign-in; an endpoint or identity change requires an explicit migration or trust-confirmation flow, never a silent redirect.

Each installation keeps `LocalSyncSettings` strictly device-local. It contains access and refresh tokens, the device identifier and private key material, local paths, and transient connection state. It is excluded from snapshots and is never copied to another device.

## Workspace and device authorization

Initial server claim creates the server owner, the workspace, and its provider binding. A claim code proves control of an unclaimed server only; it is not a reusable login credential.

When another device joins, Daily opens the connection wizard for the shared provider binding. The user signs in on that device and the server authorizes the connection only when the authenticated account is a member of the specified workspace.

After initial claim, attaching another personal device must not require server-console access or a claim code. Browser authentication and workspace membership are sufficient; console bootstrap is reserved for an unclaimed server and explicit administrative recovery.

The server creates a separate device record for every successful connection. Device membership is determined by the stable server identity, workspace identifier, authenticated account membership, and device record—not by copying credentials or sharing a device key.

A provider or workspace mismatch blocks bidirectional synchronization and reports a connection or migration action. This prevents iCloud and a custom backend from becoming independent writable authorities for the same workspace.

## Backend compatibility

A self-hosted backend must implement the Daily Sync Protocol. Daily will provide an official server implementation and a Daily Server SDK for compatible implementations. The SDK is an implementation aid; protocol compatibility is the product contract.

The user-facing provider name is **Self-hosted Daily Sync Server** or **Custom Sync Server**, not "backend with SDK".

## Installation and connection

The official Daily Sync Server must provide a guided first-run setup. A normal user must be able to deploy and claim a personal server without implementing storage, synchronization, or authentication.

The setup flow must validate persistent storage, server secrets, public URL and HTTPS or private-network binding, initial workspace ownership, and backup configuration. It must report actionable failures rather than leave a partially configured server online.

Daily Desktop must provide a connection wizard: enter or discover the server URL, verify server identity and protocol compatibility, open browser sign-in, select a workspace, test read/write access, and show the connected device and sync status.

## Authentication profile

Authentication is part of the protocol, not a backend-specific convenience.

- Desktop uses OAuth Authorization Code Flow with PKCE in the system browser; embedded webviews are not used for sign-in.
- CLI and headless environments use OAuth Device Authorization Grant.
- The official embedded identity mode uses WebAuthn passkeys as the primary sign-in method and provides secure recovery and device revocation.
- A server may delegate identity to an external OpenID Connect provider for advanced or organizational deployments.
- API access uses short-lived bearer access tokens, refresh-token rotation, explicit scopes, and token revocation.
- Tokens and private device credentials remain only in `LocalSyncSettings` and are excluded from synchronized snapshots.

## Invariants

- A workspace must not have iCloud and a custom backend active for bidirectional synchronization at the same time.
- Additional remote locations may be implemented only as explicitly one-way backup or export targets. They must not independently participate in pull/merge/push.
- A provider written by a newer protocol or snapshot version must not be overwritten by an older client.
- Provider failure must preserve local data and report an actionable sync status; it must not block normal local work.

## Provider migration

Changing the active provider is a controlled migration, not a settings toggle.

1. Verify the new provider's endpoint, server identity, authentication, protocol version, and writable namespace.
2. Inspect the local state and any existing state at the new provider.
3. Require an explicit migration direction: publish the current synchronized state to the new provider, adopt the existing provider state, or cancel.
4. Perform the required client-side merge and establish a confirmed revision at the new provider.
5. Update the shared provider binding only after confirmation, then deactivate the old provider on every connected device.

Daily must never enable two bidirectional providers during migration.

## Non-goals

- Replacing local SQLite with a central online-only application database.
- Sending ordinary task reads and writes to the server before local persistence.
- Supporting arbitrary unversioned HTTP endpoints.
- Treating several independently writable remotes as equal synchronization authorities.
