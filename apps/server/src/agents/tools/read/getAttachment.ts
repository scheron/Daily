import {readFile} from "node:fs/promises"

import {assetPath} from "../../../assets/AssetStore"
import {AgentToolError} from "../../../errors/agent/AgentToolError"
import {AgentToolErrorCode} from "../../../errors/agent/AgentToolErrorCode"
import {fileAssetName, isAssetOnServer} from "../../attachments"
import {requireString} from "../input"

import type {AgentTool} from "../types"

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

export const getAttachmentTool: AgentTool = {
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

    const [file] = await ctx.core.filesService.getFiles([id])
    if (!file || file.deletedAt !== null) {
      throw new AgentToolError(AgentToolErrorCode.ATTACHMENT_UNAVAILABLE, `No attachment "${id}" is available on this server.`)
    }

    if (!file.mimeType.startsWith("image/")) {
      throw new AgentToolError(AgentToolErrorCode.ATTACHMENT_NOT_AN_IMAGE, `Attachment "${id}" is not an image.`)
    }

    const assetName = fileAssetName(file)
    if (!isAssetOnServer(ctx.store, assetName)) {
      throw new AgentToolError(AgentToolErrorCode.ATTACHMENT_UNAVAILABLE, `No attachment "${id}" is available on this server.`)
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new AgentToolError(
        AgentToolErrorCode.ATTACHMENT_TOO_LARGE,
        `Attachment "${id}" is ${file.size} bytes, over this tool's ${MAX_ATTACHMENT_BYTES}-byte cap.`,
      )
    }

    const bytes = await readFile(assetPath(ctx.store, assetName))

    return {id: file.id, name: file.name, mimeType: file.mimeType, size: file.size, dataBase64: bytes.toString("base64")}
  },
}
