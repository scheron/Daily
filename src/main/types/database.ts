import type {ID, ISODate, ISODateTime, ISOTime, Timezone} from "@shared/types/common"
import type {Branch, Settings, Tag} from "@shared/types/storage"

export type DocType = "task" | "tag" | "branch" | "settings" | "file"
/** Base document type with common PouchDB fields. All documents extend this base.  */
export type BaseDoc = {
  /** Document ID. Must be unique and immutable. */
  _id: string
  /** Document revision. Must be present when updating documents. */
  _rev?: string
  /** Document type discriminator. Used for filtering and indexing. */
  type: DocType
  /** ISO timestamp when document was created */
  createdAt: ISODateTime
  /** ISO timestamp when document was last updated */
  updatedAt: ISODateTime
  /** ISO timestamp when document was soft-deleted. Null if not deleted. */
  deletedAt: ISODateTime | null
}

export type TaskDoc = BaseDoc & {
  type: "task"
  /** Task status */
  status: "active" | "done" | "discarded"
  /** Persistent position index used for manual sorting */
  orderIndex?: number
  /** Scheduled date/time for the task. */
  scheduled: {
    date: ISODate
    time: ISOTime
    timezone: Timezone
  }
  /** Estimated time in minutes */
  estimatedTime: number
  /** Spent time in minutes */
  spentTime: number
  /** Task content (markdown) */
  content: string
  /** Branch ID (project scope). Missing field is treated as MAIN for backward compatibility. */
  branchId?: ID
  /** Visual collapse state for task content. */
  minimized?: boolean
  /**
   * Tag IDs referenced by this task
   */
  tags: Tag["id"][]
  /** File URLs attached to this task (e.g., "daily://file/abc123") */
  attachments: string[]
}

export type BranchDoc = BaseDoc & {
  type: "branch"
  /** Branch name */
  name: Branch["name"]
}

export type TagDoc = BaseDoc & {
  type: "tag"
  /** Tag name (unique identifier) */
  name: string
  /** Tag color (hex format) */
  color: string
  /** Sort order for display. Optional. */
  sortOrder?: number
}

export type SettingsDoc = BaseDoc & {
  type: "settings"
  /** Settings data. Same structure as existing Settings type. */
  data: Settings
}

export type FileDoc = BaseDoc & {
  type: "file"
  /** Original filename */
  name: string
  /** MIME type of the file */
  mimeType: string
  /** File size in bytes */
  size: number

  /**
   * PouchDB attachments storage
   * @see https://pouchdb.com/guides/attachments.html
   */
  _attachments?: {
    /** The attachment key is always 'data' for consistency */
    data?: {
      /** MIME type of the attachment */
      content_type: string
      /**
       * Binary data as base64 string or Blob
       * When writing: provide base64 string (data.toString("base64"))
       * When reading: PouchDB may return Blob depending on options
       */
      data: string | Blob
    }
  }
}

export type AnyDoc = TaskDoc | TagDoc | BranchDoc | SettingsDoc | FileDoc
