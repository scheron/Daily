import {computed, readonly, ref} from "vue"

type LoadingState = "IDLE" | "LOADING" | "LOADED" | "ERROR"

export function useLoadingState() {
  const state = ref<LoadingState>("IDLE")

  const isLoading = computed(() => state.value === "LOADING")
  const isLoaded = computed(() => state.value === "LOADED")
  const isError = computed(() => state.value === "ERROR")

  function setState(newState: LoadingState) {
    if (state.value === newState) return
    state.value = newState
  }

  return {
    isLoading: readonly(isLoading),
    isLoaded: readonly(isLoaded),
    isError: readonly(isError),

    setState,
  }
}
