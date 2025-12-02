import {nanoid} from "nanoid"

import {createCacheLoader} from "@/utils/createCacheLoader"
import {LogContext, logger} from "@/utils/logger"
import {withRetryOnConflict} from "@/utils/withRetryOnConflict"

import {docIdMap, docToTag, tagToDoc} from "./_mappers"

import type {TagDoc} from "@/types/database"
import type {Tag} from "@shared/types/storage"

export class TagModel {
  private CACHE_TTL = 5 * 60_000
  private tagListLoader: ReturnType<typeof createCacheLoader<Tag[]>>

  constructor(private db: PouchDB.Database) {
    this.tagListLoader = createCacheLoader(() => this.loadTagListFromDB(), this.CACHE_TTL)
  }

  invalidateCache() {
    this.tagListLoader.clear()
  }

  async getTagList({includeDeleted = false}: {includeDeleted?: boolean} = {}): Promise<Tag[]> {
    const tags = await this.tagListLoader.get()
    return tags.filter((tag) => !includeDeleted && !tag.deletedAt)
  }

  private async loadTagListFromDB(): Promise<Tag[]> {
    try {
      const result = (await this.db.find({selector: {type: "tag"}})) as PouchDB.Find.FindResponse<TagDoc>
      const tags = result.docs.map(docToTag)

      logger.info(LogContext.TAGS, `Loaded ${tags.length} tags from database`)
      return tags
    } catch (error) {
      logger.error(LogContext.TAGS, "Failed to load tags from database", error)
      throw error
    }
  }

  async getTag(id: Tag["id"]): Promise<Tag | null> {
    try {
      const doc = await this.db.get<TagDoc>(docIdMap.tag.toDoc(id))
      return docToTag(doc)
    } catch (error: any) {
      if (error?.status === 404) {
        logger.warn(LogContext.TAGS, `Tag not found: ${id}`)
        return null
      }
      logger.error(LogContext.TAGS, `Failed to get tag ${id}`, error)
      throw error
    }
  }

  async createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt">): Promise<Tag | null> {
    const id = nanoid()
    const now = new Date().toISOString()

    try {
      const doc = tagToDoc({...tag, id, createdAt: now, updatedAt: now})

      const res = await this.db.put(doc)

      if (!res.ok) {
        throw new Error(`Failed to create tag ${id}`)
      }

      logger.storage("Created", "tag", id)
      logger.debug(LogContext.TAGS, `Tag rev: ${res.rev}`)

      this.tagListLoader.clear()

      return docToTag(doc)
    } catch (error: any) {
      logger.error(LogContext.TAGS, `Failed to create tag ${id}`, error)
      return null
    }
  }

  async updateTag(id: Tag["id"], updates: Partial<Tag>): Promise<Tag | null> {
    return await withRetryOnConflict("[TAG]", async (attempt) => {
      const existing = await this.db.get<TagDoc>(docIdMap.tag.toDoc(id))
      const patched = this.applyDiffToDoc(existing, updates)

      const now = new Date().toISOString()

      const updatedDoc: TagDoc = {
        ...existing,
        ...patched,
        createdAt: existing?.createdAt ?? patched?.createdAt ?? now,
        updatedAt: now,
        _id: existing._id,
        _rev: existing._rev,
      }

      const res = await this.db.put(updatedDoc)

      if (!res.ok) {
        throw new Error(`Failed to update tag ${id}`)
      }

      logger.storage("Updated", "tag", id)
      logger.debug(LogContext.TAGS, `Tag rev: ${res.rev}, attempt: ${attempt + 1}`)

      this.tagListLoader.clear()

      return docToTag(updatedDoc)
    })
  }

  async deleteTag(id: Tag["id"]): Promise<boolean> {
    const isDeleted = await withRetryOnConflict("[TAG]", async (attempt) => {
      try {
        const doc = await this.db.get<TagDoc>(docIdMap.tag.toDoc(id))

        const now = new Date().toISOString()
        const deletedDoc: TagDoc = {
          ...doc,
          deletedAt: now,
          updatedAt: now,
        }

        const res = await this.db.put(deletedDoc)

        if (!res.ok) {
          throw new Error(`Failed to soft-delete tag ${id}`)
        }

        logger.storage("Deleted", "tag", id)
        logger.debug(LogContext.TAGS, `Tag rev: ${res.rev}, attempt: ${attempt + 1}`)
        this.tagListLoader.clear()

        return true
      } catch (error: any) {
        if (error?.status === 404) {
          logger.warn(LogContext.TAGS, `Tag not found for deletion: ${id}`)
          return false
        }

        logger.error(LogContext.TAGS, `Failed to delete tag ${id}`, error)
        throw error
      }
    })
    return Boolean(isDeleted)
  }

  private applyDiffToDoc(doc: TagDoc, updates: Partial<Tag>): TagDoc {
    const nextDoc = {...doc}

    if (updates.color !== undefined) {
      nextDoc.color = updates.color
    }

    if (updates.deletedAt !== undefined) {
      nextDoc.deletedAt = updates.deletedAt
    }

    return nextDoc
  }
}
