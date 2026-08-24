import {ProtocolErrorCode} from "./ProtocolErrorCode"

const STATUS: Record<ProtocolErrorCode, number> = {
  [ProtocolErrorCode.MALFORMED_REQUEST]: 400,
  [ProtocolErrorCode.UNKNOWN_ROUTE]: 404,
  [ProtocolErrorCode.METHOD_NOT_ALLOWED]: 405,
  [ProtocolErrorCode.PAYLOAD_TOO_LARGE]: 413,
  [ProtocolErrorCode.UNAUTHORIZED]: 401,
  [ProtocolErrorCode.DEVICE_REVOKED]: 403,
  [ProtocolErrorCode.ALREADY_CLAIMED]: 409,
  [ProtocolErrorCode.INVALID_CLAIM_CODE]: 401,
  [ProtocolErrorCode.CLAIM_CODE_LOCKED]: 403,
  [ProtocolErrorCode.SERVER_NOT_CLAIMED]: 409,
  [ProtocolErrorCode.ENROLLMENT_IN_PROGRESS]: 409,
  [ProtocolErrorCode.ENROLLMENT_NOT_FOUND]: 404,
  [ProtocolErrorCode.ENROLLMENT_NOT_PENDING]: 409,
  [ProtocolErrorCode.ENROLLMENT_CODE_MISMATCH]: 409,
  [ProtocolErrorCode.INVALID_ENROLLMENT_TOKEN]: 401,
  [ProtocolErrorCode.REVISION_CONFLICT]: 409,
  [ProtocolErrorCode.SNAPSHOT_VERSION_BEHIND]: 409,
  [ProtocolErrorCode.INVALID_SNAPSHOT]: 400,
  [ProtocolErrorCode.INVALID_ASSET_NAME]: 400,
  [ProtocolErrorCode.ASSET_NOT_FOUND]: 404,
  [ProtocolErrorCode.INTERNAL]: 500,
}

/** A Daily Sync Protocol failure carrying a stable wire code and HTTP status. */
export class ProtocolError extends Error {
  readonly status: number
  constructor(
    readonly code: ProtocolErrorCode,
    message?: string,
  ) {
    super(message ?? code)
    this.name = "ProtocolError"
    this.status = STATUS[code]
  }
}
