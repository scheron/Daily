import type {ChangeEntity, ChangeLogEntry, ChangeOperation, DeltaRecord, FieldConflict, MergeOutcome, SyncStrategy} from "@/types/sync"

export type FieldChange = {
  field_name: string
  value: string | null
  changed_at: string
}

export type EntityPatch = {
  entity: ChangeEntity
  doc_id: string
  operation: ChangeOperation
  fields: Record<string, string | null>
}

export type MergeFieldsResult = {
  patches: EntityPatch[]
  conflicts: FieldConflict[]
}

export function mergeFields(localChanges: ChangeLogEntry[], remoteDeltas: DeltaRecord[], strategy: SyncStrategy): MergeFieldsResult {
  const patches: EntityPatch[] = []
  const conflicts: FieldConflict[] = []

  // Group remote deltas by (entity, doc_id)
  const remoteGroups = new Map<string, DeltaRecord[]>()
  for (const delta of remoteDeltas) {
    const key = `${delta.entity}:${delta.doc_id}`
    if (!remoteGroups.has(key)) remoteGroups.set(key, [])
    remoteGroups.get(key)!.push(delta)
  }

  // Group local changes by (entity, doc_id)
  const localGroups = new Map<string, ChangeLogEntry[]>()
  for (const change of localChanges) {
    const key = `${change.entity}:${change.doc_id}`
    if (!localGroups.has(key)) localGroups.set(key, [])
    localGroups.get(key)!.push(change)
  }

  for (const [key, entityDeltas] of remoteGroups) {
    const [entity, docId] = key.split(":") as [ChangeEntity, string]

    // Deduplicate: for each field_name, keep only the latest remote delta
    const latestRemoteByField = new Map<string, DeltaRecord>()
    for (const delta of entityDeltas) {
      if (!delta.field_name) continue
      const existing = latestRemoteByField.get(delta.field_name)
      if (!existing || new Date(delta.changed_at).getTime() > new Date(existing.changed_at).getTime()) {
        latestRemoteByField.set(delta.field_name, delta)
      }
    }

    // Determine the effective operation
    const lastDelta = entityDeltas[entityDeltas.length - 1]
    const effectiveOp = lastDelta.operation

    // Handle delete
    if (effectiveOp === "delete") {
      patches.push({entity, doc_id: docId, operation: "delete", fields: {}})
      continue
    }

    // Handle insert — all remote fields applied
    if (effectiveOp === "insert") {
      const fields: Record<string, string | null> = {}
      for (const [fieldName, delta] of latestRemoteByField) {
        fields[fieldName] = delta.new_value
      }
      // Also include deltas without field_name dedup for insert
      for (const delta of entityDeltas) {
        if (delta.field_name && !(delta.field_name in fields)) {
          fields[delta.field_name] = delta.new_value
        }
      }
      patches.push({entity, doc_id: docId, operation: "insert", fields})
      continue
    }

    // Handle update — field-level LWW
    const localEntityChanges = localGroups.get(key) ?? []

    // Deduplicate local: for each field_name, keep only the latest local change
    const latestLocalByField = new Map<string, ChangeLogEntry>()
    for (const change of localEntityChanges) {
      if (!change.field_name) continue
      const existing = latestLocalByField.get(change.field_name)
      if (!existing || new Date(change.changed_at).getTime() > new Date(existing.changed_at).getTime()) {
        latestLocalByField.set(change.field_name, change)
      }
    }

    const fields: Record<string, string | null> = {}

    for (const [fieldName, remoteDelta] of latestRemoteByField) {
      const localChange = latestLocalByField.get(fieldName)

      if (!localChange) {
        // Only remote changed — apply
        fields[fieldName] = remoteDelta.new_value
        continue
      }

      // Both changed — LWW
      const localTime = new Date(localChange.changed_at).getTime()
      const remoteTime = new Date(remoteDelta.changed_at).getTime()
      let remoteWins: boolean

      if (remoteTime > localTime) {
        remoteWins = true
      } else if (remoteTime < localTime) {
        remoteWins = false
      } else {
        // Tie — strategy decides
        remoteWins = strategy === "pull"
      }

      const outcome: MergeOutcome = remoteWins ? "remote_wins" : "local_wins"

      conflicts.push({
        entity,
        doc_id: docId,
        field_name: fieldName,
        local_value: localChange.new_value,
        remote_value: remoteDelta.new_value,
        local_changed_at: localChange.changed_at,
        remote_changed_at: remoteDelta.changed_at,
        outcome,
        resolved_value: remoteWins ? remoteDelta.new_value : localChange.new_value,
      })

      if (remoteWins) {
        fields[fieldName] = remoteDelta.new_value
      }
      // If local wins, field is NOT in patch (local already has it)
    }

    if (Object.keys(fields).length > 0) {
      patches.push({entity, doc_id: docId, operation: "update", fields})
    }
  }

  return {patches, conflicts}
}
