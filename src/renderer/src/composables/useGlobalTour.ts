/**
 * Global tour manager
 * Provides single point for rendering any tours in the application
 */

import { ref, computed } from 'vue'
import type { TourStep } from '@/types/tour'

// Global active tour state
const globalIsActive = ref(false)
const globalCurrentStep = ref(0)
const globalTourSteps = ref<TourStep[]>([])
const globalTourId = ref<string>('')

// Computed properties for global tour
const globalTotalSteps = computed(() => globalTourSteps.value.length)
const globalCurrentTourStep = computed(() => globalTourSteps.value[globalCurrentStep.value] || null)
const globalCanGoNext = computed(() => globalCurrentStep.value < globalTotalSteps.value - 1)
const globalCanGoPrev = computed(() => globalCurrentStep.value > 0)

// Callbacks for current tour
let globalCallbacks: {
  onNext?: () => Promise<void>
  onPrevious?: () => Promise<void>
  onSkip?: () => void
  onClose?: () => void
} = {}

/**
 * Global tour manager
 */
export function useGlobalTourManager() {
  /**
   * Activate tour globally
   */
  function activateTour(
    tourId: string,
    steps: TourStep[],
    currentStep: number = 0,
    callbacks: {
      onNext?: () => Promise<void>
      onPrevious?: () => Promise<void>
      onSkip?: () => void
      onClose?: () => void
    } = {}
  ) {
    globalTourId.value = tourId
    globalTourSteps.value = steps
    globalCurrentStep.value = currentStep
    globalIsActive.value = true
    globalCallbacks = callbacks
  }

  /**
   * Deactivate global tour
   */
  function deactivateTour() {
    globalIsActive.value = false
    globalCurrentStep.value = 0
    globalTourSteps.value = []
    globalTourId.value = ''
    globalCallbacks = {}
  }

  /**
   * Go to next step
   */
  async function nextStep() {
    if (globalCallbacks.onNext) {
      await globalCallbacks.onNext()
    } else if (globalCanGoNext.value) {
      globalCurrentStep.value++
    } else {
      deactivateTour()
    }
  }

  /**
   * Go to previous step
   */
  async function previousStep() {
    if (globalCallbacks.onPrevious) {
      await globalCallbacks.onPrevious()
    } else if (globalCanGoPrev.value) {
      globalCurrentStep.value--
    }
  }

  /**
   * Skip tour
   */
  function skipTour() {
    if (globalCallbacks.onSkip) {
      globalCallbacks.onSkip()
    }
    deactivateTour()
  }

  /**
   * Close tour
   */
  function closeTour() {
    if (globalCallbacks.onClose) {
      globalCallbacks.onClose()
    }
    deactivateTour()
  }

  return {
    // Control methods
    activateTour,
    deactivateTour,
    nextStep,
    previousStep,
    skipTour,
    closeTour,

    // State (read-only)
    isActive: computed(() => globalIsActive.value),
    currentStep: computed(() => globalCurrentStep.value),
    currentTourStep: computed(() => globalCurrentTourStep.value),
    totalSteps: computed(() => globalTotalSteps.value),
    canGoNext: computed(() => globalCanGoNext.value),
    canGoPrev: computed(() => globalCanGoPrev.value),
    tourId: computed(() => globalTourId.value),
  }
}

/**
 * Hook for using global tour (read-only)
 */
export function useGlobalTour() {
  return {
    isActive: computed(() => globalIsActive.value),
    currentStep: computed(() => globalCurrentStep.value),
    currentTourStep: computed(() => globalCurrentTourStep.value),
    totalSteps: computed(() => globalTotalSteps.value),
    canGoNext: computed(() => globalCanGoNext.value),
    canGoPrev: computed(() => globalCanGoPrev.value),
    tourId: computed(() => globalTourId.value),
  }
}
