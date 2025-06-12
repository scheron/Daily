import {Buffer} from "buffer"
import {ref} from "vue"
import {defineStore} from "pinia"

import type {Tag, Task} from "@/types/tasks"

export const useTaskEditorStore = defineStore("taskEditor", () => {
  const currentEditingTask = ref<Task | null>(null)

  const editorContent = ref("")
  const editorTags = ref<Tag[]>([])
  const isTaskEditorOpen = ref(false)

  const stagedAssets = ref<Record<string, {dataUrl: string; originalName: string}>>({})

  function stageAsset(dataUrl: string, originalName: string): {id: string} {
    const id = crypto.randomUUID()
    const filename = originalName.replace(/^.*[\\/]/, "")
    stagedAssets.value[id] = {dataUrl, originalName: filename}
    return {id}
  }

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

  function setCurrentEditingTask(task: Task | null) {
    currentEditingTask.value = task

    editorContent.value = task ? task.content : ""
    editorTags.value = task ? [...task.tags] : []
  }

  function setEditorContent(content: string) {
    editorContent.value = content
  }

  function setEditorTags(tags: Tag[]) {
    editorTags.value = tags
  }

  function setIsTaskEditorOpen(isOpen: boolean) {
    if (!isOpen) {
      editorContent.value = ""
      editorTags.value = []
      stagedAssets.value = {}
      currentEditingTask.value = null
    }
    isTaskEditorOpen.value = isOpen
  }

  function replaceAttachments(text: string, committed: Record<string, {filename: string; filePath: string}>) {
    let final = text

    for (const id in committed) {
      const {filePath} = committed[id]
      final = final.replace(new RegExp(`temp:${id}`, "g"), filePath)
    }

    return final
  }

  return {
    currentEditingTask,
    editorContent,
    editorTags,
    isTaskEditorOpen,

    stagedAssets,
    stageAsset,
    commitAssets,
    rollbackAssets,

    setCurrentEditingTask,
    setEditorContent,
    setEditorTags,
    setIsTaskEditorOpen,

    replaceAttachments,
  }
})
