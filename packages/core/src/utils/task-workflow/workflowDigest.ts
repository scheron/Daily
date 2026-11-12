import {createHash} from "node:crypto"

import {canonicalWorkflowValue} from "./canonicalWorkflowValue"

export function workflowDigest(value: unknown): string {
  return createHash("sha256").update(canonicalWorkflowValue(value)).digest("hex")
}
