import {normalize} from "@daily/std"

import {SearchEngine} from "./SearchEngine"

import type {Task} from "@daily/protocol"
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
  setTasks(tasks: Task[], consumeWork?: SearchOptions["consumeWork"]) {
    const searchTasks = tasks.map((task) => {
      consumeWork?.(1 + task.content.length)
      return this._taskToSearchTask(task)
    })
    this.engine.buildIndex(searchTasks)
  }

  /**
   * Update an existing task in the index
   */
  updateTask(task: Task) {
    const searchTask = this._taskToSearchTask(task)
    this.engine.updateTask(searchTask)
  }

  /**
   * Remove a task from the index
   */
  removeTask(taskId: string) {
    this.engine.removeTask(taskId)
  }

  /**
   * Search for tasks matching the query
   */
  search(query: string, options?: SearchOptions): SearchResult[] {
    return this.engine.search(query, options)
  }

  /**
   * Get the current number of indexed tasks
   */
  getSize(): number {
    return this.engine.getIndexSize()
  }

  private _taskToSearchTask(task: Task): SearchTask {
    return {
      id: task.id,
      content: task.content,
      plainText: normalize(task.content),
      updatedAt: task.updatedAt,
      date: task.scheduled?.date ?? "",
    }
  }
}
