/**
 * Thrown when a llama-server startup is interrupted by an explicit stop()
 * (user changed model, deleted the active one, etc.). Distinguishes
 * intentional cancellation from an actual crash.
 */
export class ServerStartCancelledError extends Error {
  constructor() {
    super("llama-server start was cancelled")
    this.name = "ServerStartCancelledError"
  }
}
