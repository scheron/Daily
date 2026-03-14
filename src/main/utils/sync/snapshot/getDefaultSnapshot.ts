import type {SnapshotV2} from "@/types/sync"

export function getDefaultSnapshot(): SnapshotV2 {
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
