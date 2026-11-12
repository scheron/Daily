import {randomUUID} from "node:crypto"

import {logger} from "../utils/logger"
import {TaskWorkflowError} from "../errors/task-workflow/TaskWorkflowError"
import {TaskWorkflowErrorCode} from "../errors/task-workflow/TaskWorkflowErrorCode"
import {EMPTY_CHANGESET} from "../types/storage"
import {TaskWorkflowService} from "./services/TaskWorkflowService"

import type {
  ActorSource,
  Branch,
  File,
  ISODateTime,
  Milestone,
  MoveTaskByOrderParams,
  Subtask,
  SubtaskCounts,
  Tag,
  Task,
  TaskComment,
  TaskCommentSource,
  TaskEvent,
  TaskRelation,
  TaskRelationSets,
  TaskSearchResult,
  TaskWorkflowCommand,
  TaskWorkflowContext,
  TaskWorkflowReceipt,
  TaskWorkflowResolution,
  TaskWorkflowSession,
  TaskWorkflowState,
  WorkflowGuidance,
  WorkflowGuidanceDocument,
  WorkflowGuidanceUpdate,
} from "@daily/protocol"
import type {PartialDeep} from "type-fest"
import type {SqliteDriver} from "../database/SqliteDriver"
import type {Changeset} from "../types/storage"
import type {TaskWorkflowHost} from "../types/taskWorkflow"
import type {StorageCore} from "./createStorageCore"
import type {IWorkStorage} from "./IWorkStorage"

type OpenBatch = {changeset: Changeset}

/**
 * The one read and write path tasks, relations, comments, projects, tags, milestones, files and
 * search go through, built over a `StorageCore`. Carries every step of a write — the search index,
 * invalid-relation cleanup, and a moved task's comments — and calls its write callback once per write with
 * the resulting changeset.
 */
export class WorkStorage implements IWorkStorage {
  private _openBatch: OpenBatch | null = null
  private _workflow: TaskWorkflowService

  constructor(
    private _core: StorageCore,
    private _db: SqliteDriver,
    private _afterWrite: (changeset: Changeset) => void,
    workflowHost: TaskWorkflowHost = {runtimeId: randomUUID()},
  ) {
    this._workflow = new TaskWorkflowService(_db, workflowHost)
  }

  /**
   * Runs `fn`'s writes as one SQLite transaction: none of them reaches the search index or
   * the write callback on its own, and only once `fn` resolves does the merged changeset of all of them do
   * both, in a single call. A thrown error rolls the transaction back and reaches the caller with
   * neither the index nor the write callback touched. A `batch` already open when this one starts is
   * joined rather than nested — its own commit covers this one's writes too.
   *
   * `fn` may only call this class's own writes — DB statements against the open transaction. No real
   * async I/O (a network call, writing a file's bytes) belongs inside it: the transaction holds
   * `BEGIN IMMEDIATE`'s lock for as long as `fn` is running.
   */
  async batch<T>(fn: () => Promise<T>, {acknowledgeCommit = false}: {acknowledgeCommit?: boolean} = {}): Promise<T> {
    if (this._openBatch) return fn()

    const openBatch: OpenBatch = {changeset: {}}
    this._openBatch = openBatch
    this._db.exec("BEGIN IMMEDIATE")

    let result: T
    try {
      try {
        result = await fn()
      } catch (error) {
        this._rollbackIfOpen()
        throw error
      }

      try {
        this._db.exec("COMMIT")
      } catch (error) {
        this._rollbackIfOpen()
        throw error
      }
    } finally {
      this._openBatch = null
    }

    if (acknowledgeCommit) await this._publishCommitted(openBatch.changeset)
    else await this._commitWrite(openBatch.changeset)
    return result
  }

  async getTaskList(params?: {
    from?: string
    to?: string
    limit?: number
    branchId?: Branch["id"]
    includeDeleted?: boolean
    includeBacklog?: boolean
  }): Promise<Task[]> {
    return this._core.tasksService.getTaskList(params)
  }

  async getTask(id: Task["id"]): Promise<Task | null> {
    return this._core.tasksService.getTask(id)
  }

  async getTaskWorkflow(taskId: string): Promise<TaskWorkflowState> {
    return this._workflow.get(taskId)
  }

