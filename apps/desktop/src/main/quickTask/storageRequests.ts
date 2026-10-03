import {createSharedStorageHandlers} from "@main/setup/ipc/storageHandlers"
import {QuickTaskError} from "@shared/errors/quickTask/QuickTaskError"
import {QuickTaskErrorCode} from "@shared/errors/quickTask/QuickTaskErrorCode"
import {QUICK_TASK_FORWARDED_CHANNELS} from "./protocol"

import type {IStorageController} from "@daily/core"
import type {QuickTaskForwardedChannel} from "./protocol"

/** Answers the Quick task process's requests with the same handlers Daily's own IPC uses. Any channel off the whitelist is rejected. */
export function createStorageRequestHandler(getStorage: () => IStorageController | null) {
  const handlers = createSharedStorageHandlers(getStorage)

  return async (channel: string, args: unknown[]): Promise<unknown> => {
    if (!(QUICK_TASK_FORWARDED_CHANNELS as readonly string[]).includes(channel))
      throw new QuickTaskError(QuickTaskErrorCode.ChannelNotAllowed, `Channel not allowed: ${channel}`)

    return handlers[channel as QuickTaskForwardedChannel](...args)
  }
}
