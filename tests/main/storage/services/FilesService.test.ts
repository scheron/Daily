// @ts-nocheck
import {mkdtempSync, rmSync} from "node:fs"
import {readdir} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {FileModel} from "@main/storage/models/FileModel"
import {TaskModel} from "@main/storage/models/TaskModel"
import {FilesService} from "@main/storage/services/FilesService"
import {createTestDatabase} from "../../../helpers/db"

vi.mock("@main/utils/logger", () => ({
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

const WEBP_BYTES = Buffer.from([
  0x52,
  0x49,
  0x46,
  0x46, // "RIFF" at offset 0
  0x00,
  0x00,
  0x00,
  0x00, // chunk size, arbitrary
  0x57,
  0x45,
  0x42,
  0x50, // "WEBP" at offset 8
])

describe("FilesService.saveFile", () => {
  let db, assetsDir, fileModel, filesService

  beforeEach(() => {
    db = createTestDatabase()
    assetsDir = mkdtempSync(join(tmpdir(), "files-service-"))
    fileModel = new FileModel(db, assetsDir)
    filesService = new FilesService(fileModel, new TaskModel(db))
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

  it("serves_TC-8_correct_content_type_and_bytes_then_removes_the_asset_on_delete", async () => {
    const fileId = await filesService.saveFile("Screenshot.png", WEBP_BYTES)

    const response = await filesService.createFileResponse(fileId)
    expect(response.headers.get("Content-Type")).toBe("image/webp")

    const responseBytes = Buffer.from(await response.arrayBuffer())
    expect(responseBytes.equals(WEBP_BYTES)).toBe(true)

    await filesService.deleteFile(fileId)

    const diskFiles = await readdir(assetsDir)
    expect(diskFiles).not.toContain(`${fileId}.webp`)
  })
})
