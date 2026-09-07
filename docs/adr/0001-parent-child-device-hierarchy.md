# Devices bound to a Daily Sync Server are a hierarchy, not peers

The enrollment protocol was built on device equality — `enroll.ts` still carries the comment "any
bound device reads the one waiting request; no device is privileged over another" — so any bound Mac
could approve a newcomer, and revocation existed only on the server console. We are replacing that
with a hierarchy: the device that claimed the server is the Parent and alone may approve enrollments
and revoke devices, and every other device is a Child that syncs and nothing else.

## Considered Options

**Keep device equality.** Any bound Mac approves and revokes. Simplest, and already built. Rejected
because it means any Child can lock the owner out of their own server: a single compromised or
borrowed Mac could revoke every other device, and recovery would need console access to the host.

**Introduce a separate owner role, held by a person rather than a device.** Rejected as a larger
model than the problem: there are no accounts here and no identity beyond the device credential, so
an owner would have to be invented before it could be used.

**Hierarchy anchored on the claiming device.** Chosen. The server is already claimed exactly once,
which makes the anchor a fact the system records rather than a new concept, and it matches how these
servers are actually run — one person's Macs, one of which is the one they administer from.

## Consequences

Membership is not self-service. A Child cannot add a Mac while the Parent is asleep, away, or lost,
so adding a device is now something that happens at the Parent.

Recovery moves to the console, and needs a verb the console did not have: `device promote <id>`,
for when the Parent is gone and the Children remain. Without it a server with a lost Parent can
neither gain a device nor lose one, and the console is the only authority left that can act.

Who claimed the server has to be recorded explicitly. It is not stored today, and deriving the
Parent as "the oldest device" would silently reassign the role the first time a Parent is revoked
and re-enrolled.

The enrollment window follows from this: since only the Parent approves, the Parent can also be the
one who decides when the server accepts requests at all. That closes the unauthenticated hold on the
single enrollment slot, and removes the case where an unexpected request is waiting when someone
opens the approval dialog.
