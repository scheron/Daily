import type {SyncProvider} from "../../types/syncProvider"

/**
 * Which single sync provider is active for a device's settings, never more than one. A server
 * binding wins a state where both flags are somehow set, since that state is unreachable through
 * `assertSingleActiveProvider` and resolving it to two remotes is the one outcome the spec forbids
 * outright.
 *
 * The parameter is structural so that the renderer's credential-free settings view answers the
 * question through this same function, rather than through a second reading of the same rule.
 *
 * @param sync - The sync settings to read, stored or narrowed for the renderer.
 */
export function resolveActiveProvider(sync: {iCloud: {enabled: boolean}; server: {enabled: boolean; binding: object | null}}): SyncProvider {
  if (sync.server.enabled && sync.server.binding) return "server"
  if (sync.iCloud.enabled) return "icloud"
  return "off"
}
