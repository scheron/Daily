# The renderer loads tasks once and filters them for each view

Daily uses a local SQLite file. Users expect an instant response after the splash screen. The
renderer used to request tasks separately for each view: a day, the backlog, or a milestone. Every
view change and write triggered another request.

We replace these requests with one read at startup. The renderer loads all tasks that are not
deleted and keeps them in memory. Each view uses a **selector**, a function that filters or groups
that collection. Days, milestones, the backlog, tags, statuses, and future views all use selectors.

**A new task filter belongs in a selector, not a new renderer endpoint.** Endpoints for milestones,
tags, or statuses would send the same 458 rows again. The renderer already has those rows.

## Options considered

**Keep fetching for each view and make it faster.** We could cache each selection, debounce requests,
or batch them. One temporary fix of this kind already existed. We rejected it because caching only
hides the cost of switching views. Writes still need new reads. Each cache also adds a place where
memory and the database can disagree.

**Load a range of dates and extend it as needed.** The old design loaded a ±6 month range with extra
dates at each edge. Scrolling extended that range. We rejected it because the production database
has only 458 live tasks in 1.6 MB. The range adds unnecessary state to track what is loaded. That
state caused loading flags and empty boards.

**Calculate view data in the renderer but keep filtered endpoints too.** We rejected this because
it creates two ways to calculate the same fact. Milestone progress calculated in SQL could silently
differ from progress calculated in memory.

## Consequences

The renderer loads tasks through `tasks:get-all`. `WorkStorage` still provides filtered reads for
the Assistant and MCP tools. These callers can answer questions about a day or project without
loading the whole table.

The splash screen waits until the data is ready. It no longer uses a timer. The window appears
after loading finishes.

A write reports its changes instead of asking the renderer to read again. The renderer predicts
these changes locally before the response arrives. Its complete collection lets writes appear
immediately.

Memory use grows with the database size. At some measured size, this approach will need a new
decision. We do not add a loading range before that need exists.
