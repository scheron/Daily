import {toSettingsView} from "@daily/core"

import type {IStorageController} from "@daily/core"
import type {Task} from "@daily/protocol"
import type {QuickTaskForwardedChannel} from "@main/quickTask/protocol"

export type SharedStorageHandlers = Record<QuickTaskForwardedChannel, (...args: any[]) => unknown>

/** The storage calls both Daily's own windows and the Quick task process make, so a request from that process runs exactly what the same call from a window runs. */
export function createSharedStorageHandlers(getStorage: () => IStorageController | null): SharedStorageHandlers {
  return {
    "settings:load": async () => {
      const settings = await getStorage()?.loadSettings()
      return settings ? toSettingsView(settings) : undefined
    },
    "tasks:get-all": () => getStorage()?.getAllTasks(),
    "tasks:create": (task: Omit<Task, "id" | "createdAt" | "updatedAt" | "branchId"> & {branchId?: Task["branchId"]; id?: Task["id"]}) =>
      getStorage()?.createTask(task as Task),
    "branches:get-many": () => getStorage()?.getBranchList(),
    "tags:get-many": () => getStorage()?.getTagList(),
  }
}
