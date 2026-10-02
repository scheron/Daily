import {createSharedStorageHandlers} from "@main/setup/ipc/storageHandlers"
import {QuickCaptureHelperError} from "@shared/errors/quickCapture/QuickCaptureHelperError"
import {QuickCaptureHelperErrorCode} from "@shared/errors/quickCapture/QuickCaptureHelperErrorCode"
import {QUICK_CAPTURE_FORWARDED_CHANNELS} from "./helperProtocol"

import type {IStorageController} from "@daily/core"
import type {QuickCaptureForwardedChannel} from "./helperProtocol"

/** Answers the helper's requests with the same handlers Daily's own IPC uses. Any channel off the whitelist is rejected. */
export function createHelperRequestHandler(getStorage: () => IStorageController | null) {
  const handlers = createSharedStorageHandlers(getStorage)

  return async (channel: string, args: unknown[]): Promise<unknown> => {
    if (!(QUICK_CAPTURE_FORWARDED_CHANNELS as readonly string[]).includes(channel))
      throw new QuickCaptureHelperError(QuickCaptureHelperErrorCode.ChannelNotAllowed, `Channel not allowed: ${channel}`)

    return handlers[channel as QuickCaptureForwardedChannel](...args)
  }
}
