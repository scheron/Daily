import {ServerSetupErrorCode} from "./ServerSetupErrorCode"

const EXIT_CODE: Record<ServerSetupErrorCode, number> = {
  [ServerSetupErrorCode.INVALID_ENVIRONMENT]: 2,
  [ServerSetupErrorCode.OPENSSL_MISSING]: 4,
  [ServerSetupErrorCode.CERTIFICATE_FAILED]: 5,
  [ServerSetupErrorCode.VERIFICATION_FAILED]: 5,
  [ServerSetupErrorCode.NOT_A_DAILY_SERVER]: 5,
}

/** A configuration or setup failure on the server host, carrying a stable code and a process exit code. */
export class ServerSetupError extends Error {
  readonly exitCode: number
  constructor(
    readonly code: ServerSetupErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "ServerSetupError"
    this.exitCode = EXIT_CODE[code]
  }
}
