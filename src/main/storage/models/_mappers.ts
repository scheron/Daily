import type {FileDoc, SettingsDoc, TagDoc, TaskDoc} from "@/types/database"
import type {TaskInternal} from "@/types/storage"
import type {ISODateTime} from "@shared/types/common"
import type {File, Settings, Tag} from "@shared/types/storage"

/**
 * Domain Model <-> Storage Document Mappers
 */
export const docIdMap = {
  task: {
    toDoc: (id: string) => `task:${id}`,
    fromDoc: (id: string) => id.split(":")[1],
  },
  tag: {
    toDoc: (id: string) => `tag:${id}`,
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
  const deletedAt = task.deletedAt ?? null
  const fallbackOrderIndex = Number.isFinite(task.orderIndex) ? task.orderIndex : Date.parse(createdAt)

  return {
    _id: docIdMap.task.toDoc(task.id),
    type: "task",
    status: task.status,
    orderIndex: fallbackOrderIndex,
    scheduled: {
      date: task.scheduled.date,
      time: task.scheduled.time,
      timezone: task.scheduled.timezone,
    },
    estimatedTime: task.estimatedTime,
    spentTime: task.spentTime,
    content: task.content,
    minimized: task.minimized ?? false,
    tags: task.tags,
    attachments: task.attachments ?? [],
    createdAt,
    updatedAt,
    deletedAt,
  }
}

export function docToTask(doc: TaskDoc): TaskInternal {
  const fallbackOrderIndex = typeof doc.orderIndex === "number" && Number.isFinite(doc.orderIndex) ? doc.orderIndex : Date.parse(doc.createdAt)

  return {
    id: docIdMap.task.fromDoc(doc._id),
    status: doc.status,
    orderIndex: fallbackOrderIndex,
    scheduled: {
      date: doc.scheduled.date,
      time: doc.scheduled.time,
      timezone: doc.scheduled.timezone,
    },
    estimatedTime: doc.estimatedTime,
    tags: doc.tags,
    spentTime: doc.spentTime,
    content: doc.content,
    minimized: doc.minimized ?? false,
    attachments: doc.attachments ?? [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
  }
}

/* ========================================== */
/* ============== TAG <-> DOC ============== */
/* ========================================= */
export function tagToDoc(tag: Tag): TagDoc {
  const createdAt = tag.createdAt ?? new Date().toISOString()
  const updatedAt = tag.updatedAt ?? createdAt
  const deletedAt = tag.deletedAt ?? null

  return {
    _id: docIdMap.tag.toDoc(tag.id),
    type: "tag",
    name: tag.name,
    color: tag.color,
    createdAt,
    updatedAt,
    deletedAt,
  }
}

export function docToTag(doc: TagDoc): Tag {
  return {
    id: docIdMap.tag.fromDoc(doc._id),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
    name: doc.name,
    color: doc.color,
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
    deletedAt: null, // Settings cannot be deleted
  }
}

export function docToSettings(doc: SettingsDoc): Settings {
  const columnsCollapsed = doc.data.layout?.columnsCollapsed ?? {
    active: false,
    discarded: false,
    done: false,
  }

  return {
    version: doc.data.version,
    themes: doc.data.themes,
    sidebar: doc.data.sidebar,
    sync: doc.data.sync,
    ai: doc.data.ai,
    layout: {
      type: doc.data.layout?.type ?? "list",
      columnsHideEmpty: doc.data.layout?.columnsHideEmpty ?? false,
      columnsAutoCollapseEmpty: doc.data.layout?.columnsAutoCollapseEmpty ?? false,
      columnsCollapsed: {
        active: Boolean(columnsCollapsed.active),
        discarded: Boolean(columnsCollapsed.discarded),
        done: Boolean(columnsCollapsed.done),
      },
    },
  }
}

/* ============================================ */
/* ============ FILE <-> DOC ================= */
/* ============================================ */

export function fileToDoc(file: File & {fileBuffer: Buffer}): FileDoc {
  return {
    _id: docIdMap.file.toDoc(file.id),
    type: "file",
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    deletedAt: file.deletedAt ?? null,
    _attachments: {
      data: {
        content_type: file.mimeType,
        data: file.fileBuffer.toString("base64"),
      },
    },
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
    deletedAt: doc.deletedAt,
  }
}
