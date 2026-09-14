# The renderer reads tasks one way, and every view is a selector

Daily is a desktop app over a local SQLite file, so a person expects it to answer instantly; the one
place a wait is acceptable is the splash screen. We had been letting the renderer order data in the
shape it wanted to draw — a day, a backlog, one milestone's tasks — which made every change of view
and every write a new order. We are replacing that with one read: the renderer loads every live task
at startup and holds it, and a day, a milestone, the backlog, a tag, a status or anything drawn
later is a **selector over that collection**.

The rule that follows, and the reason this is written down: **an endpoint that takes a criterion for
selecting tasks is a new loading axis.** A new way to look at the work is a new selector, never a new
endpoint. Reading tasks by milestone, by tag or by status would each be the same 458 rows arriving
again in a different arrangement, and the app already has them.

## Considered Options

**Keep fetching per view, and make it faster.** Cache by selection key, debounce, batch. This is what
was there, and one stopgap of exactly this kind had already landed. Rejected because it treats the
symptom: caching hides the cost of _switching_ while leaving the cost of _writing_, and every such fix
adds a place where the cache and the database can disagree.

**Keep a lazy window of dates and page it.** The design that existed: a ±6 month range with edge
buffers, extended as the person scrolls. Rejected because it protects against a cost that does not
exist — the production database is 458 live tasks in 1.6 MB — and pays for that protection with a
whole class of "is this loaded yet" state, which is where the loading flags and the empty boards came
from.

**Move the aggregation into the renderer but keep the shaped endpoints beside it.** Rejected because
it leaves two sources of the same fact. A milestone's progress computed in SQL and the same progress
computed from memory will eventually disagree, and they will disagree silently.

## Consequences

`tasks:get-many` keeps its `{from, to, limit, branchId}` parameters and the renderer never passes
them. This looks like dead configuration and is not: the AI agent runs in the main process, calls
`StorageController` directly, and wants slices — it should not pull the whole table to answer a
question about one day. A capability is not removed because one of its consumers stopped using it.

The splash screen becomes a real readiness gate rather than a timer, because there is now a moment
that is genuinely "loaded", and the window has no reason to appear before it.

A write reports what it changed instead of inviting a reread, and the renderer predicts that report
locally before it arrives. That is what makes a write feel instant, and it is only possible because
the renderer holds enough data to predict with.

Memory use grows with the size of the database rather than with what is on screen. There is a size at
which this stops being the right answer. Reaching it is a new decision with a measurement in front of
it — not a reason to reintroduce a window quietly, and not something to pre-empt now.
