/**
 * Типы для системы туров приложения
 */

import type { Placement } from '@floating-ui/dom'

/**
 * Позиционирование шага тура
 */
export type TourPlacement = Placement | 'auto'

/**
 * Базовый шаг тура
 */
export interface TourStep {
  /** Уникальный идентификатор шага */
  id: string
  /** CSS селектор целевого элемента */
  target: string
  /** Заголовок шага */
  title: string
  /** Описание шага */
  description: string
  /** Позиционирование подсказки относительно элемента */
  placement?: TourPlacement
  /** Отступ от целевого элемента */
  offset?: number
  /** Должен ли шаг ждать действия пользователя */
  waitForAction?: boolean
  /** Функция, выполняемая перед показом шага */
  beforeShow?: () => Promise<void> | void
  /** Функция, выполняемая после завершения шага */
  afterComplete?: () => Promise<void> | void
}

/**
 * Расширенный шаг тура с дополнительными возможностями
 */
export interface ExtendedTourStep extends TourStep {
  /** Должен ли шаг быть пропускаемым */
  skippable?: boolean
  /** Кастомный CSS класс для целевого элемента */
  targetClass?: string
  /** Дополнительные стили для spotlight */
  spotlightStyle?: Record<string, string>
  /** Кастомная анимация появления */
  animation?: 'fade' | 'slide' | 'zoom' | 'none'
}

/**
 * Конфигурация тура
 */
export interface TourConfig {
  /** Уникальный идентификатор тура */
  id: string
  /** Название тура */
  name: string
  /** Шаги тура */
  steps: TourStep[]
  /** Должен ли тур запускаться автоматически */
  autoStart?: boolean
  /** Можно ли пропустить весь тур */
  skippable?: boolean
  /** Функция, выполняемая при завершении тура */
  onComplete?: () => void
  /** Функция, выполняемая при пропуске тура */
  onSkip?: () => void
}

/**
 * Опции для создания нового шага
 */
export interface CreateStepOptions {
  target: string
  title: string
  description: string
  placement?: TourPlacement
  offset?: number
  waitForAction?: boolean
  beforeShow?: () => Promise<void> | void
  afterComplete?: () => Promise<void> | void
}

/**
 * Состояние тура
 */
export interface TourState {
  /** Активен ли тур */
  isActive: boolean
  /** Текущий шаг */
  currentStep: number
  /** Общее количество шагов */
  totalSteps: number
  /** Можно ли перейти к следующему шагу */
  canGoNext: boolean
  /** Можно ли вернуться к предыдущему шагу */
  canGoPrevious: boolean
  /** Завершен ли тур */
  isCompleted: boolean
}
