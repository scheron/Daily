import {nanoid} from "nanoid"

import {logger} from "@/utils/logger"
import {withRetryOnConflict} from "@/utils/withRetryOnConflict"

import {docIdMap, docToTask, taskToDoc} from "./_mappers"

import type {TaskDoc} from "@/types/database"
import type {TaskInternal} from "@/types/storage"
import type {ISODate} from "@shared/types/common"
import type {Task} from "@shared/types/storage"
import type {PartialDeep} from "type-fest"

export class TaskModel {
  constructor(private db: PouchDB.Database) {}

  async getTaskList(params?: {from?: ISODate; to?: ISODate; limit?: number; includeDeleted?: boolean}): Promise<TaskInternal[]> {
    try {
      let selector: PouchDB.Find.Selector = {type: "task"}

      // PouchDB find() has default limit of 25
      const limit = params?.limit ?? Infinity

      if (params?.from || params?.to) {
        const dateSelector: {$gte?: ISODate; $lte?: ISODate} = {}

        if (params?.from) dateSelector.$gte = params.from
        if (params?.to) dateSelector.$lte = params.to

        Object.assign(selector, {
          "scheduled.date": dateSelector,
        })
      }

      const result = (await this.db.find({selector, limit})) as PouchDB.Find.FindResponse<TaskDoc>

      logger.info(logger.CONTEXT.TASKS, `Loaded ${result.docs.length} tasks from database`)

      return result.docs.map(docToTask).filter((task) => params?.includeDeleted || !task.deletedAt)
    } catch (error) {
      logger.error(logger.CONTEXT.TASKS, "Failed to load tasks from database", error)
      throw error
    }
  }

  async getTask(id: Task["id"]): Promise<TaskInternal | null> {
    try {
      const doc = await this.db.get<TaskDoc>(docIdMap.task.toDoc(id))

      logger.debug(logger.CONTEXT.TASKS, `Returned task: ${id}`)

      return docToTask(doc)
    } catch (error: any) {
      if (error?.status === 404) {
        logger.warn(logger.CONTEXT.TASKS, `Task not found: ${id}`)
        return null
      }
      logger.error(logger.CONTEXT.TASKS, `Failed to get task ${id}`, error)
      throw error
    }
  }

  async createTask(task: Omit<TaskInternal, "id">): Promise<TaskInternal | null> {
    const id = nanoid()

    try {
      const doc = taskToDoc({...task, id, tags: task.tags ?? []})

      const res = await this.db.put(doc)

      if (!res.ok) {
        throw new Error(`Failed to create task ${id}`)
      }

      logger.storage("Created", "TASKS", id)
      logger.debug(logger.CONTEXT.TASKS, `Task rev: ${res.rev}`)

      return docToTask(doc)
    } catch (error: any) {
      if (error?.status === 409) {
        logger.warn(logger.CONTEXT.TASKS, `Conflict creating task ${id}: document already exists`)
      } else {
        logger.error(logger.CONTEXT.TASKS, `Failed to create task ${id}`, error)
      }
      throw error
    }
  }

  async updateTask(id: Task["id"], updates: PartialDeep<TaskInternal>): Promise<TaskInternal | null> {
    return await withRetryOnConflict("[TASK]", async (attempt) => {
      const existing = await this.db.get<TaskDoc>(docIdMap.task.toDoc(id))
      const patched = this.applyDiffToDoc(existing, updates)

      const now = new Date().toISOString()

      const updatedDoc: TaskDoc = {
        ...existing,
        ...patched,
        createdAt: existing?.createdAt ?? patched?.createdAt ?? now,
        updatedAt: now,
        _id: existing._id,
        _rev: existing._rev,
      }

      const res = await this.db.put(updatedDoc)

      if (!res.ok) {
        throw new Error(`Failed to update task ${id}`)
      }

      logger.storage("Updated", "TASKS", id)
      logger.debug(logger.CONTEXT.TASKS, `Task rev: ${res.rev}, attempt: ${attempt + 1}`)

      return docToTask(updatedDoc)
    })
  }

  async deleteTask(id: Task["id"]): Promise<boolean> {
    const isDeleted = await withRetryOnConflict("[TASK]", async (attempt) => {
      try {
        const doc = await this.db.get<TaskDoc>(docIdMap.task.toDoc(id))
        if (!doc) return false

        const now = new Date().toISOString()
        const deletedDoc: TaskDoc = {
          ...doc,
          deletedAt: now,
          updatedAt: now,
        }

        const res = await this.db.put(deletedDoc)

        if (!res.ok) {
          throw new Error(`Failed to soft-delete task ${id}`)
        }

        logger.storage("Deleted", "TASKS", id)
        logger.debug(logger.CONTEXT.TASKS, `Task rev: ${res.rev}, attempt: ${attempt + 1}`)
        return true
      } catch (error: any) {
        if (error?.status === 404) {
          logger.warn(logger.CONTEXT.TASKS, `Task not found for deletion: ${id}`)
          return false
        }

        logger.error(logger.CONTEXT.TASKS, `Failed to delete task ${id}`, error)
        throw error
      }
    })
    return Boolean(isDeleted)
  }

