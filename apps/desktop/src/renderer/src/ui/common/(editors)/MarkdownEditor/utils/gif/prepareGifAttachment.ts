import {Buffer} from "buffer"

import {blobToBuffer} from "../blobToBuffer"

export async function prepareGifAttachment(file: File) {
  const signature = await file.slice(0, 6).text()
  if (signature !== "GIF89a" && signature !== "GIF87a") return null

  const buffer = await blobToBuffer(file)
  if (buffer.length < 13) throw new Error("Incomplete GIF header")

  const width = buffer.readUInt16LE(6)
  const height = buffer.readUInt16LE(8)
  if (width === 0 || height === 0) throw new Error("Invalid GIF dimensions")

  const blocksStart = 13 + colorTableSize(buffer[10])
  let offset = blocksStart
  let frameCount = 0
  let hasLoop = false

  while (offset < buffer.length) {
    const blockType = buffer[offset++]

    if (blockType === 0x3b && frameCount > 0) {
      if (frameCount === 1 || hasLoop) return {buffer, width, height}

      const loopExtension = Buffer.from("\x21\xff\x0bNETSCAPE2.0\x03\x01\x00\x00\x00", "latin1")
      // Application extensions require GIF89a.
      buffer.write("89a", 3)
      return {buffer: Buffer.concat([buffer.slice(0, blocksStart), loopExtension, buffer.slice(blocksStart)]), width, height}
    }

    if (blockType === 0x21) {
      const extensionType = buffer[offset++]
      if (extensionType === 0xff && buffer[offset] === 11) {
        const application = buffer.toString("latin1", offset + 1, offset + 12)
        if (application === "NETSCAPE2.0" || application === "ANIMEXTS1.0") {
          const loopBlock = offset + 12
          if (buffer[loopBlock] === 3 && buffer[loopBlock + 1] === 1) {
            buffer.writeUInt16LE(0, loopBlock + 2)
            hasLoop = true
          }
        }
      }
      offset = skipSubBlocks(offset)
      continue
    }

    if (blockType === 0x2c && offset + 9 < buffer.length) {
      const imageDataStart = offset + 9 + colorTableSize(buffer[offset + 8])
      offset = skipSubBlocks(imageDataStart + 1)
      frameCount++
      continue
    }

    throw new Error("Invalid GIF block")
  }

  throw new Error("Missing GIF trailer")

  function skipSubBlocks(start: number): number {
    let cursor = start
    while (cursor < buffer.length) {
      const size = buffer[cursor++]
      if (size === 0) return cursor
      cursor += size
    }
    throw new Error("Incomplete GIF block")
  }

  function colorTableSize(flags: number): number {
    return flags & 0x80 ? 3 * 2 ** ((flags & 7) + 1) : 0
  }
}
