/**
 * Error codes thrown by the MCP server and its transport layer when
 * lifecycle invariants are violated (double-start, use before init).
 */
export enum McpErrorCode {
  TransportAlreadyStarted = "HttpTransport already started",
  TransportNotInitialized = "MCP transport not initialized",
}
