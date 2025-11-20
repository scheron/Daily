import type {File, ISODateTime, Settings, Tag, TaskInternal} from "../../../types.js"
import type {FileDoc, SettingsDoc, TagDoc, TaskDoc} from "../types.js"

/**
 * Domain Model ↔ Storage Document Mappers
 */
export const docIdMap = {
  task: {
    toDoc: (id: string) => `task:${id}`,
    fromDoc: (id: string) => id.split(":")[1],
  },
  tag: {
    toDoc: (name: string) => `tag:${name}`,
    fromDoc: (id: string) => id.split(":")[1],
  },
  settings: {
    toDoc: () => "settings:default",
    fromDoc: () => "settings:default",
  },
  file: {
    toDoc: (id: string) => `file:${id}`,
    fromDoc: (id: string) => id.split(":")[1],
  },
}

/* =========================================== */
/* ============== TASK <-> DOC ============== */
/* ========================================== */
export function taskToDoc(task: TaskInternal): TaskDoc {
  const createdAt = task.createdAt ?? new Date().toISOString()
  const updatedAt = task.updatedAt ?? createdAt

  return {
    _id: docIdMap.task.toDoc(task.id),
    type: "task",
    status: task.status,
    scheduled: {
      date: task.scheduled.date,
      time: task.scheduled.time,
      timezone: task.scheduled.timezone,
    },
    estimatedTime: task.estimatedTime,
    spentTime: task.spentTime,
    content: task.content,
    tagNames: task.tags,
    attachments: task.attachments ?? [],
    createdAt,
    updatedAt,
  }
}

export function docToTask(doc: TaskDoc): TaskInternal {
  return {
    id: docIdMap.task.fromDoc(doc._id),
    status: doc.status,
    scheduled: {
      date: doc.scheduled.date,
      time: doc.scheduled.time,
      timezone: doc.scheduled.timezone,
    },
    estimatedTime: doc.estimatedTime,
    tags: doc.tagNames,
    spentTime: doc.spentTime,
    content: doc.content,
    attachments: doc.attachments ?? [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

/* ========================================== */
/* ============== TAG <-> DOC ============== */
/* ========================================= */
export function tagToDoc(tag: Tag & {createdAt?: ISODateTime; updatedAt?: ISODateTime}): TagDoc {
  const createdAt = tag.createdAt ?? new Date().toISOString()
  const updatedAt = tag.updatedAt ?? createdAt

  return {
    _id: docIdMap.tag.toDoc(tag.name),
    type: "tag",
    name: tag.name,
    color: tag.color,
    emoji: tag.emoji,
    createdAt,
    updatedAt,
  }
}

export function docToTag(doc: TagDoc): Tag {
  return {
    name: doc.name,
    color: doc.color,
    emoji: doc.emoji,
  }
}

/* ============================================ */
/* ============ SETTINGS <-> DOC ============ */
/* ============================================ */

export function settingsToDoc(settings: Settings, createdAt: ISODateTime, updatedAt: ISODateTime): SettingsDoc {
  return {
    _id: docIdMap.settings.toDoc(),
    type: "settings",
    data: settings,
    createdAt,
    updatedAt,
  }
}

export function docToSettings(doc: SettingsDoc): Settings {
  return {
    version: doc.data.version,
    themes: doc.data.themes,
    sidebar: doc.data.sidebar,
  }
}

/* ============================================ */
/* ============ FILE <-> DOC ================= */
/* ============================================ */

export function fileToDoc(file: File): FileDoc {
  return {
    _id: docIdMap.file.toDoc(file.id),
    type: "file",
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  }
}

export function docToFile(doc: FileDoc): File {
  return {
    id: docIdMap.file.fromDoc(doc._id),
    name: doc.name,
    mimeType: doc.mimeType,
    size: doc.size,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}
