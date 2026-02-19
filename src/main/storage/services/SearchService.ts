import {sortTags} from "@shared/utils/tags/sortTags"

import {TaskSearchIndex} from "../search/TaskSearchIndex"

import type {TagModel} from "@/storage/models/TagModel"
import type {TaskModel} from "@/storage/models/TaskModel"
import type {SearchOptions} from "@/types/search"
import type {TaskSearchResult} from "@shared/types/search"
import type {Tag, Task} from "@shared/types/storage"

/**
 * Service for searching tasks with fuzzy matching
 * Orchestrates search operations and enriches results with full tag objects
 */
export class SearchService {
  private searchIndex: TaskSearchIndex

  constructor(
    private taskModel: TaskModel,
    private tagModel: TagModel,
  ) {
    this.searchIndex = new TaskSearchIndex()
  }

  /**
   * Initialize the search index with all tasks
   * Should be called once on app startup
   */
  async initializeIndex(): Promise<void> {
    const tasks = await this.getEnrichedTasks()
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

    // Perform the search
    const searchResults = this.searchIndex.search(query, options)

    // Get all tags for enrichment
    const allTags = await this.tagModel.getTagList()
    const tagMap = new Map(allTags.map((t) => [t.id, t]))

    // Get full task data for each result and enrich with tags
    const results: TaskSearchResult[] = []
    for (const result of searchResults) {
      const task = await this.taskModel.getTask(result.task.id)
      if (task) {
        const tags = sortTags(task.tags.map((id) => tagMap.get(id)).filter(Boolean) as Tag[])
        results.push({
          task: {...task, tags},
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
   * Get all tasks enriched with full tag objects
   */
  private async getEnrichedTasks(): Promise<Task[]> {
    const [tasks, allTags] = await Promise.all([this.taskModel.getTaskList(), this.tagModel.getTagList()])

    const tagMap = new Map(allTags.map((t) => [t.id, t]))

    return tasks.map((task) => {
      const tags = sortTags(task.tags.map((id) => tagMap.get(id)).filter(Boolean) as Tag[])
      return {...task, tags}
    })
  }
}
