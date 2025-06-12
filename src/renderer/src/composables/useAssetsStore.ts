import {Buffer} from "buffer"
import {ref} from "vue"

import type {Ref} from "vue"

export function useAssetsStore() {
  const stagedAssets: Ref<Record<string, {dataUrl: string; originalName: string}>> = ref({})

  /**
   * Stage an asset for later commit.
   * @param dataUrl - Base64 Data URL of the image/file
   * @param originalName - Desired base name (with extension) for the file
   * @returns id for referencing this asset in markdown (attachment:<id>)
   */
  function stageAsset(dataUrl: string, originalName: string): {id: string} {
    const id = crypto.randomUUID()
    const filename = originalName.replace(/^.*[\\/]/, "")
    stagedAssets.value[id] = {dataUrl, originalName: filename}
    return {id}
  }

  /**
   * Commit all staged assets to disk via IPC, clear staging, and return map.
   * @returns mapping: id -> { filename, filePath }
   */
  async function commitAssets(): Promise<Record<string, {filename: string; filePath: string}>> {
    const result: Record<string, {filename: string; filePath: string}> = {}
    for (const id in stagedAssets.value) {
      const {dataUrl, originalName} = stagedAssets.value[id]
      const [, base64] = dataUrl.split(",")
      const binary = atob(base64)
      const len = binary.length
      const arr = new Uint8Array(len)
      for (let i = 0; i < len; i++) arr[i] = binary.charCodeAt(i)
      const buffer = Buffer.from(arr)

      const savedFilename: string = await window.electronAPI.saveAsset(originalName, buffer)
      const filePath: string = await window.electronAPI.getAssetPath(savedFilename)

      result[id] = {filename: savedFilename, filePath}
    }

    stagedAssets.value = {}
    return result
  }

  function rollbackAssets() {
    stagedAssets.value = {}
  }

  return {
    stageAsset,
    commitAssets,
    rollbackAssets,
  }
}
