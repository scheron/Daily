import {EMPTY_CHANGESET} from "../types/storage"

import type {
  ActorSource,
  Branch,
  File,
  ISODateTime,
  Milestone,
  MoveTaskByOrderParams,
  Tag,
  Task,
  TaskComment,
  TaskCommentSource,
  TaskEvent,
  TaskRelation,
  TaskRelationSets,
  TaskSearchResult,
} from "@daily/protocol"
import type {PartialDeep} from "type-fest"
import type {SqliteDriver} from "../database/SqliteDriver"
import type {Changeset} from "../types/storage"
import type {StorageCore} from "./createStorageCore"
import type {IWorkStorage} from "./IWorkStorage"

type OpenBatch = {changeset: Changeset}

/**
 * The one read and write path tasks, relations, comments, projects, tags, milestones, files and
 * search go through, built over a `StorageCore`. Carries every step of a write — the search index,
 * invalid-relation cleanup, and a moved task's comments — and calls `afterWrite` once per write with
 * the resulting changeset.
 */
export class WorkStorage implements IWorkStorage {
  private openBatch: OpenBatch | null = null

  constructor(
    private core: StorageCore,
    private db: SqliteDriver,
    private afterWrite: (changeset: Changeset) => void,
  ) {}

  /**
   * Runs `fn`'s writes as one SQLite transaction: none of them reaches the search index or
   * `afterWrite` on its own, and only once `fn` resolves does the merged changeset of all of them do
   * both, in a single call. A thrown error rolls the transaction back and reaches the caller with
   * neither the index nor `afterWrite` touched. A `batch` already open when this one starts is
   * joined rather than nested — its own commit covers this one's writes too.
   *
   * `fn` may only call this class's own writes — DB statements against the open transaction. No real
   * async I/O (a network call, writing a file's bytes) belongs inside it: the transaction holds
   * `BEGIN IMMEDIATE`'s lock for as long as `fn` is running.
   */
  async batch<T>(fn: () => Promise<T>): Promise<T> {
    if (this.openBatch) return fn()

    const openBatch: OpenBatch = {changeset: {}}
    this.openBatch = openBatch
    this.db.exec("BEGIN IMMEDIATE")

    let result: T
    try {
      try {
        result = await fn()
      } catch (error) {
        this.rollbackIfOpen()
        throw error
      }

      try {
        this.db.exec("COMMIT")
      } catch (error) {
        this.rollbackIfOpen()
        throw error
      }
    } finally {
      this.openBatch = null
    }

    await this.applyIndexMaintenance(openBatch.changeset)
    this.afterWrite(openBatch.changeset)
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
    return this.core.tasksService.getTaskList(params)
  }

  async getTask(id: Task["id"]): Promise<Task | null> {
    return this.core.tasksService.getTask(id)
  }

  async getHistoryByTask(taskId: Task["id"]): Promise<TaskEvent[]> {
    return this.core.tasksService.getHistoryByTask(taskId)
  }

  async getDeletedTasks(params?: {limit?: number; branchId?: Branch["id"]}): Promise<Task[]> {
    return this.core.tasksService.getDeletedTasks(params)
  }

  async getMoveCounts(): Promise<Record<Task["id"], number>> {
    return this.core.tasksService.getMoveCounts()
  }

  async getCompletionsBetween(fromInclusive?: ISODateTime, toExclusive?: ISODateTime): Promise<Array<{taskId: Task["id"]; at: ISODateTime}>> {
    return this.core.tasksService.getCompletionsBetween(fromInclusive, toExclusive)
  }

  async createTask(task: Omit<Task, "id"> & {id?: Task["id"]}, source?: ActorSource): Promise<Changeset> {
    const branchId = await this.core.branchesService.resolveBranchId(task?.branchId)
    const createdTask = await this.core.tasksService.createTask({...task, branchId}, source)
    if (!createdTask) return EMPTY_CHANGESET

    return this.commitWrite({tasks: {upserted: [createdTask]}})
  }

