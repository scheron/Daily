import {isArray, isNumber, isObject, isString} from "@daily/std"

import {validateWorkflowSnapshotDocs} from "../../tasks/workflowValidation"
import {KNOWN_SNAPSHOT_VERSION} from "./assertKnownSnapshotVersion"
import {normalizeSnapshotDocs} from "./normalizeSnapshotDocs"

import type {Snapshot} from "@daily/protocol"

/** Invalid workflow history throws so sync cannot replace it with an empty snapshot. */
export function isValidSnapshot<T extends Snapshot>(obj: T): boolean {
  if (!isObject(obj) || !isObject(obj.docs) || !isObject(obj.meta)) return false
  if (!isString(obj.meta.updatedAt) || !isString(obj.meta.hash)) return false
  if (!isNumber(obj.version) || !Number.isSafeInteger(obj.version) || obj.version < 2 || obj.version > KNOWN_SNAPSHOT_VERSION) return false

  if (obj.version >= 17 && !isArray(obj.docs.workflowRecords)) return false
  if (!isArray(obj.docs.tasks) || !isArray(obj.docs.tags) || !isArray(obj.docs.branches) || !isArray(obj.docs.files)) return false
  validateWorkflowSnapshotDocs(obj.version >= 18 ? obj.docs : normalizeSnapshotDocs(obj.docs, obj.version), obj.version >= 18)

  return true
}
