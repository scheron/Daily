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
import type {Changeset} from "../types/storage"
import type {StorageCore} from "./createStorageCore"
import type {IWorkStorage} from "./IWorkStorage"

/**
 * The one read and write path tasks, relations, comments, projects, tags, milestones, files and
 * search go through, built over a `StorageCore`. Carries every step of a write — the search index,
 * invalid-relation cleanup, and a moved task's comments — and calls `afterWrite` once per write with
 * the resulting changeset.
 */
export class WorkStorage implements IWorkStorage {
  constructor(
    private core: StorageCore,
    private afterWrite: (changeset: Changeset) => void,
  ) {}

  //#region TASKS
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

    await this.core.searchService.addTaskToIndex(createdTask)
    const changeset: Changeset = {tasks: {upserted: [createdTask]}}
    this.afterWrite(changeset)
    return changeset
  }

  /** A project change carried in `updates.branchId` also keeps the task's comments with it — the same as `moveTaskToBranch`, which is this method's own special case. */
  async updateTask(id: Task["id"], updates: PartialDeep<Task>, source?: ActorSource): Promise<Changeset> {
    const updatedTasks = await this.core.tasksService.updateTask(id, updates, source)
    if (!updatedTasks.length) return EMPTY_CHANGESET

    for (const task of updatedTasks) await this.core.searchService.updateTaskInIndex(task)
    const removedRelations = await this.core.taskRelationsService.removeInvalidRelations(updatedTasks.map((task) => task.id))

    const changeset: Changeset = {tasks: {upserted: updatedTasks}}
    if (removedRelations.length) changeset.relations = {removed: removedRelations}

    if (updates.branchId !== undefined) {
      const movedComments = await this.core.taskCommentsService.alignCommentsToTaskBranch(id, updates.branchId as Branch["id"])
      if (movedComments.length) changeset.comments = {upserted: movedComments}
    }

    this.afterWrite(changeset)
    return changeset
  }

  async moveTaskByOrder(params: MoveTaskByOrderParams, source?: ActorSource): Promise<Changeset> {
    const updatedTasks = await this.core.tasksService.moveTaskByOrder(params, source)
    if (!updatedTasks.length) return EMPTY_CHANGESET

    for (const task of updatedTasks) await this.core.searchService.updateTaskInIndex(task)
    const changeset: Changeset = {tasks: {upserted: updatedTasks}}
    this.afterWrite(changeset)
    return changeset
  }

  async moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"], source?: ActorSource): Promise<Changeset> {
    const branch = await this.core.branchesService.getBranch(branchId)
    if (!branch) return EMPTY_CHANGESET

    return this.updateTask(taskId, {branchId: branch.id}, source)
  }

  async restoreTask(id: Task["id"], source?: ActorSource): Promise<Changeset> {
    const restoredTask = await this.core.tasksService.restoreTask(id, source)
    if (!restoredTask) return EMPTY_CHANGESET

    await this.core.searchService.updateTaskInIndex(restoredTask)
    const changeset: Changeset = {tasks: {upserted: [restoredTask]}}
    this.afterWrite(changeset)
    return changeset
  }

  async deleteTask(id: Task["id"], source?: ActorSource): Promise<Changeset> {
    const deleted = await this.core.tasksService.deleteTask(id, source)
    if (!deleted) return EMPTY_CHANGESET

    this.core.searchService.removeTaskFromIndex(id)
    const removedRelations = await this.core.taskRelationsService.removeInvalidRelations([id])

    const changeset: Changeset = {tasks: {removed: [id]}}
    if (removedRelations.length) changeset.relations = {removed: removedRelations}
    this.afterWrite(changeset)
    return changeset
  }

  /** Deleted tasks are already excluded from the live collection, so a permanent delete has nothing to name in its changeset. */
  async permanentlyDeleteTask(id: Task["id"]): Promise<boolean> {
    const deleted = await this.core.tasksService.permanentlyDeleteTask(id)
    if (deleted) {
      this.core.searchService.removeTaskFromIndex(id)
      await this.core.taskCommentsService.permanentlyDeleteCommentsOfTasks([id])
      this.afterWrite(EMPTY_CHANGESET)
    }
    return deleted
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
  //#endregion

  //#region RELATIONS
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
    this.afterWrite(changeset)
    return changeset
  }
  //#endregion

  //#region COMMENTS
  async getCommentsOfTask(taskId: Task["id"]): Promise<TaskComment[]> {
    return this.core.taskCommentsService.getCommentsOfTask(taskId)
  }

  async createComment(taskId: Task["id"], content: string, source?: TaskCommentSource): Promise<Changeset> {
    const created = await this.core.taskCommentsService.createComment(taskId, content, source)
    if (!created) return EMPTY_CHANGESET

    const changeset: Changeset = {comments: {upserted: [created]}}
    this.afterWrite(changeset)
    return changeset
  }

  async updateComment(id: TaskComment["id"], content: string): Promise<Changeset> {
    const updated = await this.core.taskCommentsService.updateComment(id, content)
    if (!updated) return EMPTY_CHANGESET

    const changeset: Changeset = {comments: {upserted: [updated]}}
    this.afterWrite(changeset)
    return changeset
  }

  async deleteComment(id: TaskComment["id"]): Promise<Changeset> {
    const removed = await this.core.taskCommentsService.deleteComment(id)
    if (!removed) return EMPTY_CHANGESET

    const changeset: Changeset = {comments: {removed: [removed]}}
    this.afterWrite(changeset)
    return changeset
  }
  //#endregion

  //#region PROJECTS
  async getBranchList(): Promise<Branch[]> {
    return this.core.branchesService.getBranchList()
  }

  async getBranch(id: Branch["id"]): Promise<Branch | null> {
    return this.core.branchesService.getBranch(id)
  }

  async createBranch(branch: Pick<Branch, "name"> & Partial<Pick<Branch, "description">>): Promise<Changeset> {
    const createdBranch = await this.core.branchesService.createBranch(branch)
    if (!createdBranch) return EMPTY_CHANGESET

    const changeset: Changeset = {branches: {upserted: [createdBranch]}}
    this.afterWrite(changeset)
    return changeset
  }

  async updateBranch(id: Branch["id"], updates: Partial<Pick<Branch, "description" | "name">>): Promise<Changeset> {
    const updatedBranch = await this.core.branchesService.updateBranch(id, updates)
    if (!updatedBranch) return EMPTY_CHANGESET

    const changeset: Changeset = {branches: {upserted: [updatedBranch]}}
    this.afterWrite(changeset)
    return changeset
  }

  /** Also removes the project's tasks, milestones and tags — cascaded in one transaction by `BranchesService.deleteBranch`. */
  async deleteBranch(id: Branch["id"]): Promise<Changeset> {
    const result = await this.core.branchesService.deleteBranch(id)
    if (!result) return EMPTY_CHANGESET

    for (const taskId of result.deletedTaskIds) {
      this.core.searchService.removeTaskFromIndex(taskId)
    }
    const removedRelations = await this.core.taskRelationsService.removeInvalidRelations(result.deletedTaskIds)

    const changeset: Changeset = {branches: {removed: [id]}}
    if (result.deletedTaskIds.length) changeset.tasks = {removed: result.deletedTaskIds}
    if (result.deletedMilestoneIds.length) changeset.milestones = {removed: result.deletedMilestoneIds}
    if (result.deletedTagIds.length) changeset.tags = {removed: result.deletedTagIds}
    if (removedRelations.length) changeset.relations = {removed: removedRelations}
    this.afterWrite(changeset)
    return changeset
  }
  //#endregion

  //#region TAGS
  async getTagList(branchId?: Branch["id"]): Promise<Tag[]> {
    return this.core.tagsService.getTagList(branchId)
  }

  async getTag(id: Tag["id"]): Promise<Tag | null> {
    return this.core.tagsService.getTag(id)
  }

  async createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt">): Promise<Changeset> {
    const createdTag = await this.core.tagsService.createTag(tag)
    if (!createdTag) return EMPTY_CHANGESET

    const changeset: Changeset = {tags: {upserted: [createdTag]}}
    this.afterWrite(changeset)
    return changeset
  }

  async updateTag(id: Tag["id"], updates: Partial<Tag>): Promise<Changeset> {
    const updatedTag = await this.core.tagsService.updateTag(id, updates)
    if (!updatedTag) return EMPTY_CHANGESET

    const changeset: Changeset = {tags: {upserted: [updatedTag]}}
    this.afterWrite(changeset)
    return changeset
  }

  async deleteTag(id: Tag["id"]): Promise<Changeset> {
    const deleted = await this.core.tagsService.deleteTag(id)
    if (!deleted) return EMPTY_CHANGESET

    const changeset: Changeset = {tags: {removed: [id]}}
    this.afterWrite(changeset)
    return changeset
  }
  //#endregion

  //#region MILESTONES
  async getMilestoneList(branchId?: Branch["id"]): Promise<Milestone[]> {
    return this.core.milestonesService.getMilestoneList(branchId)
  }

  async getMilestone(id: Milestone["id"]): Promise<Milestone | null> {
    return this.core.milestonesService.getMilestone(id)
  }

  async createMilestone(milestone: Omit<Milestone, "id" | "createdAt" | "updatedAt" | "orderIndex">): Promise<Changeset> {
    const createdMilestone = await this.core.milestonesService.createMilestone(milestone)
    if (!createdMilestone) return EMPTY_CHANGESET

    const changeset: Changeset = {milestones: {upserted: [createdMilestone]}}
    this.afterWrite(changeset)
    return changeset
  }

  async updateMilestone(
    id: Milestone["id"],
    updates: Partial<Pick<Milestone, "name" | "description" | "targetDate" | "orderIndex">>,
  ): Promise<Changeset> {
    const updatedMilestone = await this.core.milestonesService.updateMilestone(id, updates)
    if (!updatedMilestone) return EMPTY_CHANGESET

    const changeset: Changeset = {milestones: {upserted: [updatedMilestone]}}
    this.afterWrite(changeset)
    return changeset
  }

  /** Also nulls `milestoneId` on the tasks it held; those ids are not surfaced here since `MilestonesService.deleteMilestone` only reports success. */
  async deleteMilestone(id: Milestone["id"]): Promise<Changeset> {
    const deleted = await this.core.milestonesService.deleteMilestone(id)
    if (!deleted) return EMPTY_CHANGESET

    const changeset: Changeset = {milestones: {removed: [id]}}
    this.afterWrite(changeset)
    return changeset
  }
  //#endregion

  //#region FILES
  async getFiles(fileIds: File["id"][]): Promise<File[]> {
    return this.core.filesService.getFiles(fileIds)
  }

  getFilePath(id: File["id"]): string {
    return this.core.filesService.getFilePath(id)
  }

  async prepareFile(filename: string, data: Buffer): Promise<{file: File; ext: string}> {
    return this.core.filesService.prepareFile(filename, data)
  }

  async writeFileAsset(fileId: File["id"], ext: string, data: Buffer): Promise<void> {
    return this.core.filesService.writeFileAsset(fileId, ext, data)
  }

  async deleteFile(fileId: File["id"]): Promise<boolean> {
    const deleted = await this.core.filesService.deleteFile(fileId)
    if (deleted) this.afterWrite(EMPTY_CHANGESET)
    return deleted
  }
  //#endregion

  //#region SEARCH
  async initializeIndex(): Promise<void> {
    return this.core.searchService.initializeIndex()
  }

  async searchTasks(query: string): Promise<TaskSearchResult[]> {
    return this.core.searchService.searchTasks(query)
  }
  //#endregion
}
