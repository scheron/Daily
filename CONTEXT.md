# Daily

A local-first macOS task manager. SQLite is the source of truth on each Mac; sync is optional and
carries the same data between Macs through one chosen provider. This glossary covers the words that
mean something particular here, and would be read wrongly if taken in their everyday sense.

## Language

### Work

**Project**:
The scope a task belongs to. Every task is in exactly one, `main` always exists, and a tag or a
milestone belongs to one project and never spans two.
_Avoid_: branch, workspace, board, list

**No Project**:
Where a task is when nobody put it in a project of their own. It is the project stored as `main`,
and agents still see it under that id and the name "Main"; the app never shows that name. It is not
All projects, which is a view across every project, this one included.
_Avoid_: Main, default project, inbox

**Backlog**:
Work that has no day and has not been marked ready for an agent. Backlog is a task status; the
Backlog column in Normal also includes Ready for Agent tasks, which may have a day.
_Avoid_: inbox, someday, unscheduled, icebox

**To Do**:
Work planned for a scheduled day whose execution has not started. Scheduling Backlog makes it
To Do; clearing its day returns it to Backlog. Moving it to another day keeps it To Do.
_Avoid_: In Progress, Active, started

**Ready for Agent**:
Work prepared and available for an agent to take. It may have a scheduled day or remain in the
general ready queue without one; readiness does not start an agent.
_Avoid_: assigned, running, In Progress

**In Progress**:
Work actually started on a scheduled day. Planning or assigning a day does not start execution. It remains outstanding until it is done or cancelled.
_Avoid_: Active, running agent

**Ready to Merge**:
Work whose implementation is ready for review and merging. It remains outstanding and keeps its
scheduled day until it is done or cancelled.
_Avoid_: Done, merged, resolved

**Cancelled**:
A task deliberately dropped without being done. It is a way of finishing with a task, not a way of
deleting one — a cancelled task is still there and still counts toward its milestone.
_Avoid_: Discarded, Canceled, dropped, rejected, deleted

**Resolved**:
Done or cancelled, taken together — the two ways a task stops being outstanding. The word exists
because progress counts them as one.
_Avoid_: completed, finished, closed

**Priority**:
How urgent a task is, one of five levels: No priority, Urgent, High, Medium, Low. Every task has
one, and No priority is a level in its own right rather than the lack of one — a new task starts
there. It marks a task and nothing more: the order tasks sit in stays the person's own.
_Avoid_: importance, severity, urgency, rank

**Subtask**:
A checkbox with its own markdown, inside one task and nowhere else. It takes everything else — day,
status, project, milestone, tags, priority — from its parent, never appears on the board, and has no
comments or history of its own. A subtask that needs any of that is made into a task.
_Avoid_: child task, checklist item, sub-issue

**Milestone**:
A named, bounded batch of work inside one project, with an optional target date. Its scope is a
decision someone made, which is what makes a proportion of it mean anything.
_Avoid_: epic, sprint, release, label, tag

**Closed**:
Of a milestone: having no outstanding task left, including To Do and either ready stage. It is derived from
the milestone's tasks every time it is asked for, never stored and never set by hand.
_Avoid_: done, completed, finished, archived

**Target date**:
The day a milestone is meant to be finished by. Optional, and a different kind of fact from the day
a task is scheduled for — a milestone can pass it and stay open.
_Avoid_: deadline, due date, end date

**Frame**:
What the board is organising by right now — a day, or a milestone. It is a property of the view and
never of a task, and whichever dimension is not the frame moves onto the card.
_Avoid_: mode, view, filter, grouping

**Board mode**:
The global choice between Normal and Agents, independent of the frame or project. Agents shows all
seven statuses; Normal groups Ready for Agent into Backlog and Ready to Merge into In Progress,
preserving each task's actual status and day.
_Avoid_: project workflow, Frame, agent assignment

### Focus

**Focus session**:
A handful of tasks worked through one after another against a timer, with the mode it runs in and
the phase it is at. There is one per app, held by the main process, so every window shows the same
one; the time spent in it lands in each task's spent time, and it ends with the app.
_Avoid_: pomodoro, sprint, timer, focus mode

### Sync

**Provider**:
The one place a Mac syncs through: off, iCloud, or a self-hosted Daily Sync Server. A Mac has
exactly one, and moving between them is a migration rather than a settings change.
_Avoid_: remote, backend, target

**Daily Sync Server**:
A server the person runs themselves, shipped as a Docker image, that stores one snapshot and the
attachment bytes for the Macs bound to it. It resolves no conflict, and the only change it makes is
one an agent asked for, applied on top of the snapshot it holds.
_Avoid_: sync service, backend, cloud

**Claim**:
The one-time act of taking ownership of a freshly deployed server, using the six-digit code its
console prints. A server is claimed exactly once and by exactly one device.
_Avoid_: setup, activation, registration

**Binding**:
The relationship between one Mac and one server, held as a device credential that Mac stores
locally. Binding is what makes a Mac a member; it is separate from whether that server is currently
the active provider.
_Avoid_: connection, pairing, link

**Enrollment**:
The process by which a Mac that is not yet bound asks to become bound, and is granted or refused.
Distinct from Claim, which only ever applies to the first device.
_Avoid_: registration, onboarding, join

### Membership

**Parent**:
The device that claimed the server. The only device that may approve enrollments and revoke other
devices, and may revoke any device's agents; there is exactly one at a time, and the server console
can move the role.
_Avoid_: owner, admin, primary, main device

**Child**:
Any device that became bound through the Parent's approval. It syncs and connects its own agents,
and nothing more: it cannot approve an enrollment, and it revokes only its own agents.
_Avoid_: secondary, peer, member, client

**Enrollment window**:
The interval, opened deliberately by the Parent, during which the server accepts enrollment
requests at all. Outside it there is nothing to occupy and nothing to approve.
_Avoid_: pairing mode, invite window, open enrollment

**Revocation**:
Withdrawing a device's or an agent's access. The record stays, marked with the moment it happened,
so a revoked credential stays distinguishable from one that was never issued.
_Avoid_: deletion, removal, unbinding

### Agents

**Agent**:
An MCP client — Claude Code, the Claude app, Codex — granted access to a server's work through one
bound device, and belonging to that device. It does not sync: it reads and changes the work through
the server. Revoking the device revokes its agents.
_Avoid_: integration, bot, client, connection, app

**Agent window**:
The interval, opened deliberately on one bound device, during which the server accepts an agent's
request for access at all. The request's code appears only on the device that opened it.
_Avoid_: pairing mode, connect mode, invite

**Daily Assistant**:
The AI assistant built into the Daily app. It works on the Mac's own data rather than through a
server, and can do to the work exactly what an agent can.
_Avoid_: agent, AI agent, chat, bot, copilot

### Compatibility

**Protocol version**:
The number that says which wire contract a Daily app and a Daily Sync Server speak. It moves only
when the wire changes, so a release that alters the app's appearance leaves it alone.
_Avoid_: API version, app version, release

**Protocol mismatch**:
The state a bound Mac enters when its protocol version differs from its server's. Sync stops rather
than guessing at partial compatibility, and the Mac says which side is behind and what to run.
_Avoid_: incompatible, out of date, version error

**Rolling protocol tag**:
The `p<N>` image tag naming the protocol a server image speaks, derived from the source rather than
typed. A self-hoster's compose file pins one, so the image under a running server never changes
underneath it; `daily.sh upgrade` is the only thing that moves the pin, reading the tag the current
release wants out of the installer it downloads. A self-hoster never types it or edits it.
_Avoid_: latest, version tag, release tag
