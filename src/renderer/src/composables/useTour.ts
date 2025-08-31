/**
 * Simple and convenient composable for tours
 * useTour(steps) - creates and returns a tour with given steps
 */

import { ref, computed } from 'vue'
import type { TourStep } from '@/types/tour'
import { setActiveTour, clearActiveTour } from './useActiveTour'

/**
 * Creates a tour with given steps
 * @param steps - array of tour steps
 * @param options - additional options
 */
export function useTour(
  steps: TourStep[] = [],
  options: {
    id?: string
    autoStart?: boolean
    skippable?: boolean
    onComplete?: () => void
    onSkip?: () => void
  } = {}
) {
  // Local tour state
  const isActive = ref(false)
  const currentStep = ref(0)
  const tourSteps = ref<TourStep[]>(steps)
  
  // Utility functions
  const waitForElement = (selector: string, timeout = 5000): Promise<HTMLElement> => {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector) as HTMLElement
      if (element) {
        resolve(element)
        return
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector) as HTMLElement
        if (element) {
          observer.disconnect()
          resolve(element)
        }
      })

      observer.observe(document.body, {
        childList: true,
        subtree: true
      })

      setTimeout(() => {
        observer.disconnect()
        reject(new Error(`Element "${selector}" not found within ${timeout}ms`))
      }, timeout)
    })
  }

  const ensureElementsExist = async (selectors: string[]): Promise<boolean> => {
    try {
      await Promise.all(selectors.map(selector => waitForElement(selector)))
      return true
    } catch {
      return false
    }
  }

  // Computed properties
  const totalSteps = computed(() => tourSteps.value.length)
  const currentTourStep = computed(() => tourSteps.value[currentStep.value] || null)
  const canGoNext = computed(() => currentStep.value < totalSteps.value - 1)
  const canGoPrev = computed(() => currentStep.value > 0)
  const isFirst = computed(() => currentStep.value === 0)
  const isLast = computed(() => currentStep.value === totalSteps.value - 1)

  // Create tour object
  const tourObject = {
    isActive,
    currentStep,
    currentTourStep,
    totalSteps,
    canGoNext,
    canGoPrev,
    isFirst,
    isLast,
    tourSteps,
    start: async () => await start(),
    stop: () => stop(),
    next: async () => await next(),
    previous: async () => await previous(),
    goToStep: async (stepIndex: number) => await goToStep(stepIndex),
    skip: () => skip(),
    complete: () => complete(),
    proceedNext: async () => await proceedNext(),
    notifyAction: async (actionType: string, data?: any) => await notifyAction(actionType, data),
    updateSteps: (newSteps: TourStep[]) => updateSteps(newSteps),
    waitForElement,
    ensureElementsExist
  }

  // Tour control methods
  async function start() {
    if (tourSteps.value.length === 0) {
      console.warn('No steps provided for tour')
      return
    }
    
    // Update local state
    isActive.value = true
    currentStep.value = 0
    
    // Set as globally active tour
    setActiveTour(tourObject)

    // Execute beforeShow for first step
    const firstStep = currentTourStep.value
    if (firstStep?.beforeShow) {
      await firstStep.beforeShow()
    }
  }

  function stop() {
    isActive.value = false
    currentStep.value = 0
    clearActiveTour()
  }

  async function next() {
    const currentStepData = currentTourStep.value
    
    // Check if we can proceed to next step
    if (currentStepData?.canProceed) {
      const canProceed = await currentStepData.canProceed()
      if (!canProceed) return
    }
    
    // Execute afterComplete for current step
    if (currentStepData?.afterComplete) {
      await currentStepData.afterComplete()
    }

    if (canGoNext.value) {
      currentStep.value++
      
      // Execute beforeShow for next step
      const nextStepData = currentTourStep.value
      if (nextStepData?.beforeShow) {
        await nextStepData.beforeShow()
      }
    } else {
      complete()
    }
  }

  async function previous() {
    if (canGoPrev.value) {
      currentStep.value--
      
      // Execute beforeShow for previous step
      const prevStepData = currentTourStep.value
      if (prevStepData?.beforeShow) {
        await prevStepData.beforeShow()
      }
    }
  }

  async function goToStep(stepIndex: number) {
    if (stepIndex >= 0 && stepIndex < totalSteps.value) {
      currentStep.value = stepIndex
      
      const stepData = currentTourStep.value
      if (stepData?.beforeShow) {
        await stepData.beforeShow()
      }
    }
  }

  function skip() {
    if (options.onSkip) {
      options.onSkip()
    }
    complete()
  }

  function complete() {
    if (options.onComplete) {
      options.onComplete()
    }
    
    isActive.value = false
    currentStep.value = 0
    clearActiveTour()
  }

  /**
   * Force proceed to next step (for interactive tours)
   */
  async function proceedNext() {
    if (canGoNext.value) {
      const currentStepData = currentTourStep.value
      
      if (currentStepData?.afterComplete) {
        await currentStepData.afterComplete()
      }
      
      currentStep.value++
      
      const nextStepData = currentTourStep.value
      if (nextStepData?.beforeShow) {
        await nextStepData.beforeShow()
      }
    } else {
      complete()
    }
  }

  /**
   * Notify tour about user action
   */
  async function notifyAction(actionType: string, data?: any) {
    const currentStepData = currentTourStep.value
    if (currentStepData?.onUserAction) {
      await currentStepData.onUserAction(actionType, data)
    }
    
    // Auto proceed if step is waiting for action
    if (currentStepData?.waitForAction || currentStepData?.interactive) {
      await proceedNext()
    }
  }

  /**
   * Update tour steps
   */
  function updateSteps(newSteps: TourStep[]) {
    tourSteps.value = newSteps
    if (isActive.value && currentStep.value >= newSteps.length) {
      currentStep.value = Math.max(0, newSteps.length - 1)
    }
  }

  // Auto start if enabled
  if (options.autoStart && steps.length > 0) {
    setTimeout(() => start(), 100)
  }

  return tourObject
}

// Экспорт основного composable
export default useTour
