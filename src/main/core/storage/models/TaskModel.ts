import {nanoid} from "nanoid"

import type {PartialDeep} from "type-fest"
import type {Task, TaskInternal} from "../../../types.js"
import type {TaskDoc} from "../types.js"

import {withRetryOnConflict} from "../../../utils/withRetryOnConflict.js"
import {docIdMap, docToTask, taskToDoc} from "./_mappers.js"

export class TaskModel {
  constructor(private db: PouchDB.Database) {}

  async getTaskList(): Promise<TaskInternal[]> {
    try {
      const result = (await this.db.find({selector: {type: "task"}})) as PouchDB.Find.FindResponse<TaskDoc>

      console.log(`[TASKS] Loaded ${result.docs.length} task docs from PouchDB`)
      return result.docs.map(docToTask)
    } catch (error) {
      console.error("[TASKS] Failed to load task docs from PouchDB:", error)
      throw error
    }
  }

  async getTask(id: Task["id"]): Promise<TaskInternal | null> {
    try {
      const doc = await this.db.get<TaskDoc>(docIdMap.task.toDoc(id))

      console.log(`[TASKS] Returned task: ${id}`)

      return docToTask(doc)
    } catch (error: any) {
      if (error?.status === 404) {
        console.warn(`[TASKS] Task not found: ${id}`)
        return null
      }
      console.error(`[TASKS] Failed to get task ${id}:`, error)
      throw error
    }
  }

  async createTask(task: Omit<TaskInternal, "id">): Promise<TaskInternal | null> {
    const id = nanoid()

    try {
      const doc = taskToDoc({...task, id, tags: task.tags ?? []})

      const res = await this.db.put(doc)

      if (!res.ok) {
        console.error(`❌ Failed to create task ${id}:`, res)
        throw new Error(`Failed to create task ${id}`)
      }

      console.log(`💾 Created task ${id} in PouchDB (rev=${res.rev})`)

      return docToTask(doc)
    } catch (error: any) {
      if (error?.status === 409) {
        console.error(`❌ Conflict while creating task ${id}: document already exists`)
      } else {
        console.error(`❌ Failed to create task ${id}:`, error)
      }
      throw error
    }
  }

  async updateTask(id: Task["id"], task: PartialDeep<TaskInternal>): Promise<TaskInternal | null> {
    return await withRetryOnConflict("[TASK]", async (attempt) => {
      const existing = await this.db.get<TaskDoc>(docIdMap.task.toDoc(id))
      const patched = this.applyDiffToDoc(existing, task)

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
        console.error(`❌ Failed to update task ${id}:`, res)
        throw new Error(`Failed to update task ${id}`)
      }

      console.log(`💾 Updated task ${id} in PouchDB (rev=${res.rev}, attempt=${attempt + 1})`)

      return docToTask(updatedDoc)
    })
  }

  async deleteTask(id: Task["id"]): Promise<boolean> {
    try {
      const doc = await this.db.get<TaskDoc>(docIdMap.task.toDoc(id))
      if (!doc) return false

      await this.db.remove(doc)

      console.log(`🗑️ Deleted task: ${id}`)
      return true
    } catch (error: any) {
      if (error?.status === 404) {
        console.warn(`⚠️ Task not found for deletion: ${id}`)
        return false
      }

      console.error(`❌ Failed to delete task ${id}:`, error)
      return false
    }
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
      nextDoc.tagNames = updates.tags
    }

    if (updates.attachments !== undefined) {
      nextDoc.attachments = updates.attachments
    }

    return nextDoc
  }
}
