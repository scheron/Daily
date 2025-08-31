import {ref, computed} from "vue"
import {defineStore} from "pinia"
import {useSettingsStore} from "@/composables/useSettingsStore"
import type {VOnboardingStep} from 'v-onboarding'

export interface TourStep extends VOnboardingStep {
  attachTo: {
    element: string
    on?: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end' | 'left-start' | 'left-end' | 'right-start' | 'right-end' | 'auto'
  }
  content: {
    title: string
    description: string
  }
  options?: {
    scrollToElement?: boolean
    highlight?: boolean
    showButtons?: boolean
    canClickTarget?: boolean
    offset?: [number, number] // [skidding, distance]
    placement?: string
    modifiers?: any[]
  }
}

export const useTourStore = defineStore("tour", () => {
  // Состояние туториала
  const isTourActive = ref(false)
  const currentStep = ref(0)
  const isFirstLaunch = useSettingsStore("tutorial.completed", false)

  // Определение шагов туториала
  const tourSteps = ref<TourStep[]>([
    {
      attachTo: {
        element: '[data-tour="welcome"]',
        on: 'bottom-start'
      },
      content: {
        title: "Добро пожаловать в Daily!",
        description: "Daily - это минималистичное приложение для управления ежедневными задачами. Давайте познакомимся с основными возможностями."
      },
      options: {
        scrollToElement: false,
        highlight: true,
        offset: [0, 16]
      }
    },
    {
      attachTo: {
        element: '[data-tour="new-task-button"]',
        on: 'bottom-end'
      },
      content: {
        title: "Создание задач",
        description: "Нажмите эту кнопку, чтобы создать новую задачу. Вы можете добавлять описание, теги и устанавливать время выполнения."
      },
      options: {
        highlight: true,
        canClickTarget: false,
        offset: [-8, 12]
      }
    },
    {
      attachTo: {
        element: '[data-tour="calendar"]',
        on: 'right-start'
      },
      content: {
        title: "Календарь",
        description: "В календаре вы можете переключаться между днями и видеть задачи на любую дату. Просто кликните на нужный день."
      },
      options: {
        scrollToElement: true,
        highlight: true,
        offset: [16, 0]
      }
    },
    {
      attachTo: {
        element: '[data-tour="active-tasks"]',
        on: 'right'
      },
      content: {
        title: "Активные задачи",
        description: "Здесь отображаются ваши недавние и активные задачи для быстрого доступа."
      },
      options: {
        highlight: true,
        offset: [16, 0]
      }
    },
    {
      attachTo: {
        element: '[data-tour="tags"]',
        on: 'right'
      },
      content: {
        title: "Теги",
        description: "Организуйте ваши задачи с помощью тегов. Создавайте категории и фильтруйте задачи по ним."
      },
      options: {
        highlight: true,
        offset: [16, 0]
      }
    },
    {
      attachTo: {
        element: '[data-tour="themes"]',
        on: 'right-end'
      },
      content: {
        title: "Темы оформления",
        description: "Настройте внешний вид приложения под себя. Выберите светлую, темную тему или следуйте системным настройкам."
      },
      options: {
        highlight: true,
        offset: [16, 8]
      }
    },
    {
      attachTo: {
        element: '[data-tour="task-list"]',
        on: 'auto' // Автоматическое определение лучшей позиции
      },
      content: {
        title: "Список задач",
        description: "Здесь отображаются все ваши задачи на выбранный день. Отмечайте выполненные задачи и управляйте ими."
      },
      options: {
        highlight: true,
        offset: [-16, 0]
      }
    },
    {
      attachTo: {
        element: '[data-tour="toolbar"]',
        on: 'auto' // Автоматическое определение лучшей позиции
      },
      content: {
        title: "Панель инструментов",
        description: "Используйте фильтры и сортировку для удобной работы с задачами. Также здесь можно переключать режимы отображения."
      },
      options: {
        highlight: true,
        offset: [0, 12]
      }
    }
  ])

  // Computed properties
  const isFirstTime = computed(() => !isFirstLaunch.value)
  const totalSteps = computed(() => tourSteps.value.length)
  const canGoNext = computed(() => currentStep.value < totalSteps.value - 1)
  const canGoPrev = computed(() => currentStep.value > 0)

  // Методы управления туром
  function startTour() {
    isTourActive.value = true
    currentStep.value = 0
  }

  function stopTour() {
    isTourActive.value = false
    currentStep.value = 0
  }

  function nextStep() {
    if (canGoNext.value) {
      currentStep.value++
    } else {
      completeTour()
    }
  }

  function prevStep() {
    if (canGoPrev.value) {
      currentStep.value--
    }
  }

  function goToStep(stepIndex: number) {
    if (stepIndex >= 0 && stepIndex < totalSteps.value) {
      currentStep.value = stepIndex
    }
  }

  function skipTour() {
    completeTour()
  }

  function completeTour() {
    isTourActive.value = false
    currentStep.value = 0
    isFirstLaunch.value = true
  }

  // Проверка, нужно ли показать тур при первом запуске
  function checkAndStartTour() {
    if (isFirstTime.value) {
      // Небольшая задержка, чтобы дать интерфейсу загрузиться
      setTimeout(() => {
        startTour()
      }, 1500)
    }
  }

  // Сброс состояния (для тестирования)
  function resetTutorial() {
    isFirstLaunch.value = false
    stopTour()
  }

  return {
    // State
    isTourActive,
    currentStep,
    tourSteps,
    isFirstLaunch,

    // Computed
    isFirstTime,
    totalSteps,
    canGoNext,
    canGoPrev,

    // Methods
    startTour,
    stopTour,
    nextStep,
    prevStep,
    goToStep,
    skipTour,
    completeTour,
    checkAndStartTour,
    resetTutorial,
  }
})
