import {ref, computed} from "vue"
import {defineStore} from "pinia"
import {useSettingsStore} from "@/composables/useSettingsStore"
import type { TourStep, TourConfig, TourState } from "@/types/tour"
import { createTour, quickStep, TourPresets } from "@/utils/tour-builder"

export const useTourStore = defineStore("tour", () => {
  // Состояние туториала
  const isTourActive = ref(false)
  const currentStep = ref(0)
  const isFirstLaunch = useSettingsStore("tutorial.completed", false)
  const currentTourConfig = ref<TourConfig | null>(null)

  /**
   * Создание welcome тура с помощью builder
   */
  function createWelcomeTour(): TourConfig {
    return TourPresets.welcome()
      .addStep(quickStep(
        'welcome',
        '[data-tour="welcome"]',
        'Добро пожаловать в Daily!',
        'Daily - это минималистичное приложение для управления ежедневными задачами. Давайте познакомимся с основными возможностями.',
        'bottom-start'
      ))
      .addStep(quickStep(
        'new-task',
        '[data-tour="new-task-button"]',
        'Создание задач',
        'Нажмите эту кнопку, чтобы создать новую задачу. Вы можете добавлять описание, теги и устанавливать время выполнения.',
        'bottom-end'
      ))
      .addStep(quickStep(
        'calendar',
        '[data-tour="calendar"]',
        'Календарь',
        'В календаре вы можете переключаться между днями и видеть задачи на любую дату. Просто кликните на нужный день.',
        'right-start'
      ))
      .addStep(quickStep(
        'active-tasks',
        '[data-tour="active-tasks"]',
        'Активные задачи',
        'Здесь отображаются ваши недавние и активные задачи для быстрого доступа.',
        'right'
      ))
      .addStep(quickStep(
        'tags',
        '[data-tour="tags"]',
        'Теги',
        'Организуйте ваши задачи с помощью тегов. Создавайте категории и фильтруйте задачи по ним.',
        'right'
      ))
      .addStep(quickStep(
        'themes',
        '[data-tour="themes"]',
        'Темы оформления',
        'Настройте внешний вид приложения под себя. Выберите светлую, темную тему или следуйте системным настройкам.',
        'right-end'
      ))
      .addStep(quickStep(
        'task-list',
        '[data-tour="task-list"]',
        'Список задач',
        'Здесь отображаются все ваши задачи на выбранный день. Отмечайте выполненные задачи и управляйте ими.',
        'auto'
      ))
      .addStep(quickStep(
        'toolbar',
        '[data-tour="toolbar"]',
        'Панель инструментов',
        'Используйте фильтры и сортировку для удобной работы с задачами. Также здесь можно переключать режимы отображения.',
        'auto'
      ))
      .onComplete(() => {
        console.log('Welcome tour completed!')
      })
      .build()
  }

  // Устанавливаем welcome тур по умолчанию
  currentTourConfig.value = createWelcomeTour()

  // Computed properties
  const isFirstTime = computed(() => !isFirstLaunch.value)
  const tourSteps = computed(() => currentTourConfig.value?.steps || [])
  const totalSteps = computed(() => tourSteps.value.length)
  const canGoNext = computed(() => currentStep.value < totalSteps.value - 1)
  const canGoPrev = computed(() => currentStep.value > 0)
  const currentTourStep = computed(() => tourSteps.value[currentStep.value] || null)
  
  // Состояние тура
  const tourState = computed<TourState>(() => ({
    isActive: isTourActive.value,
    currentStep: currentStep.value,
    totalSteps: totalSteps.value,
    canGoNext: canGoNext.value,
    canGoPrevious: canGoPrev.value,
    isCompleted: !isTourActive.value && Boolean(isFirstLaunch.value)
  }))

  /**
   * Запускает тур
   */
  async function startTour(config?: TourConfig) {
    if (config) {
      currentTourConfig.value = config
    }
    
    if (!currentTourConfig.value) {
      console.warn('No tour configuration available')
      return
    }

    isTourActive.value = true
    currentStep.value = 0
    
    // Выполняем beforeShow для первого шага
    const firstStep = currentTourStep.value
    if (firstStep?.beforeShow) {
      await firstStep.beforeShow()
    }
  }

  /**
   * Останавливает тур
   */
  function stopTour() {
    isTourActive.value = false
    currentStep.value = 0
  }

  /**
   * Переходит к следующему шагу
   */
  async function nextStep() {
    const currentStepData = currentTourStep.value
    
    // Выполняем afterComplete для текущего шага
    if (currentStepData?.afterComplete) {
      await currentStepData.afterComplete()
    }

    if (canGoNext.value) {
      currentStep.value++
      
      // Выполняем beforeShow для следующего шага
      const nextStepData = currentTourStep.value
      if (nextStepData?.beforeShow) {
        await nextStepData.beforeShow()
      }
    } else {
      completeTour()
    }
  }

  /**
   * Возвращается к предыдущему шагу
   */
  async function prevStep() {
    if (canGoPrev.value) {
      currentStep.value--
      
      // Выполняем beforeShow для предыдущего шага
      const prevStepData = currentTourStep.value
      if (prevStepData?.beforeShow) {
        await prevStepData.beforeShow()
      }
    }
  }

  /**
   * Переходит к конкретному шагу
   */
  async function goToStep(stepIndex: number) {
    if (stepIndex >= 0 && stepIndex < totalSteps.value) {
      currentStep.value = stepIndex
      
      // Выполняем beforeShow для выбранного шага
      const stepData = currentTourStep.value
      if (stepData?.beforeShow) {
        await stepData.beforeShow()
      }
    }
  }

  /**
   * Пропускает тур
   */
  function skipTour() {
    const config = currentTourConfig.value
    if (config?.onSkip) {
      config.onSkip()
    }
    completeTour()
  }

  /**
   * Завершает тур
   */
  function completeTour() {
    const config = currentTourConfig.value
    if (config?.onComplete) {
      config.onComplete()
    }
    
    isTourActive.value = false
    currentStep.value = 0
    isFirstLaunch.value = true
  }

  /**
   * Устанавливает новую конфигурацию тура
   */
  function setTourConfig(config: TourConfig) {
    currentTourConfig.value = config
  }

  /**
   * Проверка, нужно ли показать тур при первом запуске
   */
  function checkAndStartTour() {
    if (isFirstTime.value && currentTourConfig.value?.autoStart) {
      // Небольшая задержка, чтобы дать интерфейсу загрузиться
      setTimeout(() => {
        startTour()
      }, 1500)
    }
  }

  /**
   * Сброс состояния (для тестирования)
   */
  function resetTutorial() {
    isFirstLaunch.value = false
    stopTour()
  }

  /**
   * Создает новый тур для тестирования или демонстрации
   */
  function createCustomTour(steps: TourStep[], name = 'Custom Tour') {
    const customConfig = createTour('custom-tour')
      .name(name)
      .autoStart(false)
      .skippable(true)
    
    steps.forEach(step => customConfig.addStep(step))
    
    return customConfig.build()
  }

  return {
    // State
    isTourActive,
    currentStep,
    tourSteps,
    currentTourStep,
    currentTourConfig,
    isFirstLaunch,

    // Computed
    isFirstTime,
    totalSteps,
    canGoNext,
    canGoPrev,
    tourState,

    // Methods
    startTour,
    stopTour,
    nextStep,
    prevStep,
    goToStep,
    skipTour,
    completeTour,
    setTourConfig,
    checkAndStartTour,
    resetTutorial,
    createCustomTour,
    
    // Tour creation helpers
    createWelcomeTour,
  }
})
