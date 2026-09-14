import type {Changeset} from "@daily/core"
import type {Branch, ISODate, Milestone, MoveTaskByOrderParams, Tag, Task, TaskEvent, TaskSearchResult, TaskStatus} from "@daily/protocol"

/** The fields a new task is created with. `id`, when present, is the id the row is stored under. */
export type CreateTaskParams = {
  id?: Task["id"]
  date?: string
  time?: string
  timezone?: string
  tags?: Tag[]
  estimatedTime?: number
  orderIndex?: number
  branchId?: Branch["id"]
  status?: TaskStatus
  milestoneId?: Task["milestoneId"]
}

// prettier-ignore
export interface Storage {
  /**
   * Full event history of a single task, newest first (the `moved` pair collapsed to one row).
   * @param taskId - The task to fetch history for
   * @returns The task's events, newest first
   */
  getTaskHistory(taskId: Task["id"]): Promise<TaskEvent[]>
  /**
   * Load a single task by id, regardless of which day it is scheduled on.
   * @param id - The task id
   * @returns The task, or null if it does not exist
   */
  getTask(id: Task["id"]): Promise<Task | null>
  /**
   * Load every live task of every project, backlog included.
   * @returns The full task collection
   */
  getAllTasks(): Promise<Task[]>
  /**
   * Create a task. Omitted fields fall back to defaults (today/now, status
   * "active", minimized false, orderIndex 0). A task created with status
   * "backlog" gets no date.
   * @param content - The task body text
   * @param params - The task's fields; `id`, when present, is the id the row is stored under
   * @returns What the write changed
   */
  createTask(content: string, params: CreateTaskParams): Promise<Changeset>
  /**
   * Apply a partial update to a task.
   * @param id - The task to update
   * @param updates - Fields to change (id, createdAt and updatedAt are not updatable)
   * @returns What the write changed
   */
  updateTask(id: Task["id"], updates: Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>): Promise<Changeset>
  /**
   * Set a task's collapsed (minimized) state.
   * @param id - The task to toggle
   * @param minimized - true to collapse the task, false to expand it
   * @returns What the write changed
   */
  toggleTaskMinimized(id: Task["id"], minimized: boolean): Promise<Changeset>
  /**
   * Reorder a task within its day, optionally moving it to another status group.
   * Positions it before/after an anchor task (or at the end) via a fractional order
   * index, re-normalizing the group's indexes when no gap is available.
   * @param params.taskId - The task to move
   * @param params.targetTaskId - Anchor task to position against; null or omitted appends to the end
   * @param params.targetStatus - Destination status group; defaults to the task's current status
   * @param params.position - "before" or "after" the anchor; defaults to "before"
   * @returns What the write changed
   */
  moveTaskByOrder(params: MoveTaskByOrderParams): Promise<Changeset>
  /**
   * Soft-delete a task: it moves to the deleted list and a "deleted" activity event is recorded.
   * @param id - The task to delete
   * @returns What the write changed
   */
  deleteTask(id: Task["id"]): Promise<Changeset>
  /**
   * Reschedule a task to a different day (changes its scheduled date).
   * @param taskId - The task to move
   * @param targetDate - The destination day, YYYY-MM-DD
   * @returns What the write changed
   */
  moveTask(taskId: Task["id"], targetDate: ISODate): Promise<Changeset>
  /**
   * Move a task to a different project branch.
   * @param taskId - The task to move
   * @param branchId - The destination branch
   * @returns What the write changed
   */
  moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"]): Promise<Changeset>
  /**
   * Search for tasks using fuzzy matching.
   * @param query - The search query string
   * @returns Task search results with match information, sorted by relevance
   */
  searchTasks(query: string): Promise<TaskSearchResult[]>
  /**
   * List soft-deleted tasks.
   * @param params.limit - Max number of tasks to return
   * @param params.branchId - Optional branch filter
   * @returns The soft-deleted tasks
   */
  getDeletedTasks(params?: {limit?: number; branchId?: Branch["id"]}): Promise<Task[]>
  /**
   * Restore a soft-deleted task: a "restored" activity event is recorded.
   * @param id - The task to restore
   * @returns What the write changed
   */
  restoreTask(id: Task["id"]): Promise<Changeset>
  /**
   * Permanently remove a soft-deleted task from the database (irreversible).
   * @param id - The task to delete permanently
   * @returns true if the task was removed
   */
  permanentlyDeleteTask(id: Task["id"]): Promise<boolean>
  /**
   * Permanently remove every soft-deleted task from the database (irreversible).
   * @returns The number of tasks removed
   */
  permanentlyDeleteAllDeletedTasks(): Promise<number>
  /**
   * Attach tags to a task.
   * @param taskId - The task to tag
   * @param tagIds - The tag ids to add
   * @returns What the write changed
   */
  addTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Changeset>
  /**
   * Detach tags from a task.
   * @param taskId - The task to untag
   * @param tagIds - The tag ids to remove
   * @returns What the write changed
   */
  removeTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Changeset>

