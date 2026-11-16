# Connecting an agent

How an MCP client gets access to a Daily server: client identification, registration and approval on a Mac.

### registration-needs-window — Dynamic registration issues a client ID only while a Mac's Agent window is open, and creates no approval, grant or token

Why: the address is public, and only a Mac approval with a matching code grants access ([ADR 0005](../adr/0005-agent-access-approved-on-a-mac.md))

- Post to `/oauth/register` with no Agent window open → `403`. Open the window on a Mac and post again → a client ID, and no new agent appears in the agent list.

### registration-limits — Registration allows 8 new clients per window, 32 per minute across the server and 1,024 stored; an unused ID expires after 24 hours, and repeating a registration returns the same ID

Why: the endpoint faces the internet and must not be able to fill the database ([ADR 0005](../adr/0005-agent-access-approved-on-a-mac.md))

- Register a ninth distinct client in one window → `429`, which says to open a new window. Repeat a registration that was already accepted → the same client ID.
- Register a 33rd distinct client within one minute across windows → `429` with `Retry-After`.
- Leave a registered client ID unused for 24 hours → it stops working. Register again in an open window → a new ID.

### approval-shows-destination — The Mac's approval card shows the code, the name the agent supplied and where the browser returns; a callback to a local program carries a warning

Why: the agent declares its own name, so the destination is the only way to spot an impostor

- An agent with a callback to a local program asks for access → the Mac's card shows the code, the name the agent supplied, the return host and a warning about local programs. A website callback → no such warning.
