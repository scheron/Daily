import {calcLevenshteinDistance} from "@shared/utils/strings/calcLevenshteinDistance"
import {normalize} from "@shared/utils/strings/normalize"

import type {SearchOptions, SearchResult, SearchTask} from "../../types/search"

/**
 * Core fuzzy search engine
 * Handles text normalization and search operations
 */
export class SearchEngine {
  private isInitialized = false
  private collection: SearchTask[] = []

  /**
   * Build the search index from an array of tasks
   */
  buildIndex(tasks: SearchTask[]): void {
    this.collection = tasks
    this.isInitialized = true
  }

  /**
   * Update the index with a modified task
   */
  updateTask(task: SearchTask): void {
    if (!this.isInitialized) return
    this.removeTask(task.id)
    this.addTask(task)
  }

  /**
   * Add a new task to the index
   */
  addTask(task: SearchTask): void {
    if (!this.isInitialized) {
      this.buildIndex([task])
      return
    }

    this.collection.push(task)
  }

  /**
   * Remove a task from the index
   */
  removeTask(taskId: string): void {
    if (!this.isInitialized) return

    this.collection = this.collection.filter((task) => task.id !== taskId)
  }

  /**
   * Search for tasks matching the query
   * Returns results sorted by relevance (score), then by updatedAt (newest first)
   */
  search(query: string, options?: SearchOptions): SearchResult[] {
    const normalizedQuery = normalize(query)
    if (!this.isInitialized || !normalizedQuery) {
      return []
    }

    const rawLowerQuery = query.trim().toLowerCase()
    const matchedTasks: SearchResult[] = []
    const maxDistance = Math.floor(normalizedQuery.length / 4)

    for (const task of this.collection) {
      const lowerContent = task.content.toLowerCase()
      const normalizedContent = task.plainText
      const rawIndices = this.findExactIndices(lowerContent, rawLowerQuery)
      const rawExactIndex = rawIndices[0]?.[0] ?? -1

      if (rawExactIndex !== -1) {
        const positionScore = (rawExactIndex / Math.max(task.content.length, 1)) * 100
        const matchCountScore = 10 / rawIndices.length
        const score = positionScore + matchCountScore

        matchedTasks.push({
          task,
          score,
          matches: [{indices: rawIndices, value: query, key: "content"}],
        })
        continue
      }

      const exactIndex = normalizedContent.indexOf(normalizedQuery)
      if (exactIndex !== -1) {
        const positionScore = (exactIndex / Math.max(normalizedContent.length, 1)) * 100
        const matchCountScore = 10
        const score = positionScore + matchCountScore

        matchedTasks.push({
          task,
          score,
          matches: undefined,
        })
      } else {
        const fuzzyMatch = this.findFuzzySubstring(normalizedContent, normalizedQuery, maxDistance)

        if (fuzzyMatch) {
          const positionScore = (fuzzyMatch.index / Math.max(normalizedContent.length, 1)) * 100
          const errorPenalty = (fuzzyMatch.distance / normalizedQuery.length) * 50
          const fuzzyPenalty = 200
          const score = fuzzyPenalty + positionScore + errorPenalty

          matchedTasks.push({
            task,
            score,
            matches: undefined,
          })
        }
      }
    }

    const limit = options?.limit ?? 100

    const sortedResults = matchedTasks.sort((a, b) => {
      if (a.score !== b.score) {
        return a.score - b.score
      }
      return new Date(b.task.updatedAt).getTime() - new Date(a.task.updatedAt).getTime()
    })

    return sortedResults.slice(0, limit)
  }

  private findExactIndices(content: string, query: string): [number, number][] {
    if (!query.length) return []

    const indices: [number, number][] = []
    let searchIndex = 0

    while (searchIndex < content.length) {
      const foundIndex = content.indexOf(query, searchIndex)
      if (foundIndex === -1) break

      indices.push([foundIndex, foundIndex + query.length - 1])
      searchIndex = foundIndex + 1
    }

    return indices
  }

  /**
   * Find fuzzy substring match allowing for character errors
   * Uses sliding window with edit distance
   */
  private findFuzzySubstring(content: string, query: string, maxDistance: number): {index: number; length: number; distance: number} | null {
    if (!query.length) return null

    let bestMatch: {index: number; length: number; distance: number} | null = null

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
    this.isInitialized = false
    this.collection = []
  }

  getIndexSize(): number {
    return this.collection.length
  }
}
