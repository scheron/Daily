import {sniffImageExt} from "@daily/core/utils/files/sniffImageExt"

import {indexExistingAsset} from "../../../assets/AssetStore"
import {AgentToolError} from "../../../errors/agent/AgentToolError"
import {AgentToolErrorCode} from "../../../errors/agent/AgentToolErrorCode"
import {fileAssetName} from "../../attachments"
import {requireString} from "../input"

import type {AgentTool} from "../types"

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

/** `save_attachment`'s own answer shape: the file's metadata plus the link ready to paste into a task's text. */
export type AgentSavedAttachment = {id: string; name: string; mimeType: string; size: number; url: string}

export const saveAttachmentTool: AgentTool = {
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
      throw new AgentToolError(
        AgentToolErrorCode.ATTACHMENT_TOO_LARGE,
        `"${name}" is ${bytes.length} bytes, over the ${MAX_ATTACHMENT_BYTES}-byte cap.`,
      )
    }

    if (!sniffImageExt(bytes)) {
      throw new AgentToolError(AgentToolErrorCode.ATTACHMENT_NOT_AN_IMAGE, `"${name}" is not a recognisable image.`)
    }

    const {file, ext} = await ctx.core.filesService.prepareFile(name, bytes)

    ctx.afterCommit(async () => {
      await ctx.core.filesService.writeFileAsset(file.id, ext, bytes)
      indexExistingAsset(ctx.store, fileAssetName(file), ctx.agent.deviceId)
    })

    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      url: ctx.core.filesService.getFilePath(file.id),
    } satisfies AgentSavedAttachment
  },
}
