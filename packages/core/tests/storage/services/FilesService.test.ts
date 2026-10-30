// @ts-nocheck
import {mkdtempSync, rmSync} from "node:fs"
import {readdir, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {APP_CONFIG, createEntityId} from "@daily/protocol"

import {FileModel} from "@core/storage/models/FileModel"
import {SubtaskModel} from "@core/storage/models/SubtaskModel"
import {TaskCommentModel} from "@core/storage/models/TaskCommentModel"
import {TaskModel} from "@core/storage/models/TaskModel"
import {FilesService} from "@core/storage/services/FilesService"
import {createTestDatabase} from "../../helpers/db"

vi.mock("../../../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    storage: vi.fn(),
    lifecycle: vi.fn(),
    CONTEXT: {FILES: "FILES"},
  },
}))

const WEBP_BYTES = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])

describe("FilesService.saveFile", () => {
  let db, assetsDir, fileModel, filesService

  beforeEach(() => {
    db = createTestDatabase()
    assetsDir = mkdtempSync(join(tmpdir(), "files-service-"))
    fileModel = new FileModel(db, assetsDir)
    filesService = new FilesService(fileModel, new TaskModel(db), new SubtaskModel(db), new TaskCommentModel(db))
  })

  afterEach(() => {
    db.close()
    rmSync(assetsDir, {recursive: true, force: true})
  })

  it("saves_TC-6_extension_name_and_mime_from_the_bytes_not_the_filename", async () => {
    const fileId = await filesService.saveFile("Screenshot.png", WEBP_BYTES)

    const file = fileModel.getFile(fileId)
    expect(file.name).toBe("Screenshot.webp")
    expect(file.mimeType).toBe("image/webp")
    expect(file.size).toBe(WEBP_BYTES.length)

    const diskFiles = await readdir(assetsDir)
    expect(diskFiles).toContain(`${fileId}.webp`)
    expect(diskFiles).not.toContain(`${fileId}.png`)
  })

  it("keeps_TC-7_prior_name_derived_behavior_when_bytes_are_unrecognized", async () => {
    const unrecognizedBytes = Buffer.from("%PDF-1.4 this is plain text, not a recognized image signature")

    const fileId = await filesService.saveFile("notes.pdf", unrecognizedBytes)

    const file = fileModel.getFile(fileId)
    expect(file.name).toBe("notes.pdf")
    expect(file.mimeType).toBe("application/octet-stream")

    const diskFiles = await readdir(assetsDir)
    expect(diskFiles).toContain(`${fileId}.pdf`)
  })

  it("serves_TC-8_correct_content_type_and_bytes_then_keeps_the_asset_on_disk_after_a_soft_delete", async () => {
    const fileId = await filesService.saveFile("Screenshot.png", WEBP_BYTES)

    const response = await filesService.createFileResponse(fileId)
    expect(response.headers.get("Content-Type")).toBe("image/webp")

    const responseBytes = Buffer.from(await response.arrayBuffer())
    expect(responseBytes.equals(WEBP_BYTES)).toBe(true)

    await filesService.deleteFile(fileId)

    expect(fileModel.getFile(fileId)?.deletedAt).not.toBeNull()
    const diskFiles = await readdir(assetsDir)
    expect(diskFiles).toContain(`${fileId}.webp`)
  })
})

describe("FilesService.resolveAssetPath", () => {
  let db, assetsDir, fileModel, filesService

  beforeEach(() => {
    db = createTestDatabase()
    assetsDir = mkdtempSync(join(tmpdir(), "daily-files-service-"))
    fileModel = new FileModel(db, assetsDir)
    fileModel.initAssets()
    filesService = new FilesService(fileModel, new TaskModel(db), new SubtaskModel(db), new TaskCommentModel(db))
  })

  afterEach(() => {
    db.close()
    rmSync(assetsDir, {recursive: true, force: true})
  })

  it("TC-7: resolves the absolute disk path for a file whose asset exists, built from the test's own assetsDir", async () => {
    const id = await filesService.saveFile("image.png", Buffer.from("pixel"))

    const resolved = await filesService.resolveAssetPath(id)

    expect(resolved).toBe(join(assetsDir, `${id}.png`))
  })

  it("TC-8: returns null when no file record matches the id", async () => {
    const resolved = await filesService.resolveAssetPath("does-not-exist")

    expect(resolved).toBeNull()
  })

  it("TC-9: returns null when the file record exists but its asset is missing on disk", async () => {
    const file = fileModel.createFile("ghost-file", "ghost.png", "image/png", 10)

    const resolved = await filesService.resolveAssetPath(file.id)

    expect(resolved).toBeNull()
  })
})