  async executeTaskWorkflow(command: TaskWorkflowCommand, context: TaskWorkflowContext): Promise<TaskWorkflowReceipt> {
    const {receipt, changeset} = this._workflow.execute(command, context, this._openBatch !== null)
    await this._publishCommitted(changeset)
    return receipt
  }

  async getWorkflowGuidance(projectId?: string): Promise<WorkflowGuidance> {
    return this._workflow.getGuidance(projectId)
  }

  async updateWorkflowGuidance(update: WorkflowGuidanceUpdate): Promise<WorkflowGuidanceDocument> {
    const document = this._workflow.updateGuidance(update)
    await this._publishCommitted({})
    return document
  }

  async resolveTaskWorkflowProposal(request: TaskWorkflowResolution): Promise<TaskWorkflowReceipt> {
    return this.batch(
      async () => {
        const before = await this.getTask(request.taskId)
        const {receipt, changeset} = this._workflow.resolve(request, true)
        const after = changeset.tasks?.upserted?.find((task) => task.id === request.taskId)
        if (after) {
          const removed = await this._core.taskRelationsService.removeInvalidRelations([after.id])
          if (removed.length) changeset.relations = {removed}
          if (before && before.branchId !== after.branchId) {
            const comments = await this._core.taskCommentsService.alignCommentsToTaskBranch(after.id, after.branchId)
            if (comments.length) changeset.comments = {upserted: comments}
          }
        }
        await this._publishCommitted(changeset)
        return receipt
      },
      {acknowledgeCommit: true},
    )
  }

  async getHistoryByTask(taskId: Task["id"]): Promise<TaskEvent[]> {
    return this._core.tasksService.getHistoryByTask(taskId)
  }

  async getDeletedTasks(params?: {limit?: number; branchId?: Branch["id"]}): Promise<Task[]> {
    return this._core.tasksService.getDeletedTasks(params)
  }

  async getMoveCounts(): Promise<Record<Task["id"], number>> {
    return this._core.tasksService.getMoveCounts()
  }

  async getCompletionsBetween(fromInclusive?: ISODateTime, toExclusive?: ISODateTime): Promise<Array<{taskId: Task["id"]; at: ISODateTime}>> {
    return this._core.tasksService.getCompletionsBetween(fromInclusive, toExclusive)
  }

  async createTask(task: Omit<Task, "id"> & {id?: Task["id"]}, source?: ActorSource): Promise<Changeset> {
    const branchId = await this._core.branchesService.resolveBranchId(task?.branchId)
    if (
      (source?.kind === "mcp" || source?.kind === "agent") &&
      (task.status === "done" || task.status === "cancelled") &&
      !this._workflow.getGuidance(branchId).allowCompletion
    )
      throw new TaskWorkflowError(TaskWorkflowErrorCode.Forbidden, "Completion requires human review under the current workspace and project policy.")
    const createdTask = await this._core.tasksService.createTask({...task, branchId}, source)
    if (!createdTask) return EMPTY_CHANGESET

    return this._commitWrite({tasks: {upserted: [createdTask]}})
  }

  /** A project change carried in `updates.branchId` also keeps the task's comments with it — the same as `moveTaskToBranch`, which is this method's own special case. */
  async updateTask(id: Task["id"], updates: PartialDeep<Task>, source?: ActorSource, spentTimeDelta?: number): Promise<Changeset> {
    const task = await this.getTask(id)
    if (!task) return EMPTY_CHANGESET
    if (!Object.values(updates).some((value) => value !== undefined) && spentTimeDelta === undefined) return {tasks: {upserted: [task]}}
    return this.batch(() => this._applyTaskUpdate(id, updates, source, spentTimeDelta), {acknowledgeCommit: true})
  }

  async addTaskSpentTime(id: Task["id"], seconds: number): Promise<Changeset> {
    const task = this._db.transaction(() => this._core.tasksService.addTaskSpentTime(id, seconds))()
    if (!task) return EMPTY_CHANGESET

    return this._publishCommitted({tasks: {upserted: [task]}})
  }

