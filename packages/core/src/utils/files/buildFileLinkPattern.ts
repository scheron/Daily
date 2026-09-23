import {APP_CONFIG} from "@daily/protocol"

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const ESCAPED_PROTOCOL = escapeRegExpLiteral(APP_CONFIG.filesProtocol)

/**
 * Builds the regex for a markdown image link to a file, e.g. `![alt](daily://file/<id>)` — the
 * one place the link's shape and its protocol escaping are written.
 * @param fileId Omit to capture any id (`extractFileIds`'s reading); pass one file's id, escaped
 * as a literal, to match only that file's link (`removeFileLink`'s removal)
 * @returns A global `RegExp` over the link
 */
export function buildFileLinkPattern(fileId?: string): RegExp {
  const idPart = fileId === undefined ? "([a-zA-Z0-9_-]+)" : escapeRegExpLiteral(fileId)

  return new RegExp(`!\\[[^\\]]*\\]\\(\\s*${ESCAPED_PROTOCOL}\\/${idPart}\\s*\\)`, "g")
}
