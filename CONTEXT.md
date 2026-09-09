# Daily

A local-first macOS task manager. SQLite is the source of truth on each Mac; sync is optional and
carries the same data between Macs through one chosen provider. This glossary covers the words that
mean something particular here, and would be read wrongly if taken in their everyday sense.

## Language

### Sync

**Provider**:
The one place a Mac syncs through: off, iCloud, or a self-hosted Daily Sync Server. A Mac has
exactly one, and moving between them is a migration rather than a settings change.
_Avoid_: remote, backend, target

**Daily Sync Server**:
A server the person runs themselves, shipped as a Docker image, that stores one snapshot and the
attachment bytes for the Macs bound to it. It originates nothing and resolves no conflict.
_Avoid_: sync service, backend, cloud

**Claim**:
The one-time act of taking ownership of a freshly deployed server, using the six-digit code its
console prints. A server is claimed exactly once and by exactly one device.
_Avoid_: setup, activation, registration

**Binding**:
The relationship between one Mac and one server, held as a device credential that Mac stores
locally. Binding is what makes a Mac a member; it is separate from whether that server is currently
the active provider.
_Avoid_: connection, pairing, link

**Enrollment**:
The process by which a Mac that is not yet bound asks to become bound, and is granted or refused.
Distinct from Claim, which only ever applies to the first device.
_Avoid_: registration, onboarding, join

### Membership

**Parent**:
The device that claimed the server. The only device that may approve enrollments and revoke other
devices; there is exactly one at a time, and the server console can move the role.
_Avoid_: owner, admin, primary, main device

**Child**:
Any device that became bound through the Parent's approval. It syncs and nothing more: it cannot
approve an enrollment or revoke anything, including itself.
_Avoid_: secondary, peer, member, client

**Enrollment window**:
The interval, opened deliberately by the Parent, during which the server accepts enrollment
requests at all. Outside it there is nothing to occupy and nothing to approve.
_Avoid_: pairing mode, invite window, open enrollment

**Revocation**:
Withdrawing a device's credential. The device's record stays, marked with the moment it happened,
so a revoked credential stays distinguishable from one that was never issued.
_Avoid_: deletion, removal, unbinding

### Compatibility

**Protocol version**:
The number that says which wire contract a Daily app and a Daily Sync Server speak. It moves only
when the wire changes, so a release that alters the app's appearance leaves it alone.
_Avoid_: API version, app version, release

**Protocol mismatch**:
The state a bound Mac enters when its protocol version differs from its server's. Sync stops rather
than guessing at partial compatibility, and the Mac says which side is behind and what to run.
_Avoid_: incompatible, out of date, version error

**Rolling protocol tag**:
The `p<N>` image tag naming the protocol a server image speaks, derived from the source rather than
typed. A self-hoster's compose file pins one, so the image under a running server never changes
underneath it; `daily.sh upgrade` is the only thing that moves the pin, reading the tag the current
release wants out of the installer it downloads. A self-hoster never types it or edits it.
_Avoid_: latest, version tag, release tag
