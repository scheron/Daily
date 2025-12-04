import {computed, readonly, ref} from "vue"

const STATE = {
  IDLE: "IDLE",
  LOADING: "LOADING",
  LOADED: "LOADED",
  ERROR: "ERROR",
} as const

export type LoadingState = keyof typeof STATE

export function useLoadingState(initialState: LoadingState = STATE.IDLE) {
  const state = ref<LoadingState>(initialState)

  const isIdle = computed(() => state.value === STATE.IDLE)
  const isLoading = computed(() => state.value === STATE.LOADING)
  const isLoaded = computed(() => state.value === STATE.LOADED)
  const isError = computed(() => state.value === STATE.ERROR)

  function setState(newState: LoadingState) {
    if (state.value === newState) return
    state.value = newState
  }

  function resetState() {
    state.value = STATE.IDLE
  }

  return {
    isIdle: readonly(isIdle),
    isLoading: readonly(isLoading),
    isLoaded: readonly(isLoaded),
    isError: readonly(isError),
    state: readonly(state),

    setState,
    resetState,
  }
}
