/**
 * Современный composable для работы с турами
 * Предоставляет удобный API для создания и управления турами
 */

import { ref, computed, nextTick } from 'vue'
import { useTourStore } from '@/stores/tour.store'
import { createTour, createStep, quickStep, type TourStepBuilder } from '@/utils/tour-builder'
import type { TourStep, TourConfig, CreateStepOptions } from '@/types/tour'

/**
 * Основной composable для работы с турами
 */
export function useTour() {
  const tourStore = useTourStore()
  
  // Геттеры состояния
  const isActive = computed(() => tourStore.isTourActive)
  const currentStep = computed(() => tourStore.currentStep)
  const currentTourStep = computed(() => tourStore.currentTourStep)
  const totalSteps = computed(() => tourStore.totalSteps)
  const canGoNext = computed(() => tourStore.canGoNext)
  const canGoPrev = computed(() => tourStore.canGoPrev)
  const tourState = computed(() => tourStore.tourState)

  // Методы управления
  const start = (config?: TourConfig) => tourStore.startTour(config)
  const stop = () => tourStore.stopTour()
  const next = () => tourStore.nextStep()
  const previous = () => tourStore.prevStep()
  const goTo = (stepIndex: number) => tourStore.goToStep(stepIndex)
  const skip = () => tourStore.skipTour()
  const complete = () => tourStore.completeTour()

  // Установка конфигурации
  const setConfig = (config: TourConfig) => tourStore.setTourConfig(config)

  // Вспомогательные функции
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
        reject(new Error(`Element with selector "${selector}" not found within ${timeout}ms`))
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

  return {
    // State
    isActive,
    currentStep,
    currentTourStep,
    totalSteps,
    canGoNext,
    canGoPrev,
    tourState,

    // Methods
    start,
    stop,
    next,
    previous,
    goTo,
    skip,
    complete,
    setConfig,

    // Utilities
    waitForElement,
    ensureElementsExist,
  }
}

/**
 * Builder composable для создания туров
 */
export function useTourBuilder() {
  /**
   * Создает новый тур
   */
  const newTour = (id: string) => createTour(id)

  /**
   * Создает новый шаг
   */
  const newStep = (id: string) => createStep(id)

  /**
   * Быстрое создание шага
   */
  const quickCreateStep = (
    id: string,
    target: string,
    title: string,
    description: string,
    placement: any = 'auto'
  ) => quickStep(id, target, title, description, placement)

  /**
   * Создание Welcome тура
   */
  const createWelcomeTour = () => {
    const store = useTourStore()
    return store.createWelcomeTour()
  }

  /**
   * Создание кастомного тура из массива шагов
   */
  const createCustomTour = (steps: TourStep[], name = 'Custom Tour') => {
    const store = useTourStore()
    return store.createCustomTour(steps, name)
  }

  return {
    newTour,
    newStep,
    quickCreateStep,
    createWelcomeTour,
    createCustomTour,
  }
}

/**
 * Специализированный composable для конкретных сценариев
 */
export function useTourScenarios() {
  const tour = useTour()
  const builder = useTourBuilder()

  /**
   * Запуск welcome тура для новых пользователей
   */
  const startWelcomeTour = async () => {
    const config = builder.createWelcomeTour()
    await tour.start(config)
  }

  /**
   * Создание и запуск тура для демонстрации новых функций
   */
  const createFeatureTour = (features: Array<{
    id: string
    selector: string
    title: string
    description: string
    placement?: any
  }>) => {
    const tourConfig = builder.newTour('feature-tour')
      .name('Новые возможности')
      .autoStart(false)
      .skippable(true)

    features.forEach(feature => {
      tourConfig.addStep(builder.quickCreateStep(
        feature.id,
        feature.selector,
        feature.title,
        feature.description,
        feature.placement
      ))
    })

    return tourConfig.build()
  }

  /**
   * Быстрая демонстрация одного элемента
   */
  const quickDemo = async (
    selector: string,
    title: string,
    description: string,
    placement: any = 'auto'
  ) => {
    const config = builder.newTour('quick-demo')
      .name('Быстрая демонстрация')
      .autoStart(true)
      .skippable(true)
      .addStep(builder.quickCreateStep('demo', selector, title, description, placement))
      .build()

    await tour.start(config)
  }

  return {
    startWelcomeTour,
    createFeatureTour,
    quickDemo,
  }
}

/**
 * Простые утилиты для добавления тур-атрибутов
 */
export function useTourHelpers() {
  /**
   * Создает атрибут data-tour для элемента
   */
  const tourAttr = (id: string) => ({ 'data-tour': id })

  /**
   * Создает селектор для тур-элемента
   */
  const tourSelector = (id: string) => `[data-tour="${id}"]`

  /**
   * Проверяет, существует ли элемент с тур-атрибутом
   */
  const hasTourElement = (id: string) => {
    return !!document.querySelector(tourSelector(id))
  }

  /**
   * Получает все элементы с тур-атрибутами на странице
   */
  const getAllTourElements = () => {
    const elements = document.querySelectorAll('[data-tour]')
    return Array.from(elements).map(el => ({
      element: el as HTMLElement,
      id: el.getAttribute('data-tour') || '',
      selector: `[data-tour="${el.getAttribute('data-tour')}"]`
    }))
  }

  return {
    tourAttr,
    tourSelector,
    hasTourElement,
    getAllTourElements,
  }
}

// Экспорт всех composables для удобства
export default useTour
