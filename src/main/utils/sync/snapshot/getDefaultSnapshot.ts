import type {Snapshot} from "@/types/sync"

export function getDefaultSnapshot(): Snapshot {
  const docs = {
    tasks: [],
    tags: [],
    branches: [],
    files: [],
    settings: null,
  }
  return {
    docs,
    meta: {
      updatedAt: new Date().toISOString(),
      hash: "",
    },
  }
}
