import {Buffer} from "buffer"

export async function blobToBuffer(blob: Blob): Promise<Buffer> {
  const arrayBuffer = await blob.arrayBuffer()
  return Buffer.from(new Uint8Array(arrayBuffer))
}