  async moveTaskByOrder(params: MoveTaskByOrderParams, source?: ActorSource): Promise<Changeset> {
    return this.batch(
      async () => {
        const sessions = new Map<Task["id"], TaskWorkflowSession[]>()
        const updatedTasks = await this._core.tasksService.moveTaskByOrder(params, source, (taskIds) => {
          for (const taskId of taskIds) {
            const active = this._workflow.checkpointSessions(taskId)
            if (active.length) sessions.set(taskId, active)
          }
        })
        if (!updatedTasks.length) return EMPTY_CHANGESET

        for (const [taskId, active] of sessions) this._workflow.checkpointSessions(taskId, active)
        const upserted = sessions.size ? await Promise.all(updatedTasks.map(async (task) => (await this.getTask(task.id)) ?? task)) : updatedTasks
        return this._commitWrite({tasks: {upserted}})
      },
      {acknowledgeCommit: true},
    )
  }

  async moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"], source?: ActorSource): Promise<Changeset> {
    const branch = await this._core.branchesService.getBranch(branchId)
    if (!branch) return EMPTY_CHANGESET

    return this.updateTask(taskId, {branchId: branch.id}, source)
  }

  async restoreTask(id: Task["id"], source?: ActorSource): Promise<Changeset> {
    const restoredTask = await this._core.tasksService.restoreTask(id, source)
    if (!restoredTask) return EMPTY_CHANGESET

    return this._commitWrite({tasks: {upserted: [restoredTask]}})
  }

  async deleteTask(id: Task["id"], source?: ActorSource): Promise<Changeset> {
    const isDeleted = await this._core.tasksService.deleteTask(id, source)
    if (!isDeleted) return EMPTY_CHANGESET

    const removedRelations = await this._core.taskRelationsService.removeInvalidRelations([id])

    const changeset: Changeset = {tasks: {removed: [id]}}
    if (removedRelations.length) changeset.relations = {removed: removedRelations}
    return this._commitWrite(changeset)
  }

  /** Deleted tasks are already excluded from the live collection, so a permanent delete has nothing to name in its changeset. */
  async permanentlyDeleteTask(id: Task["id"]): Promise<boolean> {
    const isDeleted = await this._core.tasksService.permanentlyDeleteTask(id)
    if (isDeleted) {
      this._core.searchService.removeTaskFromIndex(id)
      await this._core.taskCommentsService.permanentlyDeleteCommentsOfTasks([id])
      await this._core.subtasksService.permanentlyDeleteSubtasksOfTasks([id])
      this._afterWrite(EMPTY_CHANGESET)
    }
    return isDeleted
  }

  async permanentlyDeleteAllDeletedTasks(branchId: Branch["id"]): Promise<number> {
    const deletedTasks = await this._core.tasksService.getDeletedTasks({branchId})
    if (!deletedTasks.length) return 0

    const count = await this._core.tasksService.permanentlyDeleteAllDeletedTasks({branchId})

    for (const task of deletedTasks) {
      this._core.searchService.removeTaskFromIndex(task.id)
    }

    await this._core.taskCommentsService.permanentlyDeleteCommentsOfTasks(deletedTasks.map((task) => task.id))
    await this._core.subtasksService.permanentlyDeleteSubtasksOfTasks(deletedTasks.map((task) => task.id))

    this._afterWrite(EMPTY_CHANGESET)
    return count
  }

  async getRelationList(): Promise<TaskRelation[]> {
    return this._core.taskRelationsService.getRelationList()
  }

  async getRelationsOfTask(taskId: Task["id"]): Promise<{blockedBy: Task[]; blocks: Task[]}> {
    return this._core.taskRelationsService.getRelationsOfTask(taskId)
  }

  async setTaskRelations(taskId: Task["id"], next: TaskRelationSets): Promise<Changeset> {
    const {upserted, removed} = await this._core.taskRelationsService.setTaskRelations(taskId, next)
    if (!upserted.length && !removed.length) return EMPTY_CHANGESET

    const changeset: Changeset = {}
    if (upserted.length) changeset.relations = {...changeset.relations, upserted}
    if (removed.length) changeset.relations = {...changeset.relations, removed}
    return this._commitWrite(changeset)
  }

  async getCommentsOfTask(taskId: Task["id"]): Promise<TaskComment[]> {
    return this._core.taskCommentsService.getCommentsOfTask(taskId)
  }

  async createComment(taskId: Task["id"], content: string, source?: TaskCommentSource): Promise<Changeset> {
    const created = await this._core.taskCommentsService.createComment(taskId, content, source)
    if (!created) return EMPTY_CHANGESET

    return this._commitWrite({comments: {upserted: [created]}})
  }

  async updateComment(id: TaskComment["id"], content: string, source?: ActorSource): Promise<Changeset> {
    const updated = await this._core.taskCommentsService.updateComment(id, content, source)
    if (!updated) return EMPTY_CHANGESET

    return this._commitWrite({comments: {upserted: [updated]}})
  }

  async deleteComment(id: TaskComment["id"], source?: ActorSource): Promise<Changeset> {
    const removed = await this._core.taskCommentsService.deleteComment(id, source)
    if (!removed) return EMPTY_CHANGESET

    return this._commitWrite({comments: {removed: [removed]}})
  }

  async getSubtasksOfTask(taskId: Task["id"]): Promise<Subtask[]> {
    return this._core.subtasksService.getSubtasksOfTask(taskId)
  }

  async getSubtaskCounts(): Promise<SubtaskCounts> {
    return this._core.subtasksService.getSubtaskCounts()
  }

  async createSubtask(taskId: Task["id"], content: string): Promise<Changeset> {
    const created = await this._core.subtasksService.createSubtask(taskId, content)
    if (!created) return EMPTY_CHANGESET

    return this._commitWrite({subtasks: {upserted: [created]}})
  }

  async updateSubtask(id: Subtask["id"], updates: {content?: string; done?: boolean}): Promise<Changeset> {
    const updated = await this._core.subtasksService.updateSubtask(id, updates)
    if (!updated) return EMPTY_CHANGESET

    return this._commitWrite({subtasks: {upserted: [updated]}})
  }

  async deleteSubtask(id: Subtask["id"]): Promise<Changeset> {
    const removed = await this._core.subtasksService.deleteSubtask(id)
    if (!removed) return EMPTY_CHANGESET

    return this._commitWrite({subtasks: {removed: [removed]}})
  }

  /**
   * Turns a subtask into a task in one `batch`: the new task takes the parent's status, whole schedule, project,
   * milestone and tags, with the subtask's markdown, no priority and no estimate, and the subtask is deleted.
   * Null when the subtask, or its task, is gone.
   */
  async makeTaskFromSubtask(id: Subtask["id"], source?: ActorSource): Promise<Task | null> {
    const subtask = await this._core.subtasksService.getSubtask(id)
    const parent = subtask && (await this._core.tasksService.getTask(subtask.taskId))
    if (!subtask || !parent || parent.deletedAt !== null) return null

    return this.batch(async () => {
      const created = await this.createTask(
        {
          status: parent.status,
          content: subtask.content,
          minimized: false,
          orderIndex: Date.now(),
          scheduled: parent.scheduled,
          estimatedTime: 0,
          spentTime: 0,
          branchId: parent.branchId,
          milestoneId: parent.milestoneId,
          priority: "none",
          tags: parent.tags,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        source,
      )
      await this.deleteSubtask(id)

      return created.tasks!.upserted![0]
    })
  }

  async getBranchList(): Promise<Branch[]> {
    return this._core.branchesService.getBranchList()
  }

  async getBranch(id: Branch["id"]): Promise<Branch | null> {
    return this._core.branchesService.getBranch(id)
  }

  async createBranch(branch: Pick<Branch, "name"> & Partial<Pick<Branch, "description" | "emoji">>): Promise<Changeset> {
    const createdBranch = await this._core.branchesService.createBranch(branch)
    if (!createdBranch) return EMPTY_CHANGESET

    return this._commitWrite({branches: {upserted: [createdBranch]}})
  }

  async updateBranch(id: Branch["id"], updates: Partial<Pick<Branch, "description" | "name" | "emoji">>): Promise<Changeset> {
    const updatedBranch = await this._core.branchesService.updateBranch(id, updates)
    if (!updatedBranch) return EMPTY_CHANGESET

    return this._commitWrite({branches: {upserted: [updatedBranch]}})
  }

  /** Also removes the project's tasks, milestones and tags — cascaded in one transaction by `BranchesService.deleteBranch`. */
  async deleteBranch(id: Branch["id"]): Promise<Changeset> {
    const result = await this._core.branchesService.deleteBranch(id)
    if (!result) return EMPTY_CHANGESET

    const removedRelations = await this._core.taskRelationsService.removeInvalidRelations(result.deletedTaskIds)

    const changeset: Changeset = {branches: {removed: [id]}}
    if (result.deletedTaskIds.length) changeset.tasks = {removed: result.deletedTaskIds}
    if (result.deletedMilestoneIds.length) changeset.milestones = {removed: result.deletedMilestoneIds}
    if (result.deletedTagIds.length) changeset.tags = {removed: result.deletedTagIds}
    if (removedRelations.length) changeset.relations = {removed: removedRelations}
    return this._commitWrite(changeset)
  }

  async getTagList(branchId?: Branch["id"]): Promise<Tag[]> {
    return this._core.tagsService.getTagList(branchId)
  }

  async getTag(id: Tag["id"]): Promise<Tag | null> {
    return this._core.tagsService.getTag(id)
  }

  async createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt">): Promise<Changeset> {
    const createdTag = await this._core.tagsService.createTag(tag)
    if (!createdTag) return EMPTY_CHANGESET

    return this._commitWrite({tags: {upserted: [createdTag]}})
  }

  async updateTag(id: Tag["id"], updates: Partial<Tag>): Promise<Changeset> {
    const updatedTag = await this._core.tagsService.updateTag(id, updates)
    if (!updatedTag) return EMPTY_CHANGESET

    return this._commitWrite({tags: {upserted: [updatedTag]}})
  }

  async deleteTag(id: Tag["id"]): Promise<Changeset> {
    const isDeleted = await this._core.tagsService.deleteTag(id)
    if (!isDeleted) return EMPTY_CHANGESET

    return this._commitWrite({tags: {removed: [id]}})
  }

  async getMilestoneList(branchId?: Branch["id"]): Promise<Milestone[]> {
    return this._core.milestonesService.getMilestoneList(branchId)
  }

  async getMilestone(id: Milestone["id"]): Promise<Milestone | null> {
    return this._core.milestonesService.getMilestone(id)
  }

  async createMilestone(milestone: Omit<Milestone, "id" | "createdAt" | "updatedAt" | "orderIndex">): Promise<Changeset> {
    const createdMilestone = await this._core.milestonesService.createMilestone(milestone)
    if (!createdMilestone) return EMPTY_CHANGESET

    return this._commitWrite({milestones: {upserted: [createdMilestone]}})
  }

  async updateMilestone(
    id: Milestone["id"],
    updates: Partial<Pick<Milestone, "name" | "description" | "targetDate" | "orderIndex">>,
  ): Promise<Changeset> {
    const updatedMilestone = await this._core.milestonesService.updateMilestone(id, updates)
    if (!updatedMilestone) return EMPTY_CHANGESET

    return this._commitWrite({milestones: {upserted: [updatedMilestone]}})
  }

  /** Also nulls `milestoneId` on the tasks it held; those ids are not surfaced here since `MilestonesService.deleteMilestone` only reports success. */
  async deleteMilestone(id: Milestone["id"]): Promise<Changeset> {
    const isDeleted = await this._core.milestonesService.deleteMilestone(id)
    if (!isDeleted) return EMPTY_CHANGESET

    return this._commitWrite({milestones: {removed: [id]}})
  }

  async getFiles(fileIds: File["id"][]): Promise<File[]> {
    return this._core.filesService.getFiles(fileIds)
  }

  getFilePath(id: File["id"]): string {
    return this._core.filesService.getFilePath(id)
  }

  async resolveAssetPath(id: File["id"]): Promise<string | null> {
    return this._core.filesService.resolveAssetPath(id)
  }

  async prepareFile(filename: string, data: Buffer): Promise<{file: File; ext: string}> {
    return this._core.filesService.prepareFile(filename, data)
  }

  async writeFileAsset(fileId: File["id"], ext: string, data: Buffer): Promise<void> {
    return this._core.filesService.writeFileAsset(fileId, ext, data)
  }

  async deleteFile(fileId: File["id"]): Promise<boolean> {
    const isDeleted = await this._core.filesService.deleteFile(fileId)
    if (isDeleted) await this._commitWrite(EMPTY_CHANGESET)
    return isDeleted
  }

  async cleanupOrphanFiles(): Promise<void> {
    return this._core.filesService.cleanupOrphanFiles()
  }

  async initializeIndex(): Promise<void> {
    return this._core.searchService.initializeIndex()
  }

  async searchTasks(query: string): Promise<TaskSearchResult[]> {
    return this._core.searchService.searchTasks(query)
  }

  private async _applyTaskUpdate(id: Task["id"], updates: PartialDeep<Task>, source?: ActorSource, spentTimeDelta?: number): Promise<Changeset> {
    if (!Object.values(updates).some((value) => value !== undefined) && spentTimeDelta === undefined) {
      const task = await this.getTask(id)
      return task ? {tasks: {upserted: [task]}} : EMPTY_CHANGESET
    }
    const sessions = (await this.getTask(id)) ? this._workflow.checkpointSessions(id) : []
    const updatedTasks = await this._core.tasksService.updateTask(id, updates, source, spentTimeDelta)
    if (!updatedTasks.length) return EMPTY_CHANGESET
    if (sessions.length) this._workflow.checkpointSessions(id, sessions)

    const removedRelations = await this._core.taskRelationsService.removeInvalidRelations(updatedTasks.map((task) => task.id))

    const changeset: Changeset = {
      tasks: {upserted: sessions.length ? await Promise.all(updatedTasks.map(async (task) => (await this.getTask(task.id)) ?? task)) : updatedTasks},
    }
    if (removedRelations.length) changeset.relations = {removed: removedRelations}

    if (updates.branchId !== undefined) {
      const movedComments = await this._core.taskCommentsService.alignCommentsToTaskBranch(id, updates.branchId as Branch["id"])
      if (movedComments.length) changeset.comments = {upserted: movedComments}
    }

    return this._commitWrite(changeset)
  }

  private async _publishCommitted(changeset: Changeset): Promise<Changeset> {
    try {
      return await this._commitWrite(changeset)
    } catch (error) {
      // Retrying after a notification failure would apply the increment twice.
      logger.error(logger.CONTEXT.TASKS, "Failed to publish recorded time", error)
      return changeset
    }
  }

  private async _commitWrite(changeset: Changeset): Promise<Changeset> {
    if (this._openBatch) {
      this._openBatch.changeset = mergeChangesets(this._openBatch.changeset, changeset)
      return changeset
    }

    await this._applyIndexMaintenance(changeset)
    this._afterWrite(changeset)
    return changeset
  }

  private _rollbackIfOpen(): void {
    if (!this._db.inTransaction) return
    try {
      this._db.exec("ROLLBACK")
    } catch {
      return
    }
  }

  private async _applyIndexMaintenance(changeset: Changeset): Promise<void> {
    for (const task of changeset.tasks?.upserted ?? []) await this._core.searchService.updateTaskInIndex(task)
    for (const id of changeset.tasks?.removed ?? []) this._core.searchService.removeTaskFromIndex(id)
  }
}

