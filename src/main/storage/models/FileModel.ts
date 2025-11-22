import {nanoid} from "nanoid"

import type {File} from "../../types.js"
import type {FileDoc} from "../types.js"

import {docIdMap, docToFile, fileToDoc} from "./_mappers.js"

export class FileModel {
  constructor(private db: PouchDB.Database) {}

  async getFileList(): Promise<File[]> {
    try {
      const result = (await this.db.find({selector: {type: "file"}})) as PouchDB.Find.FindResponse<FileDoc>

      console.log(`[FILES] Loaded ${result.docs.length} files from PouchDB`)
      return result.docs.map(docToFile)
    } catch (error) {
      console.error("[FILES] Failed to load files from PouchDB:", error)
      throw error
    }
  }

  async getFiles(ids: File["id"][]): Promise<File[]> {
    if (ids.length === 0) return []

    try {
      const result = await this.db.allDocs<FileDoc>({
        keys: ids,
        include_docs: true,
      })

      const files: File[] = []

      for (const row of result.rows) {
        if ("error" in row) {
          console.error(`[FILES] Failed to get file ${row.key}:`, row.error)
          continue
        }

        if (row.doc) files.push(docToFile(row.doc))
      }

      console.log(`[FILES] Retrieved ${files.length}/${ids.length} files`)
      return files
    } catch (error) {
      console.error("[FILES] Failed to get files:", error)
      throw error
    }
  }

  async createFile(name: string, mimeType: string, size: number, data: Buffer): Promise<File | null> {
    try {
      const now = new Date().toISOString()

      const file: File = {
        id: nanoid(),
        name,
        mimeType,
        size,
        createdAt: now,
        updatedAt: now,
      }

      const doc = fileToDoc(file)
      const putResult = await this.db.put(doc)

      console.log(`📝 Document created, rev: ${putResult.rev}`)

      const attachResult = await this.db.putAttachment(doc._id, "data", putResult.rev, data, mimeType)
      console.log(`📎 Attachment added, rev: ${attachResult.rev}`)

      await this.db.get(doc._id, {attachments: true, binary: false})

      return file
    } catch (error) {
      console.error(`❌ Failed to create file ${name}:`, error)
      throw error
    }
  }

  async deleteFile(id: File["id"]): Promise<boolean> {
    try {
      const doc = await this.db.get<FileDoc>(docIdMap.file.toDoc(id))
      if (!doc) return false

      await this.db.remove(doc)

      console.log(`🗑️ Deleted file: ${id}`)
      return true
    } catch (error: any) {
      if (error?.status === 404) {
        console.warn(`⚠️ File not found for deletion: ${id}`)
        return false
      }

      console.error(`❌ Failed to delete file ${id}:`, error)
      return false
    }
  }

  async getFileWithAttachment(id: File["id"]): Promise<FileDoc | null> {
    try {
      console.log(`🔍 Fetching file with attachment: ${id}`)

      const doc = await this.db.get<FileDoc>(docIdMap.file.toDoc(id), {
        attachments: true,
        binary: false, // Get as base64 string, not Blob
      })

      console.log(`📄 File doc retrieved:`, {
        id: doc._id,
        name: doc.name,
        mimeType: doc.mimeType,
        size: doc.size,
      })

      return doc
    } catch (error: any) {
      if (error?.status === 404) {
        console.warn(`[FILES] File not found: ${id}`)
        return null
      }
      console.error(`[FILES] Failed to get file with attachment ${id}:`, error)
      throw error
    }
  }
}
