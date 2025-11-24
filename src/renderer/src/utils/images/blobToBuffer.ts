import {Buffer} from "buffer"

/**
 * Converts a blob to a buffer
 * @param blob - The blob to convert
 * @returns The buffer
 *
 */
export async function blobToBuffer(blob: Blob): Promise<Buffer> {
  const arrayBuffer = await blob.arrayBuffer()
  return Buffer.from(new Uint8Array(arrayBuffer))
}