type ChangesetCollection<T> = {upserted?: T[]; removed?: string[]}

function mergeCollection<T extends {id: string}>(
  base: ChangesetCollection<T> | undefined,
  next: ChangesetCollection<T> | undefined,
): ChangesetCollection<T> | undefined {
  if (!base) return next
  if (!next) return base

  const upserted = new Map(base.upserted?.map((item) => [item.id, item]))
  const removed = new Set(base.removed)

  for (const item of next.upserted ?? []) {
    upserted.set(item.id, item)
    removed.delete(item.id)
  }
  for (const id of next.removed ?? []) {
    removed.add(id)
    upserted.delete(id)
  }

  const merged: ChangesetCollection<T> = {}
  if (upserted.size) merged.upserted = [...upserted.values()]
  if (removed.size) merged.removed = [...removed]
  return merged
}

function mergeChangesets(base: Changeset, next: Changeset): Changeset {
  return {
    tasks: mergeCollection(base.tasks, next.tasks),
    milestones: mergeCollection(base.milestones, next.milestones),
    tags: mergeCollection(base.tags, next.tags),
    branches: mergeCollection(base.branches, next.branches),
    relations: mergeCollection(base.relations, next.relations),
    comments: mergeCollection(base.comments, next.comments),
    subtasks: mergeCollection(base.subtasks, next.subtasks),
  }
}
