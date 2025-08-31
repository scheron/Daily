/**
 * Tour creation helpers
 */

import type { TourStep, TourPlacement } from '@/types/tour'
import { useSettingsStore } from '@/composables/useSettingsStore'

/**
 * Create tour step quickly
 */
export function createStep(
  id: string,
  target: string,
  title: string,
  description: string,
  placement: TourPlacement = 'auto',
  options: Partial<TourStep> = {}
): TourStep {
  return {
    id,
    target,
    title,
    description,
    placement,
    offset: 12,
    ...options
  }
}

/**
 * Create welcome tour steps
 */
export function createWelcomeSteps(): TourStep[] {
  return [
    createStep(
      'welcome',
      '[data-tour="welcome"]',
      'Добро пожаловать в Daily!',
      'Daily - это минималистичное приложение для управления ежедневными задачами. Давайте познакомимся с основными возможностями.',
      'bottom-start'
    ),
    createStep(
      'new-task',
      '[data-tour="new-task-button"]',
      'Создание задач',
      'Нажмите эту кнопку, чтобы создать новую задачу. Вы можете добавлять описание, теги и устанавливать время выполнения.',
      'bottom-end'
    ),
    createStep(
      'calendar',
      '[data-tour="calendar"]',
      'Календарь',
      'В календаре вы можете переключаться между днями и видеть задачи на любую дату. Просто кликните на нужный день.',
      'right-start'
    ),
    createStep(
      'active-tasks',
      '[data-tour="active-tasks"]',
      'Активные задачи',
      'Здесь отображаются ваши недавние и активные задачи для быстрого доступа.',
      'right'
    ),
    createStep(
      'tags',
      '[data-tour="tags"]',
      'Теги',
      'Организуйте ваши задачи с помощью тегов. Создавайте категории и фильтруйте задачи по ним.',
      'right'
    ),
    createStep(
      'themes',
      '[data-tour="themes"]',
      'Темы оформления',
      'Настройте внешний вид приложения под себя. Выберите светлую, темную тему или следуйте системным настройкам.',
      'right-end'
    ),
    createStep(
      'task-list',
      '[data-tour="task-list"]',
      'Список задач',
      'Здесь отображаются все ваши задачи на выбранный день. Отмечайте выполненные задачи и управляйте ими.',
      'auto'
    ),
    createStep(
      'toolbar',
      '[data-tour="toolbar"]',
      'Панель инструментов',
      'Используйте фильтры и сортировку для удобной работы с задачами. Также здесь можно переключать режимы отображения.',
      'auto'
    )
  ]
}

/**
 * Create interactive tour steps
 */
export function createInteractiveSteps(): TourStep[] {
  return [
    createStep(
      'create-task-interactive',
      '[data-tour="new-task-button"]',
      'Создание задачи',
      'Нажмите на кнопку "Создать задачу", чтобы увидеть редактор задач',
      'bottom',
      {
        waitForAction: true,
        onUserAction: async (actionType: string) => {
          if (actionType === 'task-button-clicked') {
            // User clicked the task creation button
          }
        }
      }
    ),
    createStep(
      'task-editor',
      '[data-tour="task-editor"]',
      'Редактор задач',
      'Отлично! Теперь вы видите редактор задач. Здесь можно добавить заголовок, описание и теги.',
      'left',
      {
        beforeShow: async () => {
          // Wait for editor to appear
          await waitForElement('[data-tour="task-editor"]')
        }
      }
    )
  ]
}

/**
 * Wait for element to appear in DOM
 */
export const waitForElement = (selector: string, timeout = 5000): Promise<HTMLElement> => {
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

/**
 * Create global notifier for tour actions
 * Used for communication between tours and components
 */
export function createTourNotifier() {
  const activeTours = new Set<{ notifyAction: (action: string, data?: any) => void }>()
  
  return {
    /**
     * Register tour for notifications
     */
    register(tour: { notifyAction: (action: string, data?: any) => void }) {
      activeTours.add(tour)
    },
    
    /**
     * Unregister tour from notifications
     */
    unregister(tour: { notifyAction: (action: string, data?: any) => void }) {
      activeTours.delete(tour)
    },
    
    /**
     * Send notification to all active tours
     */
    notify(action: string, data?: any) {
      activeTours.forEach(tour => {
        tour.notifyAction(action, data)
      })
    }
  }
}

// Global notifier instance
export const tourNotifier = createTourNotifier()

/**
 * Tutorial status hook - checks if tutorial was already shown
 */
export function useTutorialStatus() {
  const isCompleted = useSettingsStore("tutorial.completed", false)
  
  return {
    isCompleted,
    markCompleted() {
      isCompleted.value = true
    },
    reset() {
      isCompleted.value = false
    }
  }
}