  async getDeletedTasks(params?: {limit?: number}): Promise<TaskInternal[]> {
    try {
      const selector: PouchDB.Find.Selector = {
        type: "task",
        deletedAt: {$ne: null},
      }

      const limit = params?.limit ?? Infinity
      const result = (await this.db.find({selector, limit})) as PouchDB.Find.FindResponse<TaskDoc>

      // Filter out permanently deleted documents
      // Permanently deleted = epoch timestamp (year < 2000)
      const PERMANENT_DELETE_THRESHOLD = new Date("2000-01-01").getTime()
      const filteredDocs = result.docs.filter((doc: any) => {
        if (doc._deleted) return false
        if (!doc.deletedAt) return false
        const deletedAtTime = new Date(doc.deletedAt).getTime()
        return deletedAtTime >= PERMANENT_DELETE_THRESHOLD
      })

      logger.info(logger.CONTEXT.TASKS, `Loaded ${filteredDocs.length} deleted tasks from database`)

      return filteredDocs.map(docToTask)
    } catch (error) {
      logger.error(logger.CONTEXT.TASKS, "Failed to load deleted tasks from database", error)
      throw error
    }
  }

  async restoreTask(id: Task["id"]): Promise<TaskInternal | null> {
    return await withRetryOnConflict("[TASK-RESTORE]", async (attempt) => {
      try {
        const doc = await this.db.get<TaskDoc>(docIdMap.task.toDoc(id))
        if (!doc?.deletedAt) {
          logger.warn(logger.CONTEXT.TASKS, `Task ${id} not found or not deleted`)
          return null
        }

        const now = new Date().toISOString()
        const restoredDoc: TaskDoc = {
          ...doc,
          deletedAt: null,
          updatedAt: now,
        }

        const res = await this.db.put(restoredDoc)

        if (!res.ok) {
          throw new Error(`Failed to restore task ${id}`)
        }

        logger.storage("Restored", "TASKS", id)
        logger.debug(logger.CONTEXT.TASKS, `Task rev: ${res.rev}, attempt: ${attempt + 1}`)

        return docToTask(restoredDoc)
      } catch (error: any) {
        if (error?.status === 404) {
          logger.warn(logger.CONTEXT.TASKS, `Task not found for restoration: ${id}`)
          return null
        }
        logger.error(logger.CONTEXT.TASKS, `Failed to restore task ${id}`, error)
        throw error
      }
    })
  }

  async permanentlyDeleteTask(id: Task["id"]): Promise<boolean> {
    const isDeleted = await withRetryOnConflict("[TASK-PERMANENT-DELETE]", async (attempt) => {
      try {
        const doc = await this.db.get<TaskDoc>(docIdMap.task.toDoc(id))
        if (!doc) return false

        const now = new Date().toISOString()
        // Use epoch timestamp (1970-01-01) for permanent deletion
        // This will trigger immediate garbage collection via isExpired() in sync
        const permanentDeleteDoc: TaskDoc = {
          ...doc,
          deletedAt: new Date(0).toISOString(), // Epoch timestamp
          updatedAt: now,
        }

        const res = await this.db.put(permanentDeleteDoc)

        if (!res.ok) {
          throw new Error(`Failed to permanently delete task ${id}`)
        }

        logger.storage("Permanently Deleted", "TASKS", id)
        logger.debug(logger.CONTEXT.TASKS, `Task rev: ${res.rev}, attempt: ${attempt + 1}`)

        return true
      } catch (error: any) {
        if (error?.status === 404) {
          logger.warn(logger.CONTEXT.TASKS, `Task not found for permanent deletion: ${id}`)
          return false
        }
        logger.error(logger.CONTEXT.TASKS, `Failed to permanently delete task ${id}`, error)
        throw error
      }
    })

    return Boolean(isDeleted)
  }

  private applyDiffToDoc(doc: TaskDoc, updates: PartialDeep<TaskInternal>): TaskDoc {
    const nextDoc = {...doc}

    if (updates.status !== undefined) {
      nextDoc.status = updates.status
    }

    if (updates.estimatedTime !== undefined) {
      nextDoc.estimatedTime = updates.estimatedTime
    }

    if (updates.spentTime !== undefined) {
      nextDoc.spentTime = updates.spentTime
    }

    if (updates.content !== undefined) {
      nextDoc.content = updates.content
    }

    if (updates.scheduled !== undefined) {
      nextDoc.scheduled = {...nextDoc.scheduled, ...updates.scheduled}
    }

    if (updates.tags !== undefined) {
      nextDoc.tags = updates.tags
    }

    if (updates.attachments !== undefined) {
      nextDoc.attachments = updates.attachments
    }

    if (updates.deletedAt !== undefined) {
      nextDoc.deletedAt = updates.deletedAt
    }

    return nextDoc
  }
}
