import type {Snapshot} from "@/types/sync"

export function getDefaultSnapshot(): Snapshot {
  return {
    version: 2,
    docs: {
      tasks: [],
      tags: [],
      branches: [],
      files: [],
      settings: null,
    },
    meta: {
      updatedAt: new Date().toISOString(),
      hash: "",
    },
  }
}
