import {blobToBuffer} from "./blobToBuffer"
import {calcProportionSize} from "./calcProportionSize"
import {compressImageFile} from "./compressImageFile"
import {toImageAltText} from "./toImageAltText"

export async function uploadImageFile(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null

  try {
    const {blob, width, height} = await compressImageFile(file)

    const buffer = await blobToBuffer(blob)

    const id = await window.BridgeIPC["files:save"](file.name, buffer)
    const url = await window.BridgeIPC["files:get-path"](id)

    const {width: displayWidth, height: displayHeight} = calcProportionSize(width, height)

    return `![${toImageAltText(file.name)} =${displayWidth}x${displayHeight}](${url})`
  } catch (e: any) {
    console.error("[uploadImageFile] Failed to upload image:", e)
    return null
  }
}
