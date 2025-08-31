import {computed, nextTick} from "vue"
import {useTourStore} from "@/stores/tour.store"

export function useTour() {
  const tourStore = useTourStore()

  // Helper methods
  async function waitForElement(selector: string, timeout = 5000): Promise<Element | null> {
    return new Promise((resolve) => {
      const startTime = Date.now()

      function check() {
        const element = document.querySelector(selector)
        if (element) {
          resolve(element)
          return
        }

        if (Date.now() - startTime >= timeout) {
          console.warn(`Tour: Element not found: ${selector}`)
          resolve(null)
          return
        }

        requestAnimationFrame(check)
      }

      check()
    })
  }

  async function ensureElementsExist() {
    const steps = tourStore.tourSteps
    const missingElements: string[] = []

    for (const step of steps) {
      const element = await waitForElement(step.target, 1000)
      if (!element) {
        missingElements.push(step.target)
      }
    }

    if (missingElements.length > 0) {
      console.warn("Tour: Some elements are not available:", missingElements)
    }

    return missingElements.length === 0
  }

  async function startTourSafely() {
    // Ждем, пока DOM будет готов
    await nextTick()

    // Проверяем наличие всех элементов
    const allElementsExist = await ensureElementsExist()

    if (allElementsExist) {
      tourStore.startTour()
    } else {
      console.warn("Tour: Cannot start tour - some elements are missing")
      // Можно попробовать запустить тур через некоторое время
      setTimeout(() => {
        startTourSafely()
      }, 2000)
    }
  }

  // Управление туром из компонентов
  function initializeTour() {
    if (tourStore.isFirstTime) {
      setTimeout(() => {
        startTourSafely()
      }, 1500)
    }
  }

  function restartTour() {
    tourStore.resetTutorial()
    setTimeout(() => {
      startTourSafely()
    }, 500)
  }

  return {
    // Store state
    isTourActive: computed(() => tourStore.isTourActive),
    currentStep: computed(() => tourStore.currentStep),
    tourSteps: computed(() => tourStore.tourSteps),
    isFirstTime: computed(() => tourStore.isFirstTime),
    totalSteps: computed(() => tourStore.totalSteps),
    currentTourStep: computed(() => tourStore.tourSteps[tourStore.currentStep]),

    // Methods
    startTour: tourStore.startTour,
    stopTour: tourStore.stopTour,
    nextStep: tourStore.nextStep,
    prevStep: tourStore.prevStep,
    skipTour: tourStore.skipTour,
    completeTour: tourStore.completeTour,
    resetTutorial: tourStore.resetTutorial,

    // Helper methods
    initializeTour,
    restartTour,
    startTourSafely,
  }
}
