import {calcProportionSize} from "./calcProportionSize"
import {compressImageFile} from "./compressImageFile"
import {formatMarkdownImage} from "./formatMarkdownImage"
import {prepareGifAttachment} from "./gif/prepareGifAttachment"
import {toImageAltText} from "./toImageAltText"

export async function uploadImageFile(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null

  try {
    const {buffer, width, height} = (await prepareGifAttachment(file)) ?? (await compressImageFile(file))

    const id = await window.BridgeIPC["files:save"](file.name, buffer)
    const url = await window.BridgeIPC["files:get-path"](id)

    const {width: displayWidth, height: displayHeight} = calcProportionSize(width, height)

    return formatMarkdownImage(url, `${toImageAltText(file.name)} =${displayWidth}x${displayHeight}`)
  } catch (e) {
    console.error("[uploadImageFile] Failed to upload image:", e)
    return null
  }
}