  /** A project change carried in `updates.branchId` also keeps the task's comments with it — the same as `moveTaskToBranch`, which is this method's own special case. */
  async updateTask(id: Task["id"], updates: PartialDeep<Task>, source?: ActorSource): Promise<Changeset> {
    const updatedTasks = await this.core.tasksService.updateTask(id, updates, source)
    if (!updatedTasks.length) return EMPTY_CHANGESET

    const removedRelations = await this.core.taskRelationsService.removeInvalidRelations(updatedTasks.map((task) => task.id))

    const changeset: Changeset = {tasks: {upserted: updatedTasks}}
    if (removedRelations.length) changeset.relations = {removed: removedRelations}

    if (updates.branchId !== undefined) {
      const movedComments = await this.core.taskCommentsService.alignCommentsToTaskBranch(id, updates.branchId as Branch["id"])
      if (movedComments.length) changeset.comments = {upserted: movedComments}
    }

    return this.commitWrite(changeset)
  }

  async moveTaskByOrder(params: MoveTaskByOrderParams, source?: ActorSource): Promise<Changeset> {
    const updatedTasks = await this.core.tasksService.moveTaskByOrder(params, source)
    if (!updatedTasks.length) return EMPTY_CHANGESET

    return this.commitWrite({tasks: {upserted: updatedTasks}})
  }

  async moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"], source?: ActorSource): Promise<Changeset> {
    const branch = await this.core.branchesService.getBranch(branchId)
    if (!branch) return EMPTY_CHANGESET

