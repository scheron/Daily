import {contextBridge, ipcRenderer} from "electron"

import type {ModelDownloadProgress, ModelId, ModelInfo, RuntimeState} from "../shared/types/ai"
import type {Correction, CorrectionRequest, CorrectionResult} from "../shared/types/correction"
import type {BridgeIPC} from "../shared/types/ipc"
import type {Settings} from "../shared/types/settings"
import type {HotkeyRebindResult} from "../shared/types/shortcuts"

// prettier-ignore
contextBridge.exposeInMainWorld("BridgeIPC", {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  on: (channel: string, callback: (...args: any[]) => void) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },

  "platform:is-mac": () => process.platform === "darwin",
  "platform:is-windows": () => process.platform === "win32",
  "platform:is-linux": () => process.platform === "linux",

  "settings:load": () => ipcRenderer.invoke("settings:load") as Promise<Settings>,
  "settings:save": (patch: Partial<Settings>) => ipcRenderer.invoke("settings:save", patch) as Promise<Settings>,
  "settings:on-changed": (callback: (s: Settings) => void) => {
    const subscription = (_e: any, s: Settings) => callback(s)
    ipcRenderer.on("settings:changed", subscription)
    return () => ipcRenderer.removeListener("settings:changed", subscription)
  },

  "history:get-many": (opts: {limit: number; beforeId?: string}) => ipcRenderer.invoke("history:get-many", opts) as Promise<Correction[]>,
  "history:get-one": (id: string) => ipcRenderer.invoke("history:get-one", id) as Promise<Correction | null>,
  "history:clear": () => ipcRenderer.invoke("history:clear") as Promise<void>,
  "history:add": (input: Correction) =>
    ipcRenderer.invoke("history:add", input) as Promise<Correction | null>,
  "history:on-item-added": (callback: (c: Correction) => void) => {
    const subscription = (_e: any, c: Correction) => callback(c)
    ipcRenderer.on("history:item-added", subscription)
    return () => ipcRenderer.removeListener("history:item-added", subscription)
  },

  "window:show-main": () => ipcRenderer.invoke("window:show-main") as Promise<void>,
  "window:hide-main": () => ipcRenderer.invoke("window:hide-main") as Promise<void>,
  "window:open-settings": () => ipcRenderer.invoke("window:open-settings") as Promise<void>,
  "window:on-main-hidden": (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("window:main-hidden", subscription)
    return () => ipcRenderer.removeListener("window:main-hidden", subscription)
  },

  "ai:correct": (req: CorrectionRequest) => ipcRenderer.invoke("ai:correct", req) as Promise<CorrectionResult>,
  "ai:cancel": () => ipcRenderer.invoke("ai:cancel") as Promise<boolean>,

  "ai:get-state": () => ipcRenderer.invoke("ai:get-state") as Promise<RuntimeState>,
  "ai:list-models": () => ipcRenderer.invoke("ai:list-models") as Promise<ModelInfo[]>,
  "ai:download-model": (id: ModelId) => ipcRenderer.invoke("ai:download-model", id) as Promise<boolean>,
  "ai:cancel-download": (id: ModelId) => ipcRenderer.invoke("ai:cancel-download", id) as Promise<boolean>,
  "ai:delete-model": (id: ModelId) => ipcRenderer.invoke("ai:delete-model", id) as Promise<boolean>,
  "ai:get-disk-usage": () => ipcRenderer.invoke("ai:get-disk-usage") as Promise<{total: number; models: Record<string, number>}>,
  "ai:on-state-changed": (callback: (state: RuntimeState) => void) => {
    const subscription = (_e: any, state: RuntimeState) => callback(state)
    ipcRenderer.on("ai:state-changed", subscription)
    return () => ipcRenderer.removeListener("ai:state-changed", subscription)
  },
  "ai:on-download-progress": (callback: (progress: ModelDownloadProgress) => void) => {
    const subscription = (_e: any, progress: ModelDownloadProgress) => callback(progress)
    ipcRenderer.on("ai:download-progress", subscription)
    return () => ipcRenderer.removeListener("ai:download-progress", subscription)
  },

  "hotkey:rebind": (accelerator: string) => ipcRenderer.invoke("hotkey:rebind", accelerator) as Promise<HotkeyRebindResult>,
  "app:get-version": () => ipcRenderer.invoke("app:get-version") as Promise<string>,
} satisfies BridgeIPC)
