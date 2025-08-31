import {computed, nextTick, ref} from "vue"
import {useTourStore} from "@/stores/tour.store"
import {useVOnboarding} from "v-onboarding"

export function useTour() {
  const tourStore = useTourStore()
  const onboardingRef = ref()
  const {start, finish: _finish, goToStep: _goToStep} = useVOnboarding(onboardingRef)

  const onboardingConfig = computed(() => ({
    overlay: true,
    popper: {
      arrow: true,
      strategy: 'absolute',
      modifiers: [
        {
          name: "offset",
          options: {
            offset: [0, 12], // Дефолтный отступ, переопределяется для каждого шага
          },
        },
        {
          name: "preventOverflow",
          options: {
            boundary: "viewport",
            padding: 20, // Увеличенный отступ от краев
            altBoundary: true,
            tether: false, // Позволяет полностью отделиться от элемента если нужно
          },
        },
        {
          name: "flip",
          options: {
            fallbackPlacements: [
              "top", "top-start", "top-end",
              "bottom", "bottom-start", "bottom-end", 
              "left", "left-start", "left-end",
              "right", "right-start", "right-end"
            ],
            flipVariations: true, // Позволяет варианты (start/end)
            allowedAutoPlacements: [
              "top", "bottom", "left", "right",
              "top-start", "top-end", "bottom-start", "bottom-end"
            ],
          },
        },
        {
          name: "shift",
          options: {
            padding: 20,
          },
        },
        {
          name: "size",
          options: {
            apply({state, name}: {state: any, name: string}) {
              // Уменьшаем размер попапа если он не помещается
              const {width, height} = state.rects.popper;
              const maxWidth = Math.min(350, window.innerWidth - 40);
              const maxHeight = Math.min(400, window.innerHeight - 40);
              
              if (width > maxWidth || height > maxHeight) {
                Object.assign(state.styles[name], {
                  maxWidth: `${maxWidth}px`,
                  maxHeight: `${maxHeight}px`,
                  overflow: 'auto'
                });
              }
            },
          },
        },
        {
          name: "arrow",
          options: {
            padding: 8, // Отступ стрелки от краев
          },
        },
      ],
    },
    scrollToElement: true,
    hideButtons: {
      previous: false,
      next: false,
      skip: false,
    },
    texts: {
      previous: "Назад",
      next: "Далее",
      skip: "Пропустить",
      finish: "Завершить",
    },
  }))

  // V-Onboarding events
  const onboardingEvents = {
    onSkip: () => {
      tourStore.skipTour()
    },
    onFinish: () => {
      tourStore.completeTour()
    },
    onExit: () => {
      tourStore.stopTour()
    },
  }

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
      const element = await waitForElement(step.attachTo.element, 1000)
      if (!element) {
        missingElements.push(step.attachTo.element)
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

    if (allElementsExist && onboardingRef.value) {
      tourStore.startTour()
      start()
    } else {
      console.warn("Tour: Cannot start tour - some elements are missing or onboarding not ready")
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

  // Функция для определения оптимальной позиции элемента
  function getBestPlacement(element: Element): string {
    const rect = element.getBoundingClientRect()
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    }
    
    // Размеры тура (примерные)
    const tourWidth = 320
    const tourHeight = 200
    const padding = 20
    
    // Проверяем доступное пространство в каждом направлении
    const spaceTop = rect.top
    const spaceBottom = viewport.height - rect.bottom
    const spaceLeft = rect.left
    const spaceRight = viewport.width - rect.right
    
    // Определяем приоритетные позиции на основе доступного места
    const positions: Array<{placement: string, score: number}> = []
    
    // Снизу
    if (spaceBottom >= tourHeight + padding) {
      positions.push({
        placement: spaceLeft >= tourWidth / 2 && spaceRight >= tourWidth / 2 
          ? 'bottom' 
          : spaceLeft < tourWidth / 2 
            ? 'bottom-start' 
            : 'bottom-end',
        score: spaceBottom
      })
    }
    
    // Сверху
    if (spaceTop >= tourHeight + padding) {
      positions.push({
        placement: spaceLeft >= tourWidth / 2 && spaceRight >= tourWidth / 2 
          ? 'top' 
          : spaceLeft < tourWidth / 2 
            ? 'top-start' 
            : 'top-end',
        score: spaceTop
      })
    }
    
    // Справа
    if (spaceRight >= tourWidth + padding) {
      positions.push({
        placement: spaceTop >= tourHeight / 2 && spaceBottom >= tourHeight / 2 
          ? 'right' 
          : spaceTop < tourHeight / 2 
            ? 'right-start' 
            : 'right-end',
        score: spaceRight
      })
    }
    
    // Слева
    if (spaceLeft >= tourWidth + padding) {
      positions.push({
        placement: spaceTop >= tourHeight / 2 && spaceBottom >= tourHeight / 2 
          ? 'left' 
          : spaceTop < tourHeight / 2 
            ? 'left-start' 
            : 'left-end',
        score: spaceLeft
      })
    }
    
    // Если нет хороших позиций, используем дефолтные с флипом
    if (positions.length === 0) {
      return 'bottom' // Popper.js сам найдет лучшее место с помощью flip
    }
    
    // Сортируем по убыванию доступного места и возвращаем лучшую позицию
    positions.sort((a, b) => b.score - a.score)
    return positions[0].placement
  }

  // Функция для получения конфигурации позиционирования для конкретного шага
  function getStepConfig(step: any) {
    const baseConfig = onboardingConfig.value
    
    // Если позиция не указана или указана как 'auto', определяем автоматически
    if (!step.attachTo.on || step.attachTo.on === 'auto') {
      const element = document.querySelector(step.attachTo.element)
      if (element) {
        step.attachTo.on = getBestPlacement(element)
      } else {
        step.attachTo.on = 'bottom'
      }
    }
    
    if (step.options?.offset || step.options?.modifiers) {
      // Обновляем настройки для конкретного шага
      const modifiers = [...baseConfig.popper.modifiers]
      
      // Обновляем offset если указан
      if (step.options.offset) {
        const offsetModifierIndex = modifiers.findIndex(m => m.name === 'offset')
        if (offsetModifierIndex >= 0) {
          modifiers[offsetModifierIndex] = {
            ...modifiers[offsetModifierIndex],
            options: {
              offset: step.options.offset
            }
          }
        }
      }
      
      // Добавляем кастомные модификаторы
      const customModifiers = step.options.modifiers || []
      
      return {
        ...baseConfig,
        popper: {
          ...baseConfig.popper,
          modifiers: [...modifiers, ...customModifiers]
        }
      }
    }
    
    return baseConfig
  }

  return {
    // Store state
    isTourActive: computed(() => tourStore.isTourActive),
    currentStep: computed(() => tourStore.currentStep),
    tourSteps: computed(() => tourStore.tourSteps),
    isFirstTime: computed(() => tourStore.isFirstTime),
    totalSteps: computed(() => tourStore.totalSteps),

    // V-Onboarding configuration
    onboardingConfig,
    onboardingEvents,
    onboardingRef,

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
    getStepConfig,
    getBestPlacement,
  }
}
