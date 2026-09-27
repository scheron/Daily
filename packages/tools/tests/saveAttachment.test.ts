import {afterEach, describe, expect, it} from "vitest"

import {ToolError} from "../src/errors/ToolError"
import {saveAttachmentTool} from "../src/write/saveAttachment"
import {makeRealWorkspace} from "./helpers/realWorkspace"

const ONE_PIXEL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

describe("save_attachment — awaits its own byte write", () => {
  let db: {close(): void} | undefined

  afterEach(() => {
    db?.close()
  })

  it("does not answer until afterSave's effect has actually run", async () => {
    const {db: realDb, ctx} = makeRealWorkspace()
    db = realDb

    let effectRan = false
    ctx.files.afterSave = async (_file, effect) => {
      await effect()
      effectRan = true
    }

    await saveAttachmentTool.run({name: "shot.png", dataBase64: ONE_PIXEL_PNG_BASE64}, ctx)

    expect(effectRan).toBe(true)
  })

  it("turns a failed write into a ToolError instead of an unhandled rejection", async () => {
    const {db: realDb, ctx} = makeRealWorkspace()
    db = realDb

    ctx.files.afterSave = async () => {
      throw new Error("disk is full")
    }

    await expect(saveAttachmentTool.run({name: "shot.png", dataBase64: ONE_PIXEL_PNG_BASE64}, ctx)).rejects.toThrow(ToolError)
  })
})
