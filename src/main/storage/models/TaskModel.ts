import {nanoid} from "nanoid"

import {LogContext, logger} from "@/utils/logger"
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

      logger.info(LogContext.TASKS, `Loaded ${result.docs.length} tasks from database`)

      return result.docs.map(docToTask).filter((task) => params?.includeDeleted || !task.deletedAt)
    } catch (error) {
      logger.error(LogContext.TASKS, "Failed to load tasks from database", error)
      throw error
    }
  }

  async getTask(id: Task["id"]): Promise<TaskInternal | null> {
    try {
      const doc = await this.db.get<TaskDoc>(docIdMap.task.toDoc(id))

      logger.debug(LogContext.TASKS, `Returned task: ${id}`)

      return docToTask(doc)
    } catch (error: any) {
      if (error?.status === 404) {
        logger.warn(LogContext.TASKS, `Task not found: ${id}`)
        return null
      }
      logger.error(LogContext.TASKS, `Failed to get task ${id}`, error)
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

      logger.storage("Created", "task", id)
      logger.debug(LogContext.TASKS, `Task rev: ${res.rev}`)

      return docToTask(doc)
    } catch (error: any) {
      if (error?.status === 409) {
        logger.warn(LogContext.TASKS, `Conflict creating task ${id}: document already exists`)
      } else {
        logger.error(LogContext.TASKS, `Failed to create task ${id}`, error)
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

      logger.storage("Updated", "task", id)
      logger.debug(LogContext.TASKS, `Task rev: ${res.rev}, attempt: ${attempt + 1}`)

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

        logger.storage("Deleted", "task", id)
        logger.debug(LogContext.TASKS, `Task rev: ${res.rev}, attempt: ${attempt + 1}`)
        return true
      } catch (error: any) {
        if (error?.status === 404) {
          logger.warn(LogContext.TASKS, `Task not found for deletion: ${id}`)
          return false
        }

        logger.error(LogContext.TASKS, `Failed to delete task ${id}`, error)
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
