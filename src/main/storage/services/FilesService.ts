import path from "node:path"
import {nanoid} from "nanoid"

import {extractFileIds} from "@/utils/files/extractFileIds"
import {getMimeType} from "@/utils/files/getMimeType"
import {logger} from "@/utils/logger"

import {APP_CONFIG} from "@/config"

import type {FileModel} from "@/storage/models/FileModel"
import type {TaskModel} from "@/storage/models/TaskModel"
import type {File} from "@shared/types/storage"

export class FilesService {
  constructor(
    private fileModel: FileModel,
    private taskModel: TaskModel,
  ) {}

  async saveFile(filename: string, data: Buffer): Promise<File["id"]> {
    const fileId = nanoid()
    const ext = path.extname(filename).slice(1)
    const mimeType = getMimeType(ext)

    await this.fileModel.saveAsset(fileId, ext, data)
    const file = this.fileModel.createFile(fileId, filename, mimeType, data.length)

    if (!file) {
      throw new Error(`Failed to save file: ${filename}`)
    }

    return file.id
  }

  getFilePath(id: File["id"]): string {
    return `${APP_CONFIG.filesProtocol}/${id}`
  }

  async deleteFile(fileId: File["id"]): Promise<boolean> {
    const file = this.fileModel.getFile(fileId)
    if (file) {
      const ext = path.extname(file.name).slice(1)
      await this.fileModel.deleteAsset(fileId, ext)
    }
    return this.fileModel.deleteFile(fileId)
  }

  async getFiles(fileIds: File["id"][]): Promise<File[]> {
    return this.fileModel.getFiles(fileIds)
  }

  async createFileResponse(id: File["id"]): Promise<Response> {
    try {
      const file = this.fileModel.getFile(id)

      if (!file) {
        logger.warn(logger.CONTEXT.FILES, `File not found: ${id}`)
        return new Response("File not found", {
          status: 404,
          headers: {"Content-Type": "text/plain"},
        })
      }

      if (file.deletedAt !== null) {
        logger.warn(logger.CONTEXT.FILES, `File is deleted: ${id}`)
        return new Response("File not found", {
          status: 404,
          headers: {"Content-Type": "text/plain"},
        })
      }

      const ext = path.extname(file.name).slice(1)
      const buffer = await this.fileModel.readAssetBuffer(id, ext)

      logger.debug(logger.CONTEXT.FILES, `File response created: ${file.mimeType}, ${buffer.length} bytes`)

      return new Response(buffer as any, {
        headers: {
          "Content-Type": file.mimeType || "application/octet-stream",
          "Content-Length": buffer.length.toString(),
        },
      })
    } catch (error: any) {
      logger.error(logger.CONTEXT.FILES, `Failed to get file ${id}`, error)
      return new Response("File not found", {status: 404, headers: {"Content-Type": "text/plain"}})
    }
  }

  async cleanupOrphanFiles(): Promise<void> {
    try {
      // Get file IDs referenced in task_attachments
      const referencedIds = this.fileModel.getReferencedFileIds()

      // Also scan task content for inline image references
      const tasks = this.taskModel.getTaskList()
      for (const task of tasks) {
        const fileIds = extractFileIds(task.content)
        fileIds.forEach((id) => referencedIds.add(id))
        task.attachments.forEach((id) => referencedIds.add(id))
      }

      // Find and soft-delete unreferenced file metadata
      const allFiles = this.fileModel.getFileList()
      const orphans = allFiles.filter((file) => file.deletedAt === null && !referencedIds.has(file.id))

      for (const orphan of orphans) {
        const ext = path.extname(orphan.name).slice(1)
        await this.fileModel.deleteAsset(orphan.id, ext)
        this.fileModel.deleteFile(orphan.id)
      }

      // Clean up orphan asset files on disk
      await this.fileModel.cleanupOrphanAssets(referencedIds)

      logger.info(logger.CONTEXT.FILES, `Removed ${orphans.length} orphan files`)
    } catch (err) {
      logger.error(logger.CONTEXT.FILES, "Failed to cleanup orphan files", err)
    }
  }
}
