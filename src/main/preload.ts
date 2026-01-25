import {contextBridge, ipcRenderer} from "electron"

import type {ISODate} from "@shared/types/common"
import type {BridgeIPC} from "@shared/types/ipc"
import type {TaskSearchResult} from "@shared/types/search"
import type {Day, Settings, SyncStatus, Tag, Task} from "@shared/types/storage"
import type {PartialDeep} from "type-fest"

// prettier-ignore
contextBridge.exposeInMainWorld("BridgeIPC", {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  on: (channel: string, callback: (...args: any[]) => void) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },

  "window:minimize": () => ipcRenderer.send("window:minimize"),
  "window:maximize": () => ipcRenderer.send("window:maximize"),
  "window:close": () => ipcRenderer.send("window:close"),

  "platform:is-mac": () => process.platform === "darwin",
  "platform:is-windows": () => process.platform === "win32",
  "platform:is-linux": () => process.platform === "linux",

  "shell:open-external": (url: string) => ipcRenderer.invoke("shell:open-external", url) as Promise<boolean>,

  "menu:on-new-task": (callback: (action: "new-task") => void) => ipcRenderer.on("menu:new-task", () => callback("new-task")),

  "storage-sync:activate": () => ipcRenderer.invoke("storage-sync:activate") as Promise<void>,
  "storage-sync:deactivate": () => ipcRenderer.invoke("storage-sync:deactivate") as Promise<void>,
  "storage-sync:sync": () => ipcRenderer.invoke("storage-sync:sync") as Promise<void>,
  "storage-sync:get-status": () => ipcRenderer.invoke("storage-sync:get-status") as Promise<SyncStatus>,
  "storage-sync:on-status-changed": (callback: (status: SyncStatus, prevStatus: SyncStatus) => void) => ipcRenderer.on("storage-sync:status-changed", (_event, status: SyncStatus, prevStatus: SyncStatus) => callback(status, prevStatus)),
  "storage-sync:on-data-changed": (callback: () => void) => ipcRenderer.on("storage-sync:data-changed", (_event, ) => callback()),

  "settings:load": () => ipcRenderer.invoke("settings:load") as Promise<Settings>,
  "settings:save": (settings: Partial<Settings>) => ipcRenderer.invoke("settings:save", settings),

  "days:get-many": (params?: {from?: ISODate; to?: ISODate}) => ipcRenderer.invoke("days:get-many", params) as Promise<Day[]>,
  "days:get-one": (date: ISODate) => ipcRenderer.invoke("days:get-one", date) as Promise<Day | null>,

  "tasks:get-many": (params?: {from?: ISODate; to?: ISODate; limit?: number}) => ipcRenderer.invoke("tasks:get-many", params) as Promise<Task[]>,
  "tasks:get-one": (id: Task["id"]) => ipcRenderer.invoke("tasks:get-one", id) as Promise<Task | null>,
  "tasks:update": (id: Task["id"], updates: PartialDeep<Task>) => ipcRenderer.invoke("tasks:update", id, updates),
  "tasks:create": (task: Omit<Task, "id" | "createdAt" | "updatedAt" | "deletedAt" | "attachments">) => ipcRenderer.invoke("tasks:create", task),
  "tasks:delete": (id: Task["id"]) => ipcRenderer.invoke("tasks:delete", id),
  "tasks:add-tags": (taskId: Task["id"], tagIds: Tag["id"][]) => ipcRenderer.invoke("tasks:add-tags", taskId, tagIds),
  "tasks:remove-tags": (taskId: Task["id"], tagIds: Tag["id"][]) => ipcRenderer.invoke("tasks:remove-tags", taskId, tagIds),
  "tasks:get-deleted": (params?: {limit?: number}) => ipcRenderer.invoke("tasks:get-deleted", params) as Promise<Task[]>,
  "tasks:restore": (id: Task["id"]) => ipcRenderer.invoke("tasks:restore", id) as Promise<Task | null>,
  "tasks:delete-permanently": (id: Task["id"]) => ipcRenderer.invoke("tasks:delete-permanently", id) as Promise<boolean>,

  "search:query": (query: string) => ipcRenderer.invoke("search:query", query) as Promise<TaskSearchResult[]>,

  "tags:get-many": () => ipcRenderer.invoke("tags:get-many") as Promise<Tag[]>,
  "tags:get-one": (id: Tag["id"]) => ipcRenderer.invoke("tags:get-one", id) as Promise<Tag | null>,
  "tags:update": (id: Tag["id"], updates: Partial<Tag>) => ipcRenderer.invoke("tags:update", id, updates),
  "tags:create": (tag: Omit<Tag, "id" | "createdAt" | "updatedAt" | "deletedAt">) => ipcRenderer.invoke("tags:create", tag),
  "tags:delete": (id: Tag["id"]) => ipcRenderer.invoke("tags:delete", id),

  "files:save": (filename: string, data: Buffer) => ipcRenderer.invoke("files:save", filename, data),
  "files:delete": (filename: string) => ipcRenderer.invoke("files:delete", filename),
  "files:get-path": (id: string) => ipcRenderer.invoke("files:get-path", id) as Promise<string>,
} satisfies BridgeIPC)
