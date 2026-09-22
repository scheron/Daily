import {isMilestoneClosed} from "@daily/protocol"

import type {
  Branch,
  ISODate,
  ISODateTime,
  ISOTime,
  Milestone,
  MilestoneProgress,
  Tag,
  Task,
  TaskComment,
  TaskCommentKind,
  TaskEvent,
  TaskEventType,
  TaskStatus,
  Timezone,
} from "@daily/protocol"

export type TagView = {id: string; projectId: string; name: string; color: string; createdAt: ISODateTime; updatedAt: ISODateTime}
export type ProjectView = {id: string; name: string; description: string; createdAt: ISODateTime; updatedAt: ISODateTime}
export type MilestoneView = {
  id: string
  projectId: string
  name: string
  description: string
  targetDate: ISODate | null
  progress: {total: number; resolved: number}
  isClosed: boolean
  createdAt: ISODateTime
  updatedAt: ISODateTime
}
export type AttachmentView = {id: string; name: string; mimeType: string; size: number; onServer: boolean}
export type TaskLinkView = {id: string; content: string; status: TaskStatus}
export type TaskEventView = {type: TaskEventType; date: ISODate; fromDate: ISODate | null; toDate: ISODate | null; at: ISODateTime}
export type CommentView = {
  id: string
  content: string
  kind: TaskCommentKind
  provider: string | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}
export type TaskView = {
  id: string
  content: string
  status: TaskStatus
  projectId: string
  projectName: string
  scheduled: {date: ISODate; time: ISOTime; timezone: Timezone} | null
  milestoneId: string | null
  tags: TagView[]
  estimatedSeconds: number
  spentSeconds: number
  imageCount: number
  createdAt: ISODateTime
  updatedAt: ISODateTime
  deletedAt: ISODateTime | null
}
export type TaskDetailView = TaskView & {
  blockedBy: TaskLinkView[]
  blocks: TaskLinkView[]
  history: TaskEventView[]
  attachments: AttachmentView[]
  comments: CommentView[]
}

export function tagView(tag: Tag): TagView {
  return {id: tag.id, projectId: tag.branchId, name: tag.name, color: tag.color, createdAt: tag.createdAt, updatedAt: tag.updatedAt}
}

export function projectView(branch: Branch): ProjectView {
  return {id: branch.id, name: branch.name, description: branch.description, createdAt: branch.createdAt, updatedAt: branch.updatedAt}
}

export function milestoneView(milestone: Milestone, progress: MilestoneProgress): MilestoneView {
  return {
    id: milestone.id,
    projectId: milestone.branchId,
    name: milestone.name,
    description: milestone.description,
    targetDate: milestone.targetDate,
    progress,
    isClosed: isMilestoneClosed(progress),
    createdAt: milestone.createdAt,
    updatedAt: milestone.updatedAt,
  }
}

export function taskView(task: Task, projectName: string, imageCount: number): TaskView {
  return {
    id: task.id,
    content: task.content,
    status: task.status,
    projectId: task.branchId,
    projectName,
    scheduled: task.scheduled,
    milestoneId: task.milestoneId,
    tags: task.tags.map(tagView),
    estimatedSeconds: task.estimatedTime,
    spentSeconds: task.spentTime,
    imageCount,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    deletedAt: task.deletedAt,
  }
}

export function taskDetailView(
  task: Task,
  projectName: string,
  parts: {blockedBy: Task[]; blocks: Task[]; history: TaskEvent[]; attachments: AttachmentView[]; comments: TaskComment[]},
): TaskDetailView {
  return {
    ...taskView(task, projectName, parts.attachments.length),
    blockedBy: parts.blockedBy.map(taskLinkView),
    blocks: parts.blocks.map(taskLinkView),
    history: parts.history.map(taskEventView),
    attachments: parts.attachments,
    comments: parts.comments.map(commentView),
  }
}

/** One comment as a tool answers it: what it says, and the channel and client it came through — never who may edit it. */
export function commentView(comment: TaskComment): CommentView {
  return {
    id: comment.id,
    content: comment.content,
    kind: comment.kind,
    provider: comment.provider,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  }
}

function taskLinkView(task: Task): TaskLinkView {
  return {id: task.id, content: task.content, status: task.status}
}

function taskEventView(event: TaskEvent): TaskEventView {
  return {type: event.type, date: event.eventDate, fromDate: event.fromDate, toDate: event.toDate, at: event.createdAt}
}
