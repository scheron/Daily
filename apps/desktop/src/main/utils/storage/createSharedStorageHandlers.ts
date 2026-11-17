import {toSettingsView} from "@daily/core"

import type {IStorageController} from "@daily/core"
import type {Branch, Task} from "@daily/protocol"

type SharedStorageHandlers = Record<
  "settings:load" | "tasks:get-all" | "tasks:create" | "branches:get-many" | "tags:get-many" | "milestones:get-many",
  (...args: any[]) => unknown
>

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
    "milestones:get-many": (branchId?: Branch["id"]) => getStorage()?.getMilestoneList(branchId),
  }
}
