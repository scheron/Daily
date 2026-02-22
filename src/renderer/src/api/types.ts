import type {ISODate, ISOTime, Timezone} from "@shared/types/common"
import type {TaskSearchResult} from "@shared/types/search"
import type {Day, MoveTaskByOrderParams, Tag, Task} from "@shared/types/storage"

// prettier-ignore
export interface Storage {
  /**
   * Get days from the database
   * @param params - The parameters for the query
   * @param params.from - The start date formatted as YYYY-MM-DD
   * @param params.to - The end date formatted as YYYY-MM-DD
   * @returns The tasks that match the query
   */
  getDays(params?: {from?: ISODate; to?: ISODate}): Promise<Day[]>
  /**
   * Get a day from the database
   * @param date - The date formatted as YYYY-MM-DD of the day to get
   * @returns The day that matches the query
   */
  getDay(date: ISODate): Promise<Day | null>
  /**
   * Create a task in the database
   * @param content - The content of the task
   * @param params - The parameters for the task
   * @param params.date - The date formatted as YYYY-MM-DD of the day to create the task
   * @param params.time - The time formatted as HH:MM:SS of the task
   * @param params.timezone - The timezone of the task
   * @param params.tags - The tags of the task
   * @param params.estimatedTime - The estimated time of the task
   * @returns The day that matches the query
   */
  createTask(content: string, params: {date?: ISODate; time?: ISOTime; timezone?: Timezone; tags?: Tag[]; estimatedTime?: number; orderIndex?: number}): Promise<Day | null>
  /**
   * Update a task in the database
   * @param id - The id of the task to update
   * @param updates - The updates to apply to the task
   * @returns The day that matches the query
   */
  updateTask(id: Task["id"], updates: Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>): Promise<Day | null>
  toggleTaskMinimized(id: Task["id"], minimized: boolean): Promise<Day | null>
  moveTaskByOrder(params: MoveTaskByOrderParams): Promise<Day | null>
  /**
   * Delete a task in the database
   * @param id - The id of the task to delete
   * @returns The day that matches the query
   */
  deleteTask(id: Task["id"]): Promise<boolean>
  /**
   * Move a task to a different day and delete it from the source day
   * @param taskId - The id of the task to move
   * @param targetDate - The target date to move the task to
   * @returns The updated day information for both source and target days
   */
  moveTask(taskId: Task["id"], targetDate: ISODate): Promise<boolean>
  /**
   * Search for tasks using fuzzy matching
   * @param query - The search query string
   * @returns Array of task search results with match information, sorted by relevance
   */
  searchTasks(query: string): Promise<TaskSearchResult[]>
  /**
   * Get deleted tasks 
   * @param params - The parameters for the query
   * @param params.limit - The limit of the tasks to get
   * @returns The deleted tasks that match the query
   */
  getDeletedTasks(params?: {limit?: number}): Promise<Task[]>

  /**
   * Restore a deleted task 
   * @param id - The id of the task to restore
   * @returns The restored task
   */
  restoreTask(id: Task["id"]): Promise<Task | null>
  /**
   * Permanently delete a task in the database
   * @param id - The id of the task to permanently delete
   * @returns The deleted task
   */
  permanentlyDeleteTask(id: Task["id"]): Promise<boolean>
  permanentlyDeleteAllDeletedTasks(): Promise<number>
  addTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null>
  removeTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null>

  getTagList(): Promise<Tag[]>
  createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt" | "deletedAt">): Promise<Tag | null>
  updateTag(id: Tag["id"], updates: Partial<Tag>): Promise<Tag | null>
  deleteTag(id: Tag["id"]): Promise<boolean>
}
