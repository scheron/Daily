import type {ISODate, ISODateTime, ISOTime, Settings, Timezone} from "../types.js"

/** Base document type with common PouchDB fields. All documents extend this base.  */
export type BaseDoc = {
  /** Document ID. Must be unique and immutable. */
  _id: string
  /** Document revision. Must be present when updating documents. */
  _rev?: string
  /** Document type discriminator. Used for filtering and indexing. */
  type: "task" | "tag" | "settings" | "file"
  /** ISO timestamp when document was created */
  createdAt: ISODateTime
  /** ISO timestamp when document was last updated */
  updatedAt: ISODateTime
}

export type TaskDoc = BaseDoc & {
  type: "task"
  /** Task status */
  status: "active" | "done" | "discarded"
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
  /**
   * Tag names referenced by this task (name)
   */
  tagNames: string[]
  /** File URLs attached to this task (e.g., "daily://file/abc123") */
  attachments: string[]
}

export type TagDoc = BaseDoc & {
  type: "tag"
  /** Tag name (unique identifier) */
  name: string
  /** Tag color (hex format) */
  color: string
  /** Tag emoji */
  emoji: string
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

export type AnyDoc = TaskDoc | TagDoc | SettingsDoc | FileDoc
