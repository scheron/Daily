import {useSettingsStore} from "@/stores/settings.store"
import {toRawDeep} from "@/utils/ui/toRawDeep"

import type {AIConfig} from "@daily/protocol"

export async function updateAiConfig(updates: Partial<AIConfig>): Promise<void> {
  const success = await window.BridgeIPC["ai:update-config"](toRawDeep(updates))
  if (success) await useSettingsStore().revalidate()
}
