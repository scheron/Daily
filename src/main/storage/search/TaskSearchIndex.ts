import {normalize} from "@shared/utils/strings/normalize"

import {SearchEngine} from "./SearchEngine"

import type {Task} from "@shared/types/storage"
import type {SearchOptions, SearchResult, SearchTask} from "../../types/search"

/**
 * Manages the task search index lifecycle
 * Handles CRUD operations and coordinates with SearchEngine
 */
export class TaskSearchIndex {
  private engine: SearchEngine

  constructor() {
    this.engine = new SearchEngine()
  }

  /**
   * Build or rebuild the entire search index from tasks
   */
  setTasks(tasks: Task[]): void {
    const searchTasks = tasks.map((task) => this.taskToSearchTask(task))
    this.engine.buildIndex(searchTasks)
  }

  /**
   * Add a new task to the index
   */
  addTask(task: Task): void {
    const searchTask = this.taskToSearchTask(task)
    this.engine.addTask(searchTask)
  }

  /**
   * Update an existing task in the index
   */
  updateTask(task: Task): void {
    const searchTask = this.taskToSearchTask(task)
    this.engine.updateTask(searchTask)
  }

  /**
   * Remove a task from the index
   */
  removeTask(taskId: string): void {
    this.engine.removeTask(taskId)
  }

  /**
   * Search for tasks matching the query
   */
  search(query: string, options?: SearchOptions): SearchResult[] {
    return this.engine.search(query, options)
  }

  /**
   * Clear the entire index
   */
  clear(): void {
    this.engine.clear()
  }

  /**
   * Get the current number of indexed tasks
   */
  getSize(): number {
    return this.engine.getIndexSize()
  }

  /**
   * Convert a Task to a SearchTask
   * Includes text normalization for efficient searching
   */
  private taskToSearchTask(task: Task): SearchTask {
    return {
      id: task.id,
      content: task.content,
      plainText: normalize(task.content),
      updatedAt: task.updatedAt,
      date: task.scheduled.date,
    }
  }
}
