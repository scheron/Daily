# Devices on a Daily Sync Server have Parent and Child roles

The enrollment protocol originally gave all connected devices equal rights. The comment in
`enroll.ts` still says "any bound device reads the one waiting request; no device is privileged over
another". Any connected Mac could approve a new device. Only the server console could revoke devices.

We replace this with two roles. The device that first claimed the server is the Parent. Only the
Parent can approve new devices and revoke devices. Every other device is a Child and can only sync.

## Options considered

**Keep equal rights for devices.** Any connected Mac can approve and revoke devices. This is the
simplest option and already exists. We rejected it because a Child could lock the owner out of their
server. One compromised or borrowed Mac could revoke all other devices. Recovery would need console
access to the server host.

**Give a person a separate owner role.** We rejected this because Daily has no accounts. It identifies
devices only by their credentials. We would need to add a user identity before we could use an owner
role.

**Give the Parent role to the device that claimed the server.** We chose this option. A server is
claimed exactly once, so the system already has a clear event to record. It also matches normal use:
one person has several Macs and manages the server from one of them.

## Consequences

A Child cannot add a Mac while the Parent is asleep, away, or lost. Adding a device requires the Parent.

The console needs a new command for recovery: `device promote <id>`. It promotes a Child when the
Parent is lost. Without this command, the server cannot add or remove devices after losing its
Parent. Only the console can restore access in that case.

The server must record which device claimed it. It does not store this fact yet. Choosing the oldest
device would silently change the Parent after the original Parent is revoked and enrolled again.

Only the Parent approves devices, so it can also control when the server accepts enrollment requests.
This prevents an unauthenticated request from holding the single enrollment slot. It also prevents an
unexpected request from waiting when someone opens the approval dialog.
