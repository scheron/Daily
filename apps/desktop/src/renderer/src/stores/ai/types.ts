import type {AIConfig, ISODate} from "@daily/protocol"
import type {AIMessage} from "@shared/types/ai"
import type {ComputedRef, Ref} from "vue"
import type {useLoadingState} from "../../composables/useLoadingState"

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
