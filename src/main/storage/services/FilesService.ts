import path from "node:path"

import type {File, Task} from "../../types.js"
import type {FileModel} from "../models/FileModel.js"

import {APP_CONFIG} from "../../config.js"
import {forEachAsync} from "../../utils/arrays.js"
import {extractFileIds, getMimeType} from "../../utils/file.js"

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
    return this.fileModel.getFiles(fileIds)
  }

  /**
   * Create HTTP Response object for protocol handler.
   * Used for protocol handler to get file data to frontend.
   */
  async createFileResponse(id: File["id"]): Promise<Response> {
    try {
      const doc = await this.fileModel.getFileWithAttachment(id)

      if (!doc) {
        console.error(`❌ File not found: ${id}`)
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

      console.log(`✅ File response created:`, {
        contentType: attachment.content_type,
        bufferSize: buffer.length,
      })

      const response = new Response(buffer as any, {
        headers: {
          "Content-Type": attachment.content_type || "application/octet-stream",
          "Content-Length": buffer.length.toString(),
        },
      })

      return response
    } catch (error: any) {
      if (error?.status === 404) {
        console.error(`❌ File not found: ${id}`)
        return new Response("File not found", {status: 404, headers: {"Content-Type": "text/plain"}})
      }

      console.error(`❌ Failed to get file ${id}:`, error)
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

      const orphans = allFiles.filter((file) => !referenced.has(file.id))

      await forEachAsync(orphans, (orphan) => {
        this.fileModel.deleteFile(orphan.id)
      })

      console.log(`🗑️ Removed ${orphans.length} orphan files`)
    } catch (err) {
      console.error("❌ Failed to cleanup orphan files:", err)
    }
  }
}
