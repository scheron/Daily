import type {ISODate, ISOTime, Timezone} from "@shared/types/common"
import type {TaskSearchResult} from "@shared/types/search"
import type {StatsAggregate, StatsPeriod} from "@shared/types/stats"
import type {Branch, Day, MoveTaskByOrderParams, Tag, Task, TaskEvent, TaskStatus} from "@shared/types/storage"

// prettier-ignore
export interface Storage {
  /**
   * Load days (each with its tasks and tags) within a date range for a branch.
   * @param params.from - Range start, YYYY-MM-DD
   * @param params.to - Range end, YYYY-MM-DD
   * @param params.branchId - Branch to scope to; defaults to the active branch
   * @returns The days in range, with soft-deleted tasks excluded
   */
  getDays(params?: {from?: ISODate; to?: ISODate; branchId?: Branch["id"]}): Promise<Day[]>
  /**
   * Load a single day with its tasks and tags.
   * @param date - The day to load, YYYY-MM-DD
   * @returns The day, or null if there is nothing scheduled on it
   */
  getDay(date: ISODate): Promise<Day | null>
  /**
   * Load the activity journal for a day (events recorded on that local date).
   * @param date - The day, YYYY-MM-DD
   * @param branchId - Branch to scope to; defaults to the active branch
   * @returns The events for that day, newest first
   */
  getActivityByDay(date: ISODate, branchId?: Branch["id"]): Promise<TaskEvent[]>
  /**
   * Full event history of a single task, newest first (the `moved` pair collapsed to one row).
   * @param taskId - The task to fetch history for
   * @returns The task's events, newest first
   */
  getTaskHistory(taskId: Task["id"]): Promise<TaskEvent[]>
  /**
   * Aggregated stats for the widget over a week or month.
   * @param period - "week" or "month"
   * @param anchor - Any ISO date inside the period (e.g. the active day)
   * @param branchId - Branch to scope to; defaults to the active branch
   */
  getStats(period: StatsPeriod, anchor: ISODate, branchId?: Branch["id"]): Promise<StatsAggregate>
  /**
   * Load a single task by id, regardless of which day it is scheduled on.
   * @param id - The task id
   * @returns The task, or null if it does not exist
   */
  getTask(id: Task["id"]): Promise<Task | null>
  /**
   * Create a task and return the day it was added to. Omitted fields fall back to
   * defaults (today/now, status "active", minimized false, orderIndex 0).
   * @param content - The task body text
   * @param params.date - Scheduled day, YYYY-MM-DD; defaults to today
   * @param params.time - Scheduled time, HH:MM:SS; defaults to now
   * @param params.timezone - Scheduled timezone; defaults to the local zone
   * @param params.tags - Tags to attach
   * @param params.estimatedTime - Estimate in seconds
   * @param params.orderIndex - Manual sort index within the day
   * @param params.branchId - Owning branch; defaults to the active branch
   * @param params.status - Initial status; defaults to "active"
   * @returns The day the task was added to, or null on failure
   */
  createTask(content: string, params: {date?: ISODate; time?: ISOTime; timezone?: Timezone; tags?: Tag[]; estimatedTime?: number; orderIndex?: number; branchId?: Branch["id"]; status?: TaskStatus}): Promise<Day | null>
  /**
   * Apply a partial update to a task and return its day.
   * @param id - The task to update
   * @param updates - Fields to change (id, createdAt and updatedAt are not updatable)
   * @returns The day the task belongs to after the update, or null on failure
   */
  updateTask(id: Task["id"], updates: Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>): Promise<Day | null>
  /**
   * Set a task's collapsed (minimized) state and return its day.
   * @param id - The task to toggle
   * @param minimized - true to collapse the task, false to expand it
   * @returns The day the task belongs to, or null on failure
   */
  toggleTaskMinimized(id: Task["id"], minimized: boolean): Promise<Day | null>
  /**
   * Reorder a task within its day, optionally moving it to another status group.
   * Positions it before/after an anchor task (or at the end) via a fractional order
   * index, re-normalizing the group's indexes when no gap is available.
   * @param params.taskId - The task to move
   * @param params.targetTaskId - Anchor task to position against; null or omitted appends to the end
   * @param params.targetStatus - Destination status group; defaults to the task's current status
   * @param params.position - "before" or "after" the anchor; defaults to "before"
   * @returns The day the task belongs to, or null on failure
   */
  moveTaskByOrder(params: MoveTaskByOrderParams): Promise<Day | null>
  /**
   * Soft-delete a task: it moves to the deleted list and a "deleted" activity event is recorded.
   * @param id - The task to delete
   * @returns true if the task was soft-deleted
   */
  deleteTask(id: Task["id"]): Promise<boolean>
  /**
   * Reschedule a task to a different day (changes its scheduled date).
   * @param taskId - The task to move
   * @param targetDate - The destination day, YYYY-MM-DD
   * @returns true if the reschedule succeeded
   */
  moveTask(taskId: Task["id"], targetDate: ISODate): Promise<boolean>
  /**
   * Move a task to a different project branch.
   * @param taskId - The task to move
   * @param branchId - The destination branch
   * @returns true if moved or already in that branch, false otherwise
   */
  moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"]): Promise<boolean>
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
   * @returns The restored task, or null if it could not be restored
   */
  restoreTask(id: Task["id"]): Promise<Task | null>
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
   * @returns The updated task, or null on failure
   */
  addTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null>
  /**
   * Detach tags from a task.
   * @param taskId - The task to untag
   * @param tagIds - The tag ids to remove
   * @returns The updated task, or null on failure
   */
  removeTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null>

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
   * Rename a project branch. The default "main" branch cannot be renamed.
   * @param id - The branch to update
   * @param updates - The new name (trimmed; empty or duplicate names are rejected)
   * @returns The updated branch, or null if the rename was rejected
   */
  updateBranch(id: Branch["id"], updates: Pick<Branch, "name">): Promise<Branch | null>
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
