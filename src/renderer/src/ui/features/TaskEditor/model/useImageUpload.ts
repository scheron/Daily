import {ref} from "vue"
import {blobToBuffer} from "@/utils/images/blobToBuffer"
import {calcProportionSize} from "@/utils/images/calcProportionSize"
import {compressImageFile} from "@/utils/images/compressImageFile"

import type {CompressionOptions} from "@/utils/images/compressImageFile"
import type {Ref} from "vue"

export type UseImageUploadOptions = {
  /**
   * Compression settings for canvas.
   * maxWidth/maxHeight — "hard" size of canvas (default 1024).
   */
  compression?: CompressionOptions

  /**
   * Maximum display size in Markdown (width/height),
   * used in calculateProportionalSize(width, height, displayMaxSize).
   * This is already "logical" size for editor, not physical size of image.
   */
  displayMaxSize?: number
}

export type UseImageUploadResult = {
  isUploading: Ref<boolean>
  error: Ref<string | null>
  uploadImageFile: (file: File) => Promise<string | null>
  uploadFiles: (files: FileList | File[]) => Promise<string[]>
}

/**
 * Composable для загрузки/сжатия изображений и вставки в Markdown.
 *
 * 1) Сжимает изображение через canvas до maxWidth/maxHeight (по умолчанию 1024).
 * 2) Сохраняет через window.BridgeIPC["files:save"](name, buffer).
 * 3) Для вставки в текст использует calculateProportionalSize с displayMaxSize.
 * 4) Возвращает готовую строку вида: ![name =WxH](url).
 */
export function useImageUpload(options: UseImageUploadOptions = {}): UseImageUploadResult {
  const isUploading = ref(false)
  const error = ref<string | null>(null)

  const {compression = {}, displayMaxSize = 500} = options

  async function uploadImageFile(file: File): Promise<string | null> {
    error.value = null

    if (!file.type.startsWith("image/")) {
      error.value = "Файл не является изображением"
      return null
    }

    isUploading.value = true
    try {
      const {blob, width, height} = await compressImageFile(file, compression)

      const buffer = await blobToBuffer(blob)

      const id = await window.BridgeIPC["files:save"](file.name, buffer)
      const url = await window.BridgeIPC["files:get-path"](id)

      const {width: displayWidth, height: displayHeight} = calcProportionSize(width, height, displayMaxSize)

      const filename = file.name || "image"
      const markdown = `![${filename} =${displayWidth}x${displayHeight}](${url})`

      return markdown
    } catch (e: any) {
      console.error("[useImageUpload] Failed to upload image:", e)
      error.value = e?.message ?? "Не удалось загрузить изображение"
      return null
    } finally {
      isUploading.value = false
    }
  }

  async function uploadFiles(files: FileList | File[]): Promise<string[]> {
    const list = Array.from(files as any)
    const result: string[] = []

    for (const file of list) {
      const md = await uploadImageFile(file as File)
      if (md) result.push(md)
    }

    return result
  }

  return {
    isUploading,
    error,
    uploadImageFile,
    uploadFiles,
  }
}
