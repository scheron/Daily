import {ERROR_NAME_PREFIX_REGEX, IPC_ERROR_PREFIX_REGEX} from "@/constants/regex"

/** Strips the Electron IPC invocation prefix and the error class prefix (`SomeError:`) from a caught error's message. */
export function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : "Something went wrong"

  return message.replace(IPC_ERROR_PREFIX_REGEX, "").replace(ERROR_NAME_PREFIX_REGEX, "")
}
