import type {useLoadingState} from "@/composables/useLoadingState"
import type {AIConfig, AIMessage} from "@shared/types/ai"
import type {ISODate} from "@shared/types/common"
import type {ComputedRef, Ref} from "vue"

type LoadingState = ReturnType<typeof useLoadingState>

export type AiStreamingContext = {
  messages: Ref<AIMessage[]>
}

export type AiSessionContext = {
  messages: Ref<AIMessage[]>
  chatTimeStarted: Ref<ISODate | null>
}

export type AiModelsContext = {
  config: ComputedRef<AIConfig | null>
  isDisabled: ComputedRef<boolean>
  connectionState: LoadingState
  isConnected: Ref<boolean>
}
