import {isNewerOrEqual} from "@shared/utils/date/validators"

import type {SettingsDoc} from "@/types/database"

/**
 * Merge settings document (simple LWW, no soft-delete).
 */
export function mergeSettings(local: SettingsDoc | null, remote: SettingsDoc | null): SettingsDoc | null {
  if (!local && !remote) return null
  if (!local) return remote
  if (!remote) return local

  // LWW by updatedAt
  return isNewerOrEqual(local.updatedAt, remote.updatedAt) ? local : remote
}
