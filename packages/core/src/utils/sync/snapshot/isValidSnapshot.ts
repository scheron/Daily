import {isArray, isNumber, isObject, isString} from "@daily/std"

import {KNOWN_SNAPSHOT_VERSION} from "./assertKnownSnapshotVersion"

import type {Snapshot} from "@daily/protocol"

export function isValidSnapshot<T extends Snapshot>(obj: T): boolean {
  if (!isObject(obj) || !isObject(obj.docs) || !isObject(obj.meta)) return false
  if (!isString(obj.meta.updatedAt) || !isString(obj.meta.hash)) return false
  if (!isNumber(obj.version) || obj.version < 2 || obj.version > KNOWN_SNAPSHOT_VERSION) return false

  return isArray(obj.docs.tasks) && isArray(obj.docs.tags) && isArray(obj.docs.branches) && isArray(obj.docs.files)
}
