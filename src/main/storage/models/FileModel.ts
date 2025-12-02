import {nanoid} from "nanoid"

import {LogContext, logger} from "@/utils/logger"
import {withRetryOnConflict} from "@/utils/withRetryOnConflict"

import {docIdMap, docToFile, fileToDoc} from "./_mappers"

import type {FileDoc} from "@/types/database"
import type {File} from "@shared/types/storage"

export class FileModel {
  constructor(private db: PouchDB.Database) {}

  async getFileList({includeDeleted = false}: {includeDeleted?: boolean} = {}): Promise<File[]> {
    try {
      const result = (await this.db.find({selector: {type: "file"}})) as PouchDB.Find.FindResponse<FileDoc>

      logger.info(LogContext.FILES, `Loaded ${result.docs.length} files from database`)
      return result.docs.map(docToFile).filter((file) => !includeDeleted && !file.deletedAt)
    } catch (error) {
      logger.error(LogContext.FILES, "Failed to load files from database", error)
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
          logger.error(LogContext.FILES, `Failed to get file ${row.key}`, row.error)
          continue
        }

        if (row.doc) files.push(docToFile(row.doc))
      }

      logger.debug(LogContext.FILES, `Retrieved ${files.length}/${ids.length} files`)
      return files
    } catch (error) {
      logger.error(LogContext.FILES, "Failed to get files", error)
      throw error
    }
  }

  async createFile(name: string, mimeType: string, size: number, data: Buffer): Promise<File | null> {
    try {
      const now = new Date().toISOString()

      const file: File & {fileBuffer: Buffer} = {
        id: nanoid(),
        name,
        mimeType,
        size,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        fileBuffer: data,
      }

      const putResult = await this.db.put(fileToDoc(file))

      logger.storage("Created", "file", file.id)
      logger.debug(LogContext.FILES, `File rev: ${putResult.rev}`)

      return file
    } catch (error) {
      logger.error(LogContext.FILES, `Failed to create file ${name}`, error)
      throw error
    }
  }

  async deleteFile(id: File["id"]): Promise<boolean> {
    const isDeleted = await withRetryOnConflict("[FILE]", async (attempt) => {
      try {
        const doc = await this.db.get<FileDoc>(docIdMap.file.toDoc(id))
        if (!doc) return false

        const now = new Date().toISOString()
        const deletedDoc: FileDoc = {
          ...doc,
          deletedAt: now,
          updatedAt: now,
        }

        const res = await this.db.put(deletedDoc)

        if (!res.ok) {
          return false
        }

        logger.storage("Deleted", "file", id)
        logger.debug(LogContext.FILES, `File rev: ${res.rev}, attempt: ${attempt + 1}`)
        return true
      } catch (error: any) {
        if (error?.status === 404) {
          logger.warn(LogContext.FILES, `File not found for deletion: ${id}`)
          return false
        }

        logger.error(LogContext.FILES, `Failed to delete file ${id}`, error)
        return false
      }
    })
    return Boolean(isDeleted)
  }

  async getFileWithAttachment(id: File["id"]): Promise<FileDoc | null> {
    try {
      logger.debug(LogContext.FILES, `Fetching file with attachment: ${id}`)

      const doc = await this.db.get<FileDoc>(docIdMap.file.toDoc(id), {
        attachments: true,
        binary: false, // Get as base64 string, not Blob
      })

      logger.debug(LogContext.FILES, `File doc retrieved: ${doc.name} (${doc.size} bytes)`)

      return doc
    } catch (error: any) {
      if (error?.status === 404) {
        logger.warn(LogContext.FILES, `File not found: ${id}`)
        return null
      }
      logger.error(LogContext.FILES, `Failed to get file with attachment ${id}`, error)
      throw error
    }
  }
}