  /**
   * List all non-deleted tags.
   * @returns The tags
   */
  getTagList(): Promise<Tag[]>
  /**
   * Create a tag.
   * @param tag - The tag to create; id and timestamps are assigned by the database
   * @returns The created tag, or null on failure
   */
  createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt" | "deletedAt">): Promise<Tag | null>
  /**
   * Apply a partial update to a tag.
   * @param id - The tag to update
   * @param updates - Fields to change
   * @returns The updated tag, or null on failure
   */
  updateTag(id: Tag["id"], updates: Partial<Tag>): Promise<Tag | null>
  /**
   * Soft-delete a tag.
   * @param id - The tag to delete
   * @returns true if the tag was deleted
   */
  deleteTag(id: Tag["id"]): Promise<boolean>

  /**
   * List milestones, optionally scoped to a project.
   * @param branchId - The project to scope to; omit for every project's
   * @returns The milestones
   */
  getMilestoneList(branchId?: Branch["id"]): Promise<Milestone[]>
  /**
   * Read a single milestone.
   * @param id - The milestone to read
   * @returns The milestone, or null if it does not exist
   */
  getMilestone(id: Milestone["id"]): Promise<Milestone | null>
  /**
   * Create a milestone.
   * @param milestone - The milestone to create; id, timestamps and order are assigned
   * @returns What the write changed
   */
  createMilestone(milestone: Omit<Milestone, "id" | "createdAt" | "updatedAt" | "orderIndex">): Promise<Changeset>
  /**
   * Apply a partial update to a milestone. Its project never changes.
   * @param id - The milestone to update
   * @param updates - Fields to change
   * @returns What the write changed
   */
  updateMilestone(
    id: Milestone["id"],
    updates: Partial<Pick<Milestone, "name" | "description" | "targetDate" | "orderIndex">>,
  ): Promise<Changeset>
  /**
   * Soft-delete a milestone. Every task it held keeps existing, cleared of it.
   * @param id - The milestone to delete
   * @returns What the write changed
   */
  deleteMilestone(id: Milestone["id"]): Promise<Changeset>

  /**
   * List all project branches.
   * @returns The branches
   */
  getBranchList(): Promise<Branch[]>
  /**
   * Create a project branch. The name is trimmed; empty or case-insensitively duplicate names are rejected.
   * @param branch - The branch to create; id and timestamps are assigned by the database
   * @returns The created branch, or null if the name is empty or already exists
   */
  createBranch(branch: Omit<Branch, "id" | "createdAt" | "updatedAt" | "deletedAt">): Promise<Branch | null>
  /**
   * Apply a partial update to a project branch. The default "main" branch can carry a
   * description but cannot be renamed.
   * @param id - The branch to update
   * @param updates - The new name (trimmed; empty or duplicate names are rejected) and/or description
   * @returns The updated branch, or null if the update was rejected
   */
  updateBranch(id: Branch["id"], updates: Partial<Pick<Branch, "name" | "description">>): Promise<Branch | null>
  /**
   * Delete a project branch. If it was the active branch, the active branch resets to "main".
   * @param id - The branch to delete
   * @returns true if the branch was deleted
   */
  deleteBranch(id: Branch["id"]): Promise<boolean>
  /**
   * Set the active project branch (persisted in settings). Falls back to "main" if the branch does not exist.
   * @param id - The branch to activate
   */
  setActiveBranch(id: Branch["id"]): Promise<void>
}
