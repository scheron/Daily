/**
 * Global active tour state
 * Simple singleton to track which tour is currently active
 */

import { ref, type Ref } from 'vue'
import type { TourStep } from '@/types/tour'

interface TourObject {
  isActive: Ref<boolean>
  currentStep: Ref<number>
  currentTourStep: Ref<TourStep | null>
  totalSteps: Ref<number>
  canGoNext: Ref<boolean>
  canGoPrev: Ref<boolean>
  isFirst: Ref<boolean>
  isLast: Ref<boolean>
  tourSteps: Ref<TourStep[]>
  start: () => Promise<void>
  stop: () => void
  next: () => Promise<void>
  previous: () => Promise<void>
  goToStep: (stepIndex: number) => Promise<void>
  skip: () => void
  complete: () => void
  proceedNext: () => Promise<void>
  notifyAction: (actionType: string, data?: any) => Promise<void>
  updateSteps: (newSteps: TourStep[]) => void
  waitForElement: (selector: string, timeout?: number) => Promise<HTMLElement>
  ensureElementsExist: (selectors: string[]) => Promise<boolean>
}

// Global active tour reference
const activeTour = ref<TourObject | null>(null)

/**
 * Set currently active tour
 */
export function setActiveTour(tour: TourObject) {
  activeTour.value = tour
}

/**
 * Clear active tour
 */
export function clearActiveTour() {
  activeTour.value = null
}

/**
 * Get current active tour
 */
export function useActiveTour() {
  return activeTour
}
