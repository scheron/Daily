<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from "vue"
import {useThemeStore} from "@/stores/theme.store"

useThemeStore()

type DocType = "task" | "tag" | "settings" | "file"

interface Doc {
  _id: string
  _rev?: string
  type: string
  createdAt?: string
  [key: string]: any
}

const currentType = ref<DocType>("task")
const docs = ref<Doc[]>([])
const activeDoc = ref<Doc | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const docWithoutMeta = computed(() => {
  if (!activeDoc.value) return null
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {_id, _rev, _attachments, ...rest} = activeDoc.value
  console.log("Doc without meta:", activeDoc.value)
  return rest
})

async function loadDocs() {
  loading.value = true
  error.value = null

  const previousId = activeDoc.value?._id

  try {
    const data = await window.BridgeIPC.invoke("db-viewer:get-docs", currentType.value, 200)
    docs.value = data.docs || []

    if (previousId && docs.value.some((d) => d._id === previousId)) {
      await loadDoc(previousId)
    } else if (docs.value.length > 0 && !activeDoc.value) {
      await loadDoc(docs.value[0]._id)
    }
  } catch (e: any) {
    console.error("Failed to load docs:", e)
    error.value = e.message || "Failed to load documents"
  } finally {
    loading.value = false
  }
}

async function loadDoc(id: string) {
  try {
    const doc = await window.BridgeIPC.invoke("db-viewer:get-doc", id)
    activeDoc.value = doc
  } catch (e: any) {
    console.error("Failed to load doc:", e)
    error.value = e.message || "Failed to load document"
  }
}

function setActiveType(type: DocType) {
  currentType.value = type
  activeDoc.value = null
  loadDocs()
}

function formatDate(dateString?: string) {
  if (!dateString) return ""
  return dateString.slice(0, 19).replace("T", " ")
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") {
    loadDocs()
  }
}

function handleFocus() {
  loadDocs()
}

onMounted(() => {
  loadDocs()

  document.addEventListener("visibilitychange", handleVisibilityChange)
  window.addEventListener("focus", handleFocus)
})

onUnmounted(() => {
  document.removeEventListener("visibilitychange", handleVisibilityChange)
  window.removeEventListener("focus", handleFocus)
})
</script>

<template>
  <div class="bg-base-300 text-base-content flex h-screen w-screen flex-col">
    <!-- Header -->
    <header
      style="-webkit-app-region: drag"
      class="bg-base-200 border-base-300 sticky top-0 z-10 flex items-center justify-between border-b px-4 py-2"
    >
      <div>
        <h1 class="text-base-content/60 text-sm font-semibold tracking-wide uppercase">Daily · DB Viewer</h1>
        <span class="text-base-content/40 text-xs">Electron IPC Mode</span>
      </div>
      <div class="flex items-center gap-3" style="-webkit-app-region: no-drag">
        <span class="text-base-content/50 text-xs"> type: <code class="font-mono">task | tag | settings | file</code> </span>
        <button
          class="bg-base-200 border-base-300 text-base-content hover:bg-base-100 rounded-full border px-3 py-1 text-xs transition-colors"
          @click="loadDocs"
        >
          Refresh
        </button>
      </div>
    </header>

    <div class="grid flex-1 grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
      <aside class="bg-base-200 border-base-300 flex flex-col gap-2 overflow-y-auto border-r p-2">
        <div>
          <div class="text-base-content/40 mb-1 text-xs tracking-widest uppercase">Document types</div>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="type in ['task', 'tag', 'settings', 'file']"
              :key="type"
              class="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-all"
              :class="
                currentType === type
                  ? 'border-accent bg-accent/20 text-accent'
                  : 'border-base-300 bg-base-100 text-base-content/60 hover:border-base-content/20'
              "
              @click="setActiveType(type as DocType)"
            >
              <span class="h-1.5 w-1.5 rounded-full" :class="currentType === type ? 'bg-accent' : 'bg-base-content/30'"></span>
              <span class="capitalize">{{ type }}s</span>
            </button>
          </div>
        </div>

        <div class="flex flex-1 flex-col overflow-hidden">
          <div class="text-base-content/40 mb-1 text-xs tracking-widest uppercase">Documents</div>
          <div class="bg-base-100 border-base-300 flex-1 overflow-auto rounded-lg border p-1">
            <div v-if="loading" class="text-base-content/40 p-2 text-xs">Loading…</div>
            <div v-else-if="error" class="text-error p-2 text-xs">{{ error }}</div>
            <div v-else-if="docs.length === 0" class="text-base-content/40 p-2 text-xs">No documents of this type</div>
            <div v-else class="space-y-0.5">
              <div
                v-for="doc in docs"
                :key="doc._id"
                class="cursor-pointer rounded-md p-2 transition-colors"
                :class="activeDoc?._id === doc._id ? 'border-accent/45 bg-accent/15 border' : 'hover:bg-base-200/50'"
                @click="loadDoc(doc._id)"
              >
                <div class="text-base-content/60 font-mono text-xs break-all">{{ doc._id }}</div>
                <div class="text-base-content/40 mt-0.5 flex items-center gap-2 text-[10px]">
                  <span class="border-base-300 rounded-full border px-1.5 py-0.5">{{ doc.type }}</span>
                  <span>{{ formatDate(doc.createdAt) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="bg-base-300 grid grid-cols-[1.1fr_0.9fr] gap-2 overflow-hidden p-2">
        <!-- Document Panel -->
        <section class="bg-base-100 border-base-300 flex flex-col overflow-hidden rounded-lg border">
          <div class="border-base-300 flex items-center justify-between border-b px-2 py-1.5">
            <span class="text-base-content/50 text-xs">Document</span>
            <span class="text-base-content/40 font-mono text-xs">{{ activeDoc?._id || "" }}</span>
          </div>
          <div class="flex-1 overflow-auto p-2">
            <pre
              v-if="activeDoc"
              class="text-base-content font-mono text-xs leading-relaxed"
            ><code>{{ JSON.stringify(docWithoutMeta, null, 2) }}</code></pre>
            <div v-else class="text-base-content/40 p-2 text-xs">Select a document on the left</div>
          </div>
        </section>

        <!-- Raw Panel -->
        <section class="bg-base-100 border-base-300 flex flex-col overflow-hidden rounded-lg border">
          <div class="border-base-300 flex items-center justify-between border-b px-2 py-1.5">
            <span class="text-base-content/50 text-xs">Raw</span>
            <span class="border-base-300 text-base-content/50 rounded-full border px-1.5 py-0.5 text-[10px]">_rev, _attachments etc.</span>
          </div>
          <div class="flex-1 overflow-auto p-2">
            <pre
              v-if="activeDoc"
              class="text-base-content font-mono text-xs leading-relaxed"
            ><code>{{ JSON.stringify(activeDoc, null, 2) }}</code></pre>
            <div v-else class="text-base-content/40 p-2 text-xs">Raw PouchDB doc will appear here</div>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>
