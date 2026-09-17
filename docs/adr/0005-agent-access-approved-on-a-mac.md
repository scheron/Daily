# Agent access is OAuth, approved on a bound Mac inside an Agent window

MCP clients connect to a remote server through OAuth, and the Claude app on a phone connects in no
other way. Daily has no accounts and no passwords, so the page where access is granted needs some
other proof that the person granting it owns the server. We decided on OAuth as the MCP
specification describes it, with clients identified only through Client ID Metadata Documents, and
consent given on a bound Mac: any Mac, not only the Parent, opens an Agent window, a request that
arrives while it is open shows the same code on the browser page and on that Mac alone, and the
agent approved there belongs to that Mac. With no window open, the server refuses to start the
request at all.

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

**Dynamic Client Registration beside CIMD.** Rejected for now: it opens a registration endpoint to
the internet, with a table, rate limits and clean-up behind it, for clients nobody here uses. Claude
on every surface and Codex both support CIMD.

## Consequences

Connecting an agent needs a Mac with Daily open at that moment, including when the agent is the
Claude app on a phone.

The Daily Sync Protocol moves to version 4, to carry the window, the waiting request and its
decision, listing and revoking agents, and the probe's signal that a request is waiting.

ADR 0001's Child, a device that "syncs and nothing else", widens by exactly this: a Child connects
and revokes its own agents. Approving and revoking devices stay with the Parent, which may also
revoke any device's agents. Revoking a device revokes its agents.

Agents exist only on a server with a trusted certificate. claude.ai and the phone reach the server
from Anthropic's network and reject a self-signed one, so an install made by IP explains that agents
need a domain rather than half-working. Loopback is the single exception, as OAuth allows, so the
whole flow can run against a local server in tests.

An agent lives until it is revoked. Its refresh token rotates on every use, and presenting one that
was already used revokes the agent outright; its last use is shown next to it so a forgotten one can
be found.

The Mac's card names where the agent will return. For a program on a computer rather than a website
it warns that any local program can claim to be Claude Code, because a metadata document cannot tell
the real one from an impostor on the same machine.
