import type {Tag} from "../../types.js"
import type {TagDoc} from "../types.js"

import {withRetryOnConflict} from "../../utils/withRetryOnConflict.js"
import {docIdMap, docToTag, tagToDoc} from "./_mappers.js"

export class TagModel {
  constructor(private db: PouchDB.Database) {}

  async getTagList(): Promise<Tag[]> {
    try {
      const result = (await this.db.find({selector: {type: "tag"}})) as PouchDB.Find.FindResponse<TagDoc>
      const tags = result.docs.map(docToTag)

      console.log(`[TAGS] Loaded ${tags.length} tags from PouchDB`)
      return tags
    } catch (error) {
      console.error("[TAGS] Failed to load tags from PouchDB:", error)
      throw error
    }
  }

  async getTag(name: Tag["name"]): Promise<Tag | null> {
    try {
      const doc = await this.db.get<TagDoc>(docIdMap.tag.toDoc(name))
      return docToTag(doc)
    } catch (error: any) {
      if (error?.status === 404) {
        console.warn(`[TAGS] Tag not found: ${name}`)
        return null
      }
      console.error(`[TAGS] Failed to get tag ${name}:`, error)
      throw error
    }
  }

  async createTag(tag: Tag): Promise<Tag | null> {
    try {
      const now = new Date().toISOString()
      const doc = tagToDoc({...tag, createdAt: now, updatedAt: now})

      const res = await this.db.put(doc)

      if (!res.ok) {
        console.error(`❌ Failed to create tag ${tag.name}:`, res)
        throw new Error(`Failed to create tag ${tag.name}`)
      }

      console.log(`💾 Created tag ${tag.name} in PouchDB (rev=${res.rev})`)
      return docToTag(doc)
    } catch (error: any) {
      if (error?.status === 409) {
        console.warn(`⚠️ Tag ${tag.name} already exists, forwarding to updateTag`)
        return await this.updateTag(tag.name, tag)
      }

      console.error(`❌ Failed to create tag ${tag.name}:`, error)
      return null
    }
  }

  async updateTag(name: Tag["name"], tag: Tag): Promise<Tag | null> {
    return await withRetryOnConflict("[TAG]", async (attempt) => {
      const existing = await this.db.get<TagDoc>(docIdMap.tag.toDoc(name))
      const patched = this.applyDiffToDoc(existing, tag)

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
        console.error(`❌ Failed to update tag ${name}:`, res)
        throw new Error(`Failed to update tag ${name}`)
      }

      console.log(`💾 Updated tag ${name} in PouchDB (rev=${res.rev}, attempt=${attempt + 1})`)
      return docToTag(updatedDoc)
    })
  }

  async deleteTag(name: Tag["name"]): Promise<boolean> {
    try {
      const doc = await this.db.get<TagDoc>(docIdMap.tag.toDoc(name))

      await this.db.remove(doc)

      console.log(`🗑️ Deleted tag: ${name}`)

      return true
    } catch (error: any) {
      if (error?.status === 404) {
        console.warn(`⚠️ Tag not found for deletion: ${name}`)
        return false
      }

      console.error(`❌ Failed to delete tag ${name}:`, error)
      throw error
    }
  }

  private applyDiffToDoc(doc: TagDoc, updates: Partial<Tag>): TagDoc {
    const nextDoc = {...doc}

    if (updates.color !== undefined) {
      nextDoc.color = updates.color
    }

    return nextDoc
  }
}
