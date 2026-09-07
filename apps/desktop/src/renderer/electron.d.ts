import type {BridgeIPC} from "@shared/types/ipc"

declare global {
  interface Window {
    BridgeIPC: BridgeIPC
  }
}
