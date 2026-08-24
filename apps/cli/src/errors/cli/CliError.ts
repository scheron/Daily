import {CliErrorCode} from "./CliErrorCode"

const EXIT_CODE: Record<CliErrorCode, number> = {
  [CliErrorCode.TASK_NOT_FOUND]: 3,
  [CliErrorCode.PROJECT_NOT_FOUND]: 3,
  [CliErrorCode.TAG_NOT_FOUND]: 3,
  [CliErrorCode.AMBIGUOUS_ID]: 2,
  [CliErrorCode.INVALID_DATE]: 2,
  [CliErrorCode.INVALID_TIME]: 2,
  [CliErrorCode.INVALID_MINUTES]: 2,
  [CliErrorCode.INVALID_ARGUMENT]: 2,
  [CliErrorCode.REFUSED]: 4,
  [CliErrorCode.SYNC_NOT_CONFIGURED]: 2,
  [CliErrorCode.SYNC_FAILED]: 5,
}

/** Lists every CLI error code together with its process exit code. */
export function listCliErrorCodes(): Array<{code: CliErrorCode; exitCode: number}> {
  return Object.values(CliErrorCode).map((code) => ({code, exitCode: EXIT_CODE[code]}))
}

/** A user-facing CLI failure carrying a stable code and process exit code. */
export class CliError extends Error {
  readonly exitCode: number
  constructor(
    readonly code: CliErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "CliError"
    this.exitCode = EXIT_CODE[code]
  }
}
