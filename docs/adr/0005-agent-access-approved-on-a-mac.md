# Agent access uses OAuth and approval in a Mac's Agent window

MCP clients use OAuth to connect to remote servers. The Claude app on a phone supports no other
method. Daily has no accounts or passwords. The approval flow needs another way to prove that the
person granting access owns the server.

We use OAuth as the MCP specification defines it. Daily supports two ways to identify clients:
Client ID Metadata Documents (CIMD) and Dynamic Client Registration (DCR). A public client presents
a validated hosted document or an opaque ID that this server issued. Both paths ask a Mac connected
to the server for approval in its Agent window. Any Mac can do this, including a Child.

The window must be open before a request arrives. The browser and that Mac alone show the same code.
The approved agent belongs to that Mac. If no Agent window is open, the server refuses to start
registration or authorization.

## Options considered

**Issue bearer tokens from the console or app.** This is the simplest option to build. We rejected
it because the phone cannot use these tokens. We would need to replace it with OAuth later.

**Ask for a server password on the approval page.** This works anywhere without a Mac nearby. We
rejected it because it adds an internet-facing secret. We would need protection against repeated
password guesses and a recovery process. It also adds the account model that Daily avoids.

**Use passkeys.** These also work anywhere and resist phishing. We did not choose them now because
WebAuthn registration and recovery need a separate system. Passkeys can become another approval
method later without changing this one.

**Send approval cards to every online Mac without opening a window first.** This saves one step.
We rejected it because the server address is public and clients such as claude.ai serve many users.
Anyone could start connecting their own account and wait for someone to approve without checking.

A code alone does not prevent this. Only the person who started the request sees its browser page.
The window limits approval cards to requests expected after someone opens that Mac's Agent window.
The Enrollment window already uses this approach for devices.

**Allow only the Parent to approve agents.** We rejected this because people connect an agent on
the computer where it runs, as with Linear. Connecting Claude Code on another Mac should not require
a visit to the Parent.

**Support CIMD alone.** Hosted metadata serves clients that publish a document. DCR also serves
public clients that expect the server to assign their ID, including desktop clients with loopback
callbacks. Daily allows DCR only inside a window that a connected Mac opened. It stores
registrations with a server-wide rate limit, a capacity limit, and cleanup for abandoned IDs.

## Consequences

Connecting an agent requires a Mac with Daily open at that time. This includes the Claude app on a
phone.

Discovery stays available while the Agent window is closed. Registration and new authorization
require the same open window when the request starts and when the database write happens. The
server gives each window a five-minute lease. Cancel and approval close it. Opening another window
replaces it and denies any pending approval. Each authorization accepts a declared HTTPS or HTTP
loopback callback and requires PKCE S256. A native client may change the port of a declared HTTP
loopback callback. For dynamic registrations, the rest of the URI must match exactly. The resulting
authorization code is bound to the selected callback, client, and resource. A registered client
supplies that exact callback at exchange.

A registration contains public metadata. It creates no approval request, grant, or token.
`POST /oauth/register` accepts up to 8 KiB of JSON within ten seconds. A client can declare one to
eight HTTPS or HTTP loopback callbacks, each at most 2,048 characters.

Each window allows eight new registrations. Retrying the same name and callback list in the same
window returns the issued ID and does not use another slot. The server accepts 32 new registrations
per rolling minute across all windows. That limit returns `429` with `Retry-After`. Reaching the
per-window limit returns `429` and tells the client to open a new window.

Capacity is 1,024 registrations per database. An unused registration stops working after 24 hours,
and the next new registration attempt reclaims its slot. A pending approval request, or an approved
one still waiting for a code, protects the registration until the request deadline. An issued code
protects the registration until its own deadline. An exchanged grant protects it until revocation.
Registration returns `503` when capacity is still full after cleanup. A client whose ID has expired
or belongs to a different issuer registers again in an open window.

Approval stays valid after the window closes. Clients can exchange codes, refresh tokens, and call
MCP while the window is closed.

The Daily Sync Protocol moves to version 4. It carries the Agent window state, pending request,
approval decision, agent lists, and revocation requests. It also lets the probe report a waiting
request.

ADR 0001 described a Child as a device that "syncs and nothing else". This decision also lets a Child
connect and revoke its own agents. Only the Parent approves and revokes devices. The Parent can also
revoke any device's agents. Revoking a device revokes its agents.

Agents require a server with a trusted certificate. claude.ai and the phone connect from Anthropic's
network and reject self-signed certificates. A server installed by IP address explains that agents
need a domain. Loopback is the only exception, as OAuth allows. Tests can therefore run the full
flow on a local server.

An agent keeps access until it is revoked. Its refresh token changes after each use. Reusing an old
refresh token with the same resource and client revokes the agent. The agent list shows each
agent's last use so people can find forgotten connections.

The Mac and the browser show the name that the agent supplies. The Mac also shows the host where the
agent will return and marks a callback to a program on the browser's computer. The person approving
compares the code on the Mac with the code in the browser.
