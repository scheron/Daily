import {normalize} from "@daily/std"

import type {SearchOptions, SearchResult, SearchTask} from "../../types/search"

/**
 * Core fuzzy search engine
 * Handles text normalization and search operations
 */
export class SearchEngine {
  private _isInitialized = false
  private _collection: SearchTask[] = []

  /**
   * Build the search index from an array of tasks
   */
  buildIndex(tasks: SearchTask[]) {
    this._collection = tasks
    this._isInitialized = true
  }

  /** Updates or inserts a task once the index has been built. */
  updateTask(task: SearchTask) {
    if (!this._isInitialized) return
    this.removeTask(task.id)
    this._collection.push(task)
  }

  /**
   * Remove a task from the index
   */
  removeTask(taskId: string) {
    if (!this._isInitialized) return

    this._collection = this._collection.filter((task) => task.id !== taskId)
  }

  /**
   * Search for tasks matching the query
   * Returns results sorted by relevance (score), then by updatedAt (newest first)
   */
  search(query: string, options?: SearchOptions): SearchResult[] {
    options?.consumeWork?.(query.length)
    const normalizedQuery = normalize(query)
    if (!this._isInitialized || !normalizedQuery) {
      return []
    }

    const rawLowerQuery = query.trim().toLowerCase()
    const matchedTasks: SearchResult[] = []
    const maxDistance = Math.floor(normalizedQuery.length / 4)

    for (const task of this._collection) {
      options?.consumeWork?.(task.content.length)
      const lowerContent = task.content.toLowerCase()
      const normalizedContent = task.plainText
      const rawExactIndex = lowerContent.indexOf(rawLowerQuery)

      if (rawExactIndex !== -1) {
        const indices: [number, number][] = []
        let matchCount = 0
        for (let index = rawExactIndex; index !== -1; index = lowerContent.indexOf(rawLowerQuery, index + 1)) {
          options?.consumeWork?.(rawLowerQuery.length)
          matchCount++
          if (options?.includeMatches !== false) indices.push([index, index + rawLowerQuery.length - 1])
        }
        const positionScore = (rawExactIndex / Math.max(task.content.length, 1)) * 100
        const matchCountScore = 10 / matchCount
        const score = positionScore + matchCountScore

        matchedTasks.push({
          task,
          score,
          ...(indices.length > 0 && {matches: [{indices, value: query, key: "content"}]}),
        })
        continue
      }

      options?.consumeWork?.(normalizedContent.length)
      const exactIndex = normalizedContent.indexOf(normalizedQuery)
      if (exactIndex !== -1) {
        const positionScore = (exactIndex / Math.max(normalizedContent.length, 1)) * 100
        const matchCountScore = 10
        const score = positionScore + matchCountScore

        matchedTasks.push({task, score})
      } else if (maxDistance > 0 && normalizedContent.length >= normalizedQuery.length - maxDistance) {
        options?.consumeWork?.(normalizedContent.length * normalizedQuery.length)
        const fuzzyMatch = this._findFuzzySubstring(normalizedContent, normalizedQuery, maxDistance)

        if (fuzzyMatch) {
          const positionScore = (fuzzyMatch.index / Math.max(normalizedContent.length, 1)) * 100
          const errorPenalty = (fuzzyMatch.distance / normalizedQuery.length) * 50
          const fuzzyPenalty = 200
          const score = fuzzyPenalty + positionScore + errorPenalty

          matchedTasks.push({task, score})
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

  getIndexSize(): number {
    return this._collection.length
  }

  private _findFuzzySubstring(content: string, query: string, maxDistance: number): {index: number; distance: number} | null {
    const distances = new Uint16Array(query.length + 1)
    for (let length = 1; length <= query.length; length++) distances[length] = length

    let bestIndex = -1
    let bestDistance = maxDistance

    // Working backwards with distances[0] fixed at zero lets each match choose its own end.
    for (let start = content.length - 1; start >= 0; start--) {
      const char = content[start]
      let diagonal = 0
      for (let length = 1; length <= query.length; length++) {
        const previous = distances[length]
        const substitution = char === query[query.length - length] ? 0 : 1
        distances[length] = Math.min(previous + 1, distances[length - 1] + 1, diagonal + substitution)
        diagonal = previous
      }
      const distance = distances[query.length]
      if (distance <= bestDistance) {
        bestIndex = start
        bestDistance = distance
      }
    }

    return bestIndex === -1 ? null : {index: bestIndex, distance: bestDistance}
  }
}