describe("FilesService.cleanupOrphanFiles", () => {
  let db, assetsDir, fileModel, taskModel, subtaskModel, taskCommentModel, filesService

  beforeEach(() => {
    db = createTestDatabase()
    assetsDir = mkdtempSync(join(tmpdir(), "files-service-gc-"))
    fileModel = new FileModel(db, assetsDir)
    taskModel = new TaskModel(db)
    subtaskModel = new SubtaskModel(db)
    taskCommentModel = new TaskCommentModel(db)
    filesService = new FilesService(fileModel, taskModel, subtaskModel, taskCommentModel)
  })

  afterEach(() => {
    db.close()
    rmSync(assetsDir, {recursive: true, force: true})
  })

  function makeTaskRow(overrides = {}) {
    return {
      id: createEntityId("task"),
      status: "in_progress",
      content: "",
      minimized: false,
      priority: "none",
      orderIndex: 1,
      scheduled: {date: "2026-01-01", time: "09:00:00", timezone: "UTC"},
      estimatedTime: 0,
      spentTime: 0,
      branchId: "main",
      milestoneId: null,
      tags: [],
      attachments: [],
      deletedAt: null,
      ...overrides,
    }
  }

  function makeCommentInput(task, overrides = {}) {
    return {
      taskId: task.id,
      branchId: task.branchId,
      content: "",
      kind: "manual",
      provider: null,
      ...overrides,
    }
  }

  it("keeps_TC-9_a_file_held_only_by_a_text_link_once_task_attachments_is_gone_and_soft-deletes_one_with_no_link_at_all", async () => {
    const linkedId = await filesService.saveFile("kept.png", WEBP_BYTES)
    const orphanId = await filesService.saveFile("gone.png", WEBP_BYTES)

    taskModel.createTask(makeTaskRow({content: `Kept ![kept](${APP_CONFIG.filesProtocol}/${linkedId})`}))

    db.exec(`DROP INDEX IF EXISTS idx_task_attachments_file; DROP TABLE IF EXISTS task_attachments;`)

    await filesService.cleanupOrphanFiles()

    expect(fileModel.getFile(linkedId)?.deletedAt).toBeNull()
    expect(await readdir(assetsDir)).toContain(`${linkedId}.webp`)

    expect(fileModel.getFile(orphanId)?.deletedAt).not.toBeNull()
    expect(await readdir(assetsDir)).toContain(`${orphanId}.webp`)
  })

  it("keeps_TC-11_an_image_referenced_only_by_a_backlog_tasks_text_and_one_referenced_only_by_a_trashed_tasks_text", async () => {
    const backlogFileId = await filesService.saveFile("backlog.png", WEBP_BYTES)
    const trashedFileId = await filesService.saveFile("trashed.png", WEBP_BYTES)

    taskModel.createTask(makeTaskRow({content: `Someday ![shot](${APP_CONFIG.filesProtocol}/${backlogFileId})`, status: "backlog", scheduled: null}))
    const trashed = taskModel.createTask(makeTaskRow({content: `Gone ![shot](${APP_CONFIG.filesProtocol}/${trashedFileId})`}))
    taskModel.deleteTask(trashed.id)

    await filesService.cleanupOrphanFiles()

    expect(fileModel.getFile(backlogFileId)?.deletedAt).toBeNull()
    expect(await readdir(assetsDir)).toContain(`${backlogFileId}.webp`)

    expect(fileModel.getFile(trashedFileId)?.deletedAt).toBeNull()
    expect(await readdir(assetsDir)).toContain(`${trashedFileId}.webp`)
  })

  it("keeps_an_image_referenced_only_by_a_subtask_even_after_its_task_is_soft-deleted", async () => {
    const subtaskFileId = await filesService.saveFile("sub.png", WEBP_BYTES)
    const orphanId = await filesService.saveFile("gone.png", WEBP_BYTES)
    const task = taskModel.createTask(makeTaskRow())
    subtaskModel.createSubtask({taskId: task.id, content: `Shot ![shot](${APP_CONFIG.filesProtocol}/${subtaskFileId})`, orderKey: "i"})
    taskModel.deleteTask(task.id)

    await filesService.cleanupOrphanFiles()

    expect(fileModel.getFile(subtaskFileId)?.deletedAt).toBeNull()
    expect(fileModel.getFile(orphanId)?.deletedAt).not.toBeNull()
  })

  it("keeps_a_soft-deleted_files_bytes_and_sweeps_only_bytes_with_no_row_at_all", async () => {
    const softDeletedId = await filesService.saveFile("gone-soft.png", WEBP_BYTES)
    await filesService.deleteFile(softDeletedId)

    await writeFile(join(assetsDir, "no-row-at-all.webp"), WEBP_BYTES)

    await filesService.cleanupOrphanFiles()

    expect(await readdir(assetsDir)).toContain(`${softDeletedId}.webp`)
    expect(await readdir(assetsDir)).not.toContain("no-row-at-all.webp")
  })

  it("serves_an_image_referenced_only_by_a_comment_after_orphan_cleanup", async () => {
    const fileId = await filesService.saveFile("comment.png", WEBP_BYTES)
    const task = taskModel.createTask(makeTaskRow())
    taskCommentModel.createComment(makeCommentInput(task, {content: `![comment image](${APP_CONFIG.filesProtocol}/${fileId})`}))

    await filesService.cleanupOrphanFiles()

    const response = await filesService.createFileResponse(fileId)
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("image/webp")
    expect(Buffer.from(await response.arrayBuffer())).toEqual(WEBP_BYTES)
    expect(fileModel.getFile(fileId)?.deletedAt).toBeNull()
  })

  it.each([
    {name: "a backlog task", backlog: true, deletedTask: false, deletedComment: false},
    {name: "a trashed task", backlog: false, deletedTask: true, deletedComment: false},
    {name: "a soft-deleted comment", backlog: false, deletedTask: false, deletedComment: true},
  ])("keeps_an_image_referenced_only_by_a_comment_in_$name", async ({backlog, deletedTask, deletedComment}) => {
    const fileId = await filesService.saveFile("retained-comment.png", WEBP_BYTES)
    const task = taskModel.createTask(makeTaskRow(backlog ? {status: "backlog", scheduled: null} : {}))
    const comment = taskCommentModel.createComment(makeCommentInput(task, {content: `![retained image](${APP_CONFIG.filesProtocol}/${fileId})`}))
    if (deletedComment) taskCommentModel.deleteComment(comment.id)
    if (deletedTask) taskModel.deleteTask(task.id)

    await filesService.cleanupOrphanFiles()

    expect(fileModel.getFile(fileId)?.deletedAt).toBeNull()
    expect((await filesService.createFileResponse(fileId)).status).toBe(200)
  })

  it("soft-deletes_an_image_after_its_last_comment_reference_is_removed", async () => {
    const fileId = await filesService.saveFile("removed-comment.png", WEBP_BYTES)
    const task = taskModel.createTask(makeTaskRow())
    const comment = taskCommentModel.createComment(makeCommentInput(task, {content: `![removed image](${APP_CONFIG.filesProtocol}/${fileId})`}))
    taskCommentModel.updateComment(comment.id, "Image removed")

    await filesService.cleanupOrphanFiles()

    expect(fileModel.getFile(fileId)?.deletedAt).not.toBeNull()
    expect((await filesService.createFileResponse(fileId)).status).toBe(404)
    expect(await readdir(assetsDir)).toContain(`${fileId}.webp`)
  })

  it("does_not_restore_a_soft-deleted_file_that_a_comment_still_references", async () => {
    const fileId = await filesService.saveFile("deleted-comment.png", WEBP_BYTES)
    const task = taskModel.createTask(makeTaskRow())
    taskCommentModel.createComment(makeCommentInput(task, {content: `![deleted image](${APP_CONFIG.filesProtocol}/${fileId})`}))
    await filesService.deleteFile(fileId)
    const deletedFile = fileModel.getFile(fileId)

    await filesService.cleanupOrphanFiles()

    expect(fileModel.getFile(fileId)).toEqual(deletedFile)
    expect((await filesService.createFileResponse(fileId)).status).toBe(404)
    expect(await readdir(assetsDir)).toContain(`${fileId}.webp`)
  })
})
