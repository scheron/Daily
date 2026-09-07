---
status: accepted
date: 2026-09-04
---

# Absence of a schedule is modelled by nulling the whole `scheduled` object

Daily is day-first: `Task.scheduled` has always been a required `{date, time, timezone}`, backed by three `NOT NULL` columns. Introducing a backlog — tasks that have no day yet — needs a way to say "no schedule", and the decision is to make the **whole object nullable** (`scheduled: {…} | null`) rather than only its date. A time and a timezone without a date carry no meaning, and leaving them populated lets a call site read `scheduled.time`, see a structurally intact object, and silently do the wrong thing; nulling the object makes the compiler enumerate every site that reads `task.scheduled.date`, which is precisely the audit this change needs.

## Considered options

**`scheduled.date: ISODate | null`, time and timezone still required.** Rejected. It leaves two orphan fields whose values mean nothing, and it fails silently rather than loudly — code guarding on the presence of `scheduled` instead of `scheduled.date` still compiles and still misbehaves. The migration cost is identical either way: SQLite cannot drop `NOT NULL` through `ALTER`, so the table is rebuilt whether one column changes or three.

**Keep `scheduled` required and mark backlog tasks with a flag or a sentinel date.** Rejected. It states one fact in two places, and under last-write-wins sync the two will eventually disagree with no way to say which is right.

## Consequences

- The type crosses the process boundary, so main, renderer, CLI and the agent each handle the absent case explicitly. There is no layer left where a task may be assumed to have a day.
- It matches how absence is already expressed here — `deletedAt: ISODateTime | null` rather than a boolean — so the codebase keeps one idiom for "not set".
- The change is one-time and wide: every read of `task.scheduled.date` has to be decided rather than defaulted. That cost is the point, not a side effect.

If you are here because you want to "just make the date nullable", this is the decision you are reopening.
