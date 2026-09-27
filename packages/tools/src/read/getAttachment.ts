import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {requireString} from "../input"

import type {Tool} from "../types"

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

/** `get_attachment`'s own answer shape: one file's bytes, base64-encoded, with the metadata that names it. */
export type ToolAttachment = {id: string; name: string; mimeType: string; size: number; dataBase64: string}

export const getAttachmentTool: Tool = {
  name: "get_attachment",
  description: "Answers one image's bytes, base64-encoded, by its file id. Refuses a non-image file and anything over 5 MiB.",
  mode: "read",
  inputSchema: {
    type: "object",
    properties: {id: {type: "string", description: "The file id, from a task's attachments."}},
    required: ["id"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const id = requireString(input, "id")

    const [file] = await ctx.workStorage.getFiles([id])
    if (!file || file.deletedAt !== null) {
      throw new ToolError(ToolErrorCode.ATTACHMENT_UNAVAILABLE, `No attachment "${id}" is available.`)
    }

    if (!file.mimeType.startsWith("image/")) {
      throw new ToolError(ToolErrorCode.ATTACHMENT_NOT_AN_IMAGE, `Attachment "${id}" is not an image.`)
    }

    if (!(await ctx.files.isPresent(file))) {
      throw new ToolError(ToolErrorCode.ATTACHMENT_UNAVAILABLE, `No attachment "${id}" is available.`)
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new ToolError(
        ToolErrorCode.ATTACHMENT_TOO_LARGE,
        `Attachment "${id}" is ${file.size} bytes, over this tool's ${MAX_ATTACHMENT_BYTES}-byte cap.`,
      )
    }

    const bytes = await ctx.files.read(file)

    return {id: file.id, name: file.name, mimeType: file.mimeType, size: file.size, dataBase64: bytes.toString("base64")} satisfies ToolAttachment
  },
}
