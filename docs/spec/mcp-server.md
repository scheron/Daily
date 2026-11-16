# MCP on the server

The server's MCP endpoint: how agents' tool calls run and are recorded.

### search-isolated — A searched MCP read runs in a separate process, so OAuth and sync keep answering while it runs

Why: a heavy search blocked the whole server

- While an agent's search runs, another client completes an OAuth step and a Mac syncs → both get answers without waiting for the search.

### search-bounded — A search has 5 seconds including its time in the queue, with at most 2 waiting per agent and 8 in total; cancellation or a dropped connection stops its process at once

Why: one agent must not hold the CPU or memory of a small server

- An agent cancels a search, or its connection drops → the search's process stops, and the next queued search starts.
- A search waits in the queue and runs past five seconds in total → it ends with a timeout error, and the server keeps serving later searches.
- An agent with two searches waiting sends a third, or eight searches are waiting across agents → the new search is refused as overloaded.

### journal — Every authenticated tool call writes a start and an end record to the data volume, without task content, search text or credentials; a failing journal never stops MCP or sync

Why: failed calls can be diagnosed after a restart without exposing data

- An agent calls a tool → the journal on the data volume holds a start and an end record with the same ID, the tool name, the result code and the times, and no task text, search text or tokens.
- The journal folder is not writable → the server logs one warning and keeps serving MCP and sync.
