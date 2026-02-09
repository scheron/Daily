import path from "node:path"

import {forEachParallel} from "@shared/utils/arrays/forEachParallel"
import {extractFileIds} from "@/utils/files/extractFileIds"
import {getMimeType} from "@/utils/files/getMimeType"
import {logger} from "@/utils/logger"

import {APP_CONFIG} from "@/config"

import type {FileModel} from "@/storage/models/FileModel"
import type {File, Task} from "@shared/types/storage"

export class FilesService {
  constructor(private fileModel: FileModel) {}

  async saveFile(filename: string, data: Buffer): Promise<File["id"]> {
    const extension = path.extname(filename).slice(1)
    const mimeType = getMimeType(extension)

    const size = data.length
    const file = await this.fileModel.createFile(filename, mimeType, size, data)

    if (!file) {
      throw new Error(`Failed to save file: ${filename}`)
    }

    return file.id
  }

  getFilePath(id: File["id"]): string {
    return `${APP_CONFIG.filesProtocol}/${id}`
  }

  async deleteFile(fileId: File["id"]): Promise<boolean> {
    return this.fileModel.deleteFile(fileId)
  }

  async getFiles(fileIds: File["id"][]): Promise<File[]> {
    return await this.fileModel.getFiles(fileIds)
  }

  /**
   * Create HTTP Response object for protocol handler.
   * Used for protocol handler to get file data to frontend.
   */
  async createFileResponse(id: File["id"]): Promise<Response> {
    try {
      const doc = await this.fileModel.getFileWithAttachment(id)

      if (!doc) {
        logger.warn(logger.CONTEXT.FILES, `File not found: ${id}`)
        return new Response("File not found", {
          status: 404,
          headers: {"Content-Type": "text/plain"},
        })
      }

      // Return 404 if file is soft-deleted
      if (doc.deletedAt !== null) {
        logger.warn(logger.CONTEXT.FILES, `File is deleted: ${id}`)
        return new Response("File not found", {
          status: 404,
          headers: {"Content-Type": "text/plain"},
        })
      }

      const attachment = doc._attachments?.data
      if (!attachment) {
        throw new Error(`File ${id} has no attachment data`)
      }

      const base64Data = typeof attachment.data === "string" ? attachment.data : ""
      const buffer = Buffer.from(base64Data, "base64")

      logger.debug(logger.CONTEXT.FILES, `File response created: ${attachment.content_type}, ${buffer.length} bytes`)

      const response = new Response(buffer as any, {
        headers: {
          "Content-Type": attachment.content_type || "application/octet-stream",
          "Content-Length": buffer.length.toString(),
        },
      })

      return response
    } catch (error: any) {
      if (error?.status === 404) {
        logger.warn(logger.CONTEXT.FILES, `File not found: ${id}`)
        return new Response("File not found", {status: 404, headers: {"Content-Type": "text/plain"}})
      }

      logger.error(logger.CONTEXT.FILES, `Failed to get file ${id}`, error)
      throw error
    }
  }

  async cleanupOrphanFiles(tasks: Task[]): Promise<void> {
    try {
      const referenced = new Set<File["id"]>()

      for (const task of tasks) {
        const fileIds = extractFileIds(task.content)

        fileIds.forEach((id) => referenced.add(id))
        task.attachments.forEach((id) => referenced.add(id))
      }

      const allFiles = await this.fileModel.getFileList()

      // Only consider non-deleted files as orphans
      const orphans = allFiles.filter((file) => file.deletedAt === null && !referenced.has(file.id))

      await forEachParallel(orphans, async (orphan) => {
        await this.fileModel.deleteFile(orphan.id)
      })

      logger.info(logger.CONTEXT.FILES, `Removed ${orphans.length} orphan files`)
    } catch (err) {
      logger.error(logger.CONTEXT.FILES, "Failed to cleanup orphan files", err)
    }
  }
}
