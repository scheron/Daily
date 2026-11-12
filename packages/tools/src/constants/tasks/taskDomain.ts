import {MAX_OBSERVED_WORKFLOW_INTERVAL_SECONDS, TASK_PRIORITIES, TASK_STATUSES} from "@daily/protocol"

import type {TaskStatus} from "@daily/protocol"

export const TASK_DOMAIN = {
  statuses: TASK_STATUSES.map((status) => {
    const meanings: Record<TaskStatus, string> = {
      backlog: "Unscheduled work retained for later.",
      todo: "Planned work, including preparation and noncoding work.",
      ready_for_agent: "Work made available to an agent; its day is optional.",
      in_progress: "Work is underway.",
      ready_to_merge: "Implementation is ready for human review or merge; it remains outstanding.",
      done: "Completed work; agent use requires effective completion permission.",
      cancelled: "Cancelled work; agent use requires effective completion permission.",
    }
    return {status, meaning: meanings[status]}
  }),
  timeUnit: "seconds",
  priorities: TASK_PRIORITIES,
  fields: {
    projectId: {type: "string", meaning: "The id returned by list_projects; every task belongs to a project, with main always available."},
    status: {type: "string", values: TASK_STATUSES},
    priority: {type: "string", values: TASK_PRIORITIES},
    scheduled: {type: "object|null", date: "YYYY-MM-DD", time: "HH:mm or HH:mm:ss; empty string means no specified time", timezone: "IANA time zone"},
    estimatedSeconds: {type: "integer", unit: "seconds", minimum: 0},
    spentSeconds: {type: "integer", unit: "seconds", minimum: 0, agentWrite: "host-observed session intervals only"},
  },
  scheduling:
    "Backlog clears its day. Ready for Agent preserves an optional day. Other statuses require a day. On existing tasks, a transition that clears or assigns a day returns proposal_pending for exact status and schedule together, without changing the task. A newly assigned day is frozen when the proposal is created; acceptance never substitutes the later current day. Schedule preserving status transitions apply automatically. Setting a day on Backlog makes it To Do; clearing To Do's day returns it to Backlog. Clearing another dated status visibly pairs Backlog in the same proposal. An explicitly incompatible dated status and schedule clear is rejected before review. Dates use YYYY-MM-DD; times use HH:mm:ss; timezone is IANA.",
  creation:
    "save_task preserves explicit initial status, day, time, priority and estimate. With no day or status, new tasks default to To Do on the caller's day; date:null defaults to Backlog; Ready for Agent may be undated.",
  planning:
    "Changes to an existing task's day, time, estimate or priority, including date effects of status changes, are proposals. A mixed save_task request holds all its supported content, status, project and planning changes together until trusted Daily review accepts or rejects the exact original and proposed values. Restoration mixed with planning is rejected atomically: restore the task first, then request planning changes so review is accessible in Daily. Relations and relative reordering mixed with planning are rejected atomically; submit those separately after review. Report outcome=proposal_pending as pending, never as an applied change.",
  sessions: `Session state is independent of task status. Host-observed working intervals at meaningful boundaries are credited for at most ${MAX_OBSERVED_WORKFLOW_INTERVAL_SECONDS} seconds per interval; longer gaps and restart tails receive no credit. Heartbeats are optional. Overlaps count once; recorded time is observation, not proof of productivity.`,
}
