/** Strips the Electron IPC invocation prefix and the error class prefix (`SomeError:`) from a caught error's message. */
export function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : "Something went wrong"

  return message.replace(/^Error invoking remote method '[^']+':\s*/, "").replace(/^[A-Za-z]*Error:\s*/, "")
}
