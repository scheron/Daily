import {sniffImageExt} from "@daily/core/utils/files/sniffImageExt"

import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {requireString} from "../input"

import type {Tool} from "../types"

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

/** `save_attachment`'s own answer shape: the file's metadata plus the link ready to paste into a task's text. */
export type ToolSavedAttachment = {id: string; name: string; mimeType: string; size: number; url: string}

export const saveAttachmentTool: Tool = {
  name: "save_attachment",
  description:
    "Saves one image's bytes, base64-encoded, and answers a link ready to paste into a task's text (as Markdown, e.g. \"![shot](url)\"). Refuses a non-image file and anything over 5 MiB.",
  mode: "write",
  inputSchema: {
    type: "object",
    properties: {
      name: {type: "string", description: "A filename for the image."},
      dataBase64: {type: "string", description: "The image's bytes, base64-encoded."},
    },
    required: ["name", "dataBase64"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const name = requireString(input, "name")
    const dataBase64 = requireString(input, "dataBase64")
    const bytes = Buffer.from(dataBase64, "base64")

    if (bytes.length > MAX_ATTACHMENT_BYTES) {
      throw new ToolError(ToolErrorCode.ATTACHMENT_TOO_LARGE, `"${name}" is ${bytes.length} bytes, over the ${MAX_ATTACHMENT_BYTES}-byte cap.`)
    }

    if (!sniffImageExt(bytes)) {
      throw new ToolError(ToolErrorCode.ATTACHMENT_NOT_AN_IMAGE, `"${name}" is not a recognisable image.`)
    }

    const {file, ext} = await ctx.workStorage.prepareFile(name, bytes)

    try {
      await ctx.files.afterSave(file, () => ctx.workStorage.writeFileAsset(file.id, ext, bytes))
    } catch (error) {
      throw new ToolError(ToolErrorCode.INTERNAL, `"${name}" could not be saved: ${error instanceof Error ? error.message : String(error)}`)
    }

    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      url: ctx.workStorage.getFilePath(file.id),
    } satisfies ToolSavedAttachment
  },
}