    return this.updateTask(taskId, {branchId: branch.id}, source)
  }

  async restoreTask(id: Task["id"], source?: ActorSource): Promise<Changeset> {
    const restoredTask = await this.core.tasksService.restoreTask(id, source)
    if (!restoredTask) return EMPTY_CHANGESET

    return this.commitWrite({tasks: {upserted: [restoredTask]}})
  }

  async deleteTask(id: Task["id"], source?: ActorSource): Promise<Changeset> {
    const isDeleted = await this.core.tasksService.deleteTask(id, source)
    if (!isDeleted) return EMPTY_CHANGESET

    const removedRelations = await this.core.taskRelationsService.removeInvalidRelations([id])

    const changeset: Changeset = {tasks: {removed: [id]}}
    if (removedRelations.length) changeset.relations = {removed: removedRelations}
    return this.commitWrite(changeset)
  }

  /** Deleted tasks are already excluded from the live collection, so a permanent delete has nothing to name in its changeset. */
  async permanentlyDeleteTask(id: Task["id"]): Promise<boolean> {
    const isDeleted = await this.core.tasksService.permanentlyDeleteTask(id)
    if (isDeleted) {
      this.core.searchService.removeTaskFromIndex(id)
      await this.core.taskCommentsService.permanentlyDeleteCommentsOfTasks([id])
      this.afterWrite(EMPTY_CHANGESET)
    }
    return isDeleted
  }

  async permanentlyDeleteAllDeletedTasks(branchId: Branch["id"]): Promise<number> {
    const deletedTasks = await this.core.tasksService.getDeletedTasks({branchId})
    if (!deletedTasks.length) return 0

    const count = await this.core.tasksService.permanentlyDeleteAllDeletedTasks({branchId})

    for (const task of deletedTasks) {
      this.core.searchService.removeTaskFromIndex(task.id)
    }

    await this.core.taskCommentsService.permanentlyDeleteCommentsOfTasks(deletedTasks.map((task) => task.id))

    this.afterWrite(EMPTY_CHANGESET)
    return count
  }

  async getRelationList(): Promise<TaskRelation[]> {
    return this.core.taskRelationsService.getRelationList()
  }

  async getRelationsOfTask(taskId: Task["id"]): Promise<{blockedBy: Task[]; blocks: Task[]}> {
    return this.core.taskRelationsService.getRelationsOfTask(taskId)
  }

  async setTaskRelations(taskId: Task["id"], next: TaskRelationSets): Promise<Changeset> {
    const {upserted, removed} = await this.core.taskRelationsService.setTaskRelations(taskId, next)
    if (!upserted.length && !removed.length) return EMPTY_CHANGESET

    const changeset: Changeset = {}
    if (upserted.length) changeset.relations = {...changeset.relations, upserted}
    if (removed.length) changeset.relations = {...changeset.relations, removed}
    return this.commitWrite(changeset)
  }

  async getCommentsOfTask(taskId: Task["id"]): Promise<TaskComment[]> {
    return this.core.taskCommentsService.getCommentsOfTask(taskId)
  }

  async createComment(taskId: Task["id"], content: string, source?: TaskCommentSource): Promise<Changeset> {
    const created = await this.core.taskCommentsService.createComment(taskId, content, source)
    if (!created) return EMPTY_CHANGESET

    return this.commitWrite({comments: {upserted: [created]}})
  }

  async updateComment(id: TaskComment["id"], content: string): Promise<Changeset> {
    const updated = await this.core.taskCommentsService.updateComment(id, content)
    if (!updated) return EMPTY_CHANGESET

    return this.commitWrite({comments: {upserted: [updated]}})
  }

  async deleteComment(id: TaskComment["id"]): Promise<Changeset> {
    const removed = await this.core.taskCommentsService.deleteComment(id)
    if (!removed) return EMPTY_CHANGESET

    return this.commitWrite({comments: {removed: [removed]}})
  }

  async getBranchList(): Promise<Branch[]> {
    return this.core.branchesService.getBranchList()
  }

  async getBranch(id: Branch["id"]): Promise<Branch | null> {
    return this.core.branchesService.getBranch(id)
  }

  async createBranch(branch: Pick<Branch, "name"> & Partial<Pick<Branch, "description">>): Promise<Changeset> {
    const createdBranch = await this.core.branchesService.createBranch(branch)
    if (!createdBranch) return EMPTY_CHANGESET

    return this.commitWrite({branches: {upserted: [createdBranch]}})
  }

  async updateBranch(id: Branch["id"], updates: Partial<Pick<Branch, "description" | "name">>): Promise<Changeset> {
    const updatedBranch = await this.core.branchesService.updateBranch(id, updates)
    if (!updatedBranch) return EMPTY_CHANGESET

    return this.commitWrite({branches: {upserted: [updatedBranch]}})
  }

  /** Also removes the project's tasks, milestones and tags — cascaded in one transaction by `BranchesService.deleteBranch`. */
  async deleteBranch(id: Branch["id"]): Promise<Changeset> {
    const result = await this.core.branchesService.deleteBranch(id)
    if (!result) return EMPTY_CHANGESET

    const removedRelations = await this.core.taskRelationsService.removeInvalidRelations(result.deletedTaskIds)

    const changeset: Changeset = {branches: {removed: [id]}}
    if (result.deletedTaskIds.length) changeset.tasks = {removed: result.deletedTaskIds}
    if (result.deletedMilestoneIds.length) changeset.milestones = {removed: result.deletedMilestoneIds}
    if (result.deletedTagIds.length) changeset.tags = {removed: result.deletedTagIds}
    if (removedRelations.length) changeset.relations = {removed: removedRelations}
    return this.commitWrite(changeset)
  }

  async getTagList(branchId?: Branch["id"]): Promise<Tag[]> {
    return this.core.tagsService.getTagList(branchId)
  }

  async getTag(id: Tag["id"]): Promise<Tag | null> {
    return this.core.tagsService.getTag(id)
  }

  async createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt">): Promise<Changeset> {
    const createdTag = await this.core.tagsService.createTag(tag)
    if (!createdTag) return EMPTY_CHANGESET

    return this.commitWrite({tags: {upserted: [createdTag]}})
  }

  async updateTag(id: Tag["id"], updates: Partial<Tag>): Promise<Changeset> {
    const updatedTag = await this.core.tagsService.updateTag(id, updates)
    if (!updatedTag) return EMPTY_CHANGESET

    return this.commitWrite({tags: {upserted: [updatedTag]}})
  }

  async deleteTag(id: Tag["id"]): Promise<Changeset> {
    const isDeleted = await this.core.tagsService.deleteTag(id)
    if (!isDeleted) return EMPTY_CHANGESET

    return this.commitWrite({tags: {removed: [id]}})
  }

  async getMilestoneList(branchId?: Branch["id"]): Promise<Milestone[]> {
    return this.core.milestonesService.getMilestoneList(branchId)
  }

  async getMilestone(id: Milestone["id"]): Promise<Milestone | null> {
    return this.core.milestonesService.getMilestone(id)
  }

  async createMilestone(milestone: Omit<Milestone, "id" | "createdAt" | "updatedAt" | "orderIndex">): Promise<Changeset> {
    const createdMilestone = await this.core.milestonesService.createMilestone(milestone)
    if (!createdMilestone) return EMPTY_CHANGESET

    return this.commitWrite({milestones: {upserted: [createdMilestone]}})
  }

  async updateMilestone(
    id: Milestone["id"],
    updates: Partial<Pick<Milestone, "name" | "description" | "targetDate" | "orderIndex">>,
  ): Promise<Changeset> {
    const updatedMilestone = await this.core.milestonesService.updateMilestone(id, updates)
    if (!updatedMilestone) return EMPTY_CHANGESET

    return this.commitWrite({milestones: {upserted: [updatedMilestone]}})
  }

  /** Also nulls `milestoneId` on the tasks it held; those ids are not surfaced here since `MilestonesService.deleteMilestone` only reports success. */
  async deleteMilestone(id: Milestone["id"]): Promise<Changeset> {
    const isDeleted = await this.core.milestonesService.deleteMilestone(id)
    if (!isDeleted) return EMPTY_CHANGESET

    return this.commitWrite({milestones: {removed: [id]}})
  }

  async getFiles(fileIds: File["id"][]): Promise<File[]> {
    return this.core.filesService.getFiles(fileIds)
  }

  getFilePath(id: File["id"]): string {
    return this.core.filesService.getFilePath(id)
  }

  async resolveAssetPath(id: File["id"]): Promise<string | null> {
    return this.core.filesService.resolveAssetPath(id)
  }

  async prepareFile(filename: string, data: Buffer): Promise<{file: File; ext: string}> {
    return this.core.filesService.prepareFile(filename, data)
  }

  async writeFileAsset(fileId: File["id"], ext: string, data: Buffer): Promise<void> {
    return this.core.filesService.writeFileAsset(fileId, ext, data)
  }

  async deleteFile(fileId: File["id"]): Promise<boolean> {
    const isDeleted = await this.core.filesService.deleteFile(fileId)
    if (isDeleted) await this.commitWrite(EMPTY_CHANGESET)
    return isDeleted
  }

  async cleanupOrphanFiles(): Promise<void> {
    return this.core.filesService.cleanupOrphanFiles()
  }

  async initializeIndex(): Promise<void> {
    return this.core.searchService.initializeIndex()
  }

  async searchTasks(query: string): Promise<TaskSearchResult[]> {
    return this.core.searchService.searchTasks(query)
  }

  private async commitWrite(changeset: Changeset): Promise<Changeset> {
    if (this.openBatch) {
      this.openBatch.changeset = mergeChangesets(this.openBatch.changeset, changeset)
      return changeset
    }

    await this.applyIndexMaintenance(changeset)
    this.afterWrite(changeset)
    return changeset
  }

  private rollbackIfOpen(): void {
    if (!this.db.inTransaction) return
    try {
      this.db.exec("ROLLBACK")
    } catch {
      return
    }
  }

  private async applyIndexMaintenance(changeset: Changeset): Promise<void> {
    for (const task of changeset.tasks?.upserted ?? []) await this.core.searchService.updateTaskInIndex(task)
    for (const id of changeset.tasks?.removed ?? []) this.core.searchService.removeTaskFromIndex(id)
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
  }
}
