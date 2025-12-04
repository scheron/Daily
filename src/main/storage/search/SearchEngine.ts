import Fuse from "fuse.js"

import {calcLevenshteinDistance} from "@shared/utils/strings/calcLevenshteinDistance"

import type {IFuseOptions} from "fuse.js"
import type {SearchOptions, SearchResult, SearchTask} from "../../types/search"

/**
 * Core fuzzy search engine using Fuse.js
 * Handles text normalization and search operations
 */
export class SearchEngine {
  private fuse: Fuse<SearchTask> | null = null
  private collection: SearchTask[] = []
  private readonly defaultOptions: IFuseOptions<SearchTask> = {
    keys: ["content"],
    threshold: 0.1,
    ignoreLocation: true,
    includeMatches: true,
    includeScore: true,
    minMatchCharLength: 3,
    distance: 50,
    useExtendedSearch: false,
    ignoreFieldNorm: true,
    findAllMatches: false,
  }

  /**
   * Build the search index from an array of tasks
   */
  buildIndex(tasks: SearchTask[]): void {
    this.collection = tasks
    this.fuse = new Fuse(this.collection, this.defaultOptions)
  }

  /**
   * Update the index with a modified task
   */
  updateTask(task: SearchTask): void {
    if (!this.fuse) return

    // Fuse.js doesn't have a native update method
    // We need to remove and re-add the task
    this.removeTask(task.id)
    this.addTask(task)
  }

  /**
   * Add a new task to the index
   */
  addTask(task: SearchTask): void {
    if (!this.fuse) {
      // If index doesn't exist yet, create it with this single task
      this.buildIndex([task])
      return
    }

    // Add to the collection
    this.collection.push(task)
    this.fuse = new Fuse(this.collection, this.defaultOptions)
  }

  /**
   * Remove a task from the index
   */
  removeTask(taskId: string): void {
    if (!this.fuse) {
      return
    }

    this.collection = this.collection.filter((task) => task.id !== taskId)
    this.fuse = new Fuse(this.collection, this.defaultOptions)
  }

  /**
   * Search for tasks matching the query
   * Returns results sorted by relevance (score), then by updatedAt (newest first)
   */
  search(query: string, options?: SearchOptions): SearchResult[] {
    if (!this.fuse || !query.trim()) {
      return []
    }

    const lowerQuery = query.toLowerCase()
    const matchedTasks: SearchResult[] = []
    const maxDistance = Math.floor(query.length / 4) // Allow 1 error per 4 characters

    for (const task of this.collection) {
      const lowerContent = task.content.toLowerCase()

      // First try exact substring match
      const exactIndex = lowerContent.indexOf(lowerQuery)

      if (exactIndex !== -1) {
        // Exact match found - calculate all occurrences
        const indices: [number, number][] = []
        let searchIndex = 0

        while (searchIndex < lowerContent.length) {
          const foundIndex = lowerContent.indexOf(lowerQuery, searchIndex)
          if (foundIndex === -1) break

          indices.push([foundIndex, foundIndex + lowerQuery.length - 1])
          searchIndex = foundIndex + 1
        }

        // Scoring for exact matches (lower = better)
        // Position: 0-100 (start of doc = 0, end = 100)
        const positionScore = (exactIndex / Math.max(task.content.length, 1)) * 100
        const matchCountScore = 10 / indices.length
        const score = positionScore + matchCountScore

        matchedTasks.push({task, score, matches: [{indices, value: query, key: "content"}]})
      } else {
        const fuzzyMatch = this.findFuzzySubstring(lowerContent, lowerQuery, maxDistance)

        if (fuzzyMatch) {
          // Scoring for fuzzy matches (always higher than exact matches)
          const positionScore = (fuzzyMatch.index / Math.max(task.content.length, 1)) * 100
          const errorPenalty = (fuzzyMatch.distance / query.length) * 50 // Each error adds penalty
          const fuzzyPenalty = 200 // Base penalty to rank after all exact matches
          const score = fuzzyPenalty + positionScore + errorPenalty

          matchedTasks.push({
            task,
            score,
            matches: [
              {
                indices: [[fuzzyMatch.index, fuzzyMatch.index + fuzzyMatch.length - 1]],
                value: task.content.substring(fuzzyMatch.index, fuzzyMatch.index + fuzzyMatch.length),
                key: "content",
              },
            ],
          })
        }
      }
    }

    const limit = options?.limit ?? 100
    const limitedResults = matchedTasks.slice(0, limit)

    return limitedResults.sort((a, b) => {
      if (a.score !== b.score) {
        return a.score - b.score
      }
      return new Date(b.task.updatedAt).getTime() - new Date(a.task.updatedAt).getTime()
    })
  }

  /**
   * Find fuzzy substring match allowing for character errors
   * Uses sliding window with edit distance
   */
  private findFuzzySubstring(content: string, query: string, maxDistance: number): {index: number; length: number; distance: number} | null {
    if (!query.length) return null

    let bestMatch: {index: number; length: number; distance: number} | null = null

    // Slide a window of query.length (+/- maxDistance) across content
    for (let i = 0; i <= content.length - query.length + maxDistance; i++) {
      const minLen = Math.max(query.length - maxDistance, 1)
      const maxLen = query.length + maxDistance

      for (let len = minLen; len <= maxLen && i + len <= content.length; len++) {
        const substring = content.substring(i, i + len)
        const distance = calcLevenshteinDistance(substring, query)

        if (distance <= maxDistance) {
          if (!bestMatch || distance < bestMatch.distance || (distance === bestMatch.distance && i < bestMatch.index)) {
            bestMatch = {index: i, length: len, distance}
          }
        }
      }
    }

    return bestMatch
  }

  clear(): void {
    this.fuse = null
    this.collection = []
  }

  getIndexSize(): number {
    return this.collection.length
  }
}
