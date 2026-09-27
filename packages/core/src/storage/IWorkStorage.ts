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

/**
 * The one read and write path tasks, relations, comments, projects, tags, milestones, files and
 * search go through, shared by every host: the desktop's `StorageController` composes one with its
 * own broadcast as the after-write callback, and the server builds one per call over its snapshot
 * core with an empty callback. A project change — whether named through `moveTaskToBranch` or
 * carried in `updateTask`'s own `branchId` — always keeps the task's comments with it.
 */
export interface IWorkStorage {
  getTaskList(params?: {
    from?: string
    to?: string
    limit?: number
    branchId?: Branch["id"]
    includeDeleted?: boolean
    includeBacklog?: boolean
  }): Promise<Task[]>
  getTask(id: Task["id"]): Promise<Task | null>
  getHistoryByTask(taskId: Task["id"]): Promise<TaskEvent[]>
  getDeletedTasks(params?: {limit?: number; branchId?: Branch["id"]}): Promise<Task[]>
  getMoveCounts(): Promise<Record<Task["id"], number>>
  /** Every completion that fell in the half-open interval `[fromInclusive, toExclusive)`. A bound left `undefined` leaves that side unconstrained. */
  getCompletionsBetween(fromInclusive?: ISODateTime, toExclusive?: ISODateTime): Promise<Array<{taskId: Task["id"]; at: ISODateTime}>>
  createTask(task: Omit<Task, "id"> & {id?: Task["id"]}, source?: ActorSource): Promise<Changeset>
  updateTask(id: Task["id"], updates: PartialDeep<Task>, source?: ActorSource): Promise<Changeset>
  moveTaskByOrder(params: MoveTaskByOrderParams, source?: ActorSource): Promise<Changeset>
  moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"], source?: ActorSource): Promise<Changeset>
  restoreTask(id: Task["id"], source?: ActorSource): Promise<Changeset>
  deleteTask(id: Task["id"], source?: ActorSource): Promise<Changeset>
  permanentlyDeleteTask(id: Task["id"]): Promise<boolean>
  permanentlyDeleteAllDeletedTasks(branchId: Branch["id"]): Promise<number>

  getRelationList(): Promise<TaskRelation[]>
  getRelationsOfTask(taskId: Task["id"]): Promise<{blockedBy: Task[]; blocks: Task[]}>
  setTaskRelations(taskId: Task["id"], next: TaskRelationSets): Promise<Changeset>

  getCommentsOfTask(taskId: Task["id"]): Promise<TaskComment[]>
  createComment(taskId: Task["id"], content: string, source?: TaskCommentSource): Promise<Changeset>
  updateComment(id: TaskComment["id"], content: string): Promise<Changeset>
  deleteComment(id: TaskComment["id"]): Promise<Changeset>

  getBranchList(): Promise<Branch[]>
  getBranch(id: Branch["id"]): Promise<Branch | null>
  createBranch(branch: Pick<Branch, "name"> & Partial<Pick<Branch, "description">>): Promise<Changeset>
  updateBranch(id: Branch["id"], updates: Partial<Pick<Branch, "description" | "name">>): Promise<Changeset>
  deleteBranch(id: Branch["id"]): Promise<Changeset>

  getTagList(branchId?: Branch["id"]): Promise<Tag[]>
  getTag(id: Tag["id"]): Promise<Tag | null>
  createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt">): Promise<Changeset>
  updateTag(id: Tag["id"], updates: Partial<Tag>): Promise<Changeset>
  deleteTag(id: Tag["id"]): Promise<Changeset>

  getMilestoneList(branchId?: Branch["id"]): Promise<Milestone[]>
  getMilestone(id: Milestone["id"]): Promise<Milestone | null>
  createMilestone(milestone: Omit<Milestone, "id" | "createdAt" | "updatedAt" | "orderIndex">): Promise<Changeset>
  updateMilestone(id: Milestone["id"], updates: Partial<Pick<Milestone, "name" | "description" | "targetDate" | "orderIndex">>): Promise<Changeset>
  deleteMilestone(id: Milestone["id"]): Promise<Changeset>

  getFiles(fileIds: File["id"][]): Promise<File[]>
  getFilePath(id: File["id"]): string
  prepareFile(filename: string, data: Buffer): Promise<{file: File; ext: string}>
  writeFileAsset(fileId: File["id"], ext: string, data: Buffer): Promise<void>
  deleteFile(fileId: File["id"]): Promise<boolean>

  initializeIndex(): Promise<void>
  searchTasks(query: string): Promise<TaskSearchResult[]>
}
