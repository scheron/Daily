# Agent access is OAuth, approved on a bound Mac inside an Agent window

MCP clients connect to a remote server through OAuth, and the Claude app on a phone connects in no
other way. Daily has no accounts and no passwords, so the page where access is granted needs some
other proof that the person granting it owns the server. We decided on OAuth as the MCP
specification describes it. Daily advertises both Client ID Metadata Documents (CIMD) and Dynamic
Client Registration (DCR). A public client presents a validated hosted document or an opaque ID
issued by this server. Either path asks a bound Mac for consent. Any bound Mac can open an Agent
window. A request accepted within that window shows the same code on the browser page and on the
Mac that opened it. The approved agent belongs to that Mac.

## Considered Options

**Bearer tokens issued from the server console or the app.** Simplest to build. Rejected because the
phone cannot use them, so they would be a stage built to be replaced by OAuth.

**A server password on the consent page.** Works from anywhere, with no Mac at hand. Rejected
because it is a new secret on a server that faces the internet — with brute-force protection and
recovery to build around it — and it introduces the account that Daily deliberately does not have.

**Passkeys.** Also work from anywhere, and resist phishing. Not chosen now because WebAuthn
registration and recovery are a subsystem of their own; they can be added later as a second way to
approve without changing this one.

**Approval cards that arrive unasked on every Mac online.** One step fewer than opening a window
first. Rejected because the server's address is public and clients like claude.ai are shared: anyone
can start connecting _their own_ account to this server and wait for a habitual Approve. The code
does not protect against that, since only the person who started the request sees the page it is
printed on. The window means a card only ever answers something its Mac just asked for — the answer
the Enrollment window already gives for devices.

**Approval by the Parent only.** Rejected because an agent is connected on the computer where it
runs, as it is with Linear, and a person should not have to walk to the Parent to connect Claude Code
on another Mac.

**CIMD alone.** Hosted metadata serves clients that publish a document. DCR also serves public
clients that expect an issuer to assign their ID, including desktop clients with loopback
callbacks. Daily limits DCR to a window opened by a bound Mac and stores registrations with a
server-wide rate limit, a capacity limit and cleanup for abandoned IDs.

## Consequences

Connecting an agent needs a Mac with Daily open at that moment, including when the agent is the
Claude app on a phone.

Discovery remains available while the Agent window is closed. Registration and new authorization
require the same open window at request start and at the database write. The server gives each
window a five-minute lease. Cancel and approval close it. Opening another window replaces it and
denies any pending approval. Each authorization accepts a declared HTTPS or HTTP loopback callback
and requires PKCE S256. A native client may vary the port of a declared HTTP loopback callback.
For dynamic registrations, the rest of the URI must match as written.
The resulting authorization code is bound to the selected callback, client and resource, and a
registered client supplies that exact callback at exchange.

A registration contains public metadata and creates no approval request, grant or token.
`POST /oauth/register` accepts up to 8 KiB of JSON within ten seconds. A client can declare
one to eight HTTPS or HTTP loopback callbacks, each at most 2,048 characters.

Each window allows eight new registrations. Retrying the same name and callback list in the same
window returns the issued ID without taking another slot. The server accepts 32 new
registrations per rolling minute across all windows. That limit returns `429` with
`Retry-After`. Reaching the per-window quota returns `429` and directs the client to open a
new window.

Capacity is 1,024 registrations per database. An unused registration stops resolving after
24 hours and the next new registration attempt reclaims its slot. An approval request protects
the registration through the request deadline while it is pending or approved and waiting for a
code. An issued code protects the registration through its own deadline. An exchanged grant
protects it until revocation. Registration returns `503` when capacity remains full after cleanup.
A client whose ID has expired or belongs to a different issuer registers again in an open window.

Approval survives closure of the window. Clients can exchange codes, refresh tokens and call MCP
while the window is closed.

The Daily Sync Protocol moves to version 4, to carry the window, the waiting request and its
decision, listing and revoking agents, and the probe's signal that a request is waiting.

ADR 0001's Child, a device that "syncs and nothing else", widens by exactly this: a Child connects
and revokes its own agents. Approving and revoking devices stay with the Parent, which may also
revoke any device's agents. Revoking a device revokes its agents.

Agents exist only on a server with a trusted certificate. claude.ai and the phone reach the server
from Anthropic's network and reject a self-signed one, so an install made by IP explains that agents
need a domain rather than half-working. Loopback is the single exception, as OAuth allows, so the
whole flow can run against a local server in tests.

An agent lives until it is revoked. Its refresh token rotates on every use. Replay within the same
resource and client binding revokes the agent. The agent list shows when each agent was last used.

The Mac and browser identify the name as supplied by the agent. The Mac also shows the return
host and flags a callback to a program on the browser's computer. The person approving compares
the code on the Mac with the code in the browser.
