import {TaskSearchIndex} from "../search/TaskSearchIndex"

import type {BranchModel} from "@/storage/models/BranchModel"
import type {TaskModel} from "@/storage/models/TaskModel"
import type {SearchOptions} from "@/types/search"
import type {TaskSearchResult} from "@shared/types/search"
import type {Task} from "@shared/types/storage"

/**
 * Service for searching tasks with fuzzy matching
 * Orchestrates search operations and enriches results with branch information
 */
export class SearchService {
  private searchIndex: TaskSearchIndex

  constructor(
    private taskModel: TaskModel,
    private branchModel: BranchModel,
  ) {
    this.searchIndex = new TaskSearchIndex()
  }

  /**
   * Initialize the search index with all tasks
   * Should be called once on app startup
   */
  async initializeIndex(): Promise<void> {
    const tasks = this.getEnrichedTasks()
    this.searchIndex.setTasks(tasks)
  }

  /**
   * Search for tasks matching the query
   * Returns enriched tasks with match information sorted by relevance
   */
  async searchTasks(query: string, options?: SearchOptions): Promise<TaskSearchResult[]> {
    if (!query.trim()) {
      return []
    }

    const searchResults = this.searchIndex.search(query, options)

    const allBranches = this.branchModel.getBranchList({includeDeleted: true})
    const branchMap = new Map(allBranches.map((branch) => [branch.id, branch]))

    const results: TaskSearchResult[] = []
    for (const result of searchResults) {
      const task = this.taskModel.getTask(result.task.id)
      if (task) {
        results.push({
          task,
          branch: branchMap.get(task.branchId) ?? null,
          matches: result.matches,
          score: result.score,
        })
      }
    }

    return results
  }

  /**
   * Add a task to the search index
   */
  async addTaskToIndex(task: Task): Promise<void> {
    this.searchIndex.addTask(task)
  }

  /**
   * Update a task in the search index
   */
  async updateTaskInIndex(task: Task): Promise<void> {
    this.searchIndex.updateTask(task)
  }

  /**
   * Remove a task from the search index
   */
  removeTaskFromIndex(taskId: string): void {
    this.searchIndex.removeTask(taskId)
  }

  /**
   * Get the current index size (number of indexed tasks)
   */
  getIndexSize(): number {
    return this.searchIndex.getSize()
  }

  /**
   * Rebuild the entire search index
   * Useful for recovering from index corruption or major data changes
   */
  async rebuildIndex(): Promise<void> {
    await this.initializeIndex()
  }

  /**
   * Get all tasks enriched with full tag objects (already done by TaskModel via SQL JOINs)
   */
  private getEnrichedTasks(): Task[] {
    return this.taskModel.getTaskList()
  }
}
