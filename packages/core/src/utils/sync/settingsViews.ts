import type {ServerBindingView, ServerSyncBinding, Settings, SettingsView} from "@daily/protocol"

/** Narrows a stored `ServerSyncBinding` to the fields safe to hand to the renderer; the device credential never leaves this module's callers. */
export function toBindingView(binding: ServerSyncBinding): ServerBindingView {
  return {
    baseUrl: binding.baseUrl,
    serverId: binding.serverId,
    serverName: binding.serverName,
    deviceId: binding.deviceId,
    deviceName: binding.deviceName,
    fingerprint: binding.fingerprint,
    insecure: binding.insecure,
    boundAt: binding.boundAt,
  }
}

/** Narrows a full `Settings` to the view that crosses IPC, stripping the device credential out of the server binding. */
export function toSettingsView(settings: Settings): SettingsView {
  const binding = settings.sync.server.binding
  return {...settings, sync: {...settings.sync, server: {...settings.sync.server, binding: binding ? toBindingView(binding) : null}}}
}
