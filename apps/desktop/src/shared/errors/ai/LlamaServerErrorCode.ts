/**
 * Error codes thrown by the llama-server lifecycle (binary download, archive
 * extraction, process spawning, health checks).
 * Values are human-readable canonical prefixes; throw sites may append context.
 */
export enum LlamaServerErrorCode {
  UnsupportedArchitecture = "Unsupported architecture",
  DownloadHttpFailed = "Failed to download llama-server",
  ChecksumMismatch = "llama-server checksum mismatch",
  BinaryNotFound = "llama-server binary not found in archive",
  ProcessExitedDuringStartup = "llama-server process exited during startup",
  StartTimeout = "llama-server failed to start within timeout",
}
