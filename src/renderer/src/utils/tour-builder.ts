/**
 * Tour Builder - удобный способ создания туров
 */

import type { TourStep, TourConfig, CreateStepOptions, TourPlacement } from '@/types/tour'

/**
 * Builder для создания шагов тура
 */
export class TourStepBuilder {
  private step: Partial<TourStep> = {}

  constructor(id: string) {
    this.step.id = id
  }

  /**
   * Устанавливает целевой элемент
   */
  target(selector: string): this {
    this.step.target = selector
    return this
  }

  /**
   * Устанавливает заголовок шага
   */
  title(title: string): this {
    this.step.title = title
    return this
  }

  /**
   * Устанавливает описание шага
   */
  description(description: string): this {
    this.step.description = description
    return this
  }

  /**
   * Устанавливает позиционирование
   */
  placement(placement: TourPlacement): this {
    this.step.placement = placement
    return this
  }

  /**
   * Устанавливает отступ
   */
  offset(offset: number): this {
    this.step.offset = offset
    return this
  }

  /**
   * Устанавливает ожидание действия пользователя
   */
  waitForAction(wait = true): this {
    this.step.waitForAction = wait
    return this
  }

  /**
   * Добавляет функцию, выполняемую перед показом
   */
  beforeShow(fn: () => Promise<void> | void): this {
    this.step.beforeShow = fn
    return this
  }

  /**
   * Добавляет функцию, выполняемую после завершения
   */
  afterComplete(fn: () => Promise<void> | void): this {
    this.step.afterComplete = fn
    return this
  }

  /**
   * Строит финальный шаг
   */
  build(): TourStep {
    if (!this.step.target || !this.step.title || !this.step.description) {
      throw new Error('TourStep must have target, title, and description')
    }

    return this.step as TourStep
  }
}

/**
 * Builder для создания конфигурации тура
 */
export class TourBuilder {
  private config: Partial<TourConfig> = {
    steps: []
  }

  constructor(id: string) {
    this.config.id = id
  }

  /**
   * Устанавливает название тура
   */
  name(name: string): this {
    this.config.name = name
    return this
  }

  /**
   * Добавляет шаг в тур
   */
  addStep(step: TourStep): this
  addStep(stepBuilder: TourStepBuilder): this
  addStep(id: string, options: CreateStepOptions): this
  addStep(stepOrBuilderOrId: TourStep | TourStepBuilder | string, options?: CreateStepOptions): this {
    if (typeof stepOrBuilderOrId === 'string' && options) {
      // Создаем шаг из опций
      const step: TourStep = {
        id: stepOrBuilderOrId,
        ...options
      }
      this.config.steps!.push(step)
    } else if (stepOrBuilderOrId instanceof TourStepBuilder) {
      // Используем builder
      this.config.steps!.push(stepOrBuilderOrId.build())
    } else {
      // Добавляем готовый шаг
      this.config.steps!.push(stepOrBuilderOrId as TourStep)
    }
    
    return this
  }

  /**
   * Устанавливает автозапуск
   */
  autoStart(auto = true): this {
    this.config.autoStart = auto
    return this
  }

  /**
   * Делает тур пропускаемым
   */
  skippable(skip = true): this {
    this.config.skippable = skip
    return this
  }

  /**
   * Добавляет обработчик завершения
   */
  onComplete(fn: () => void): this {
    this.config.onComplete = fn
    return this
  }

  /**
   * Добавляет обработчик пропуска
   */
  onSkip(fn: () => void): this {
    this.config.onSkip = fn
    return this
  }

  /**
   * Строит финальную конфигурацию тура
   */
  build(): TourConfig {
    if (!this.config.id || !this.config.name || !this.config.steps?.length) {
      throw new Error('TourConfig must have id, name, and at least one step')
    }

    return this.config as TourConfig
  }
}

/**
 * Утилитарные функции для быстрого создания
 */

/**
 * Создает новый шаг тура
 */
export function createStep(id: string): TourStepBuilder {
  return new TourStepBuilder(id)
}

/**
 * Создает новый тур
 */
export function createTour(id: string): TourBuilder {
  return new TourBuilder(id)
}

/**
 * Быстрое создание простого шага
 */
export function quickStep(
  id: string,
  target: string,
  title: string,
  description: string,
  placement: TourPlacement = 'auto'
): TourStep {
  return {
    id,
    target,
    title,
    description,
    placement
  }
}

/**
 * Предустановленные конфигурации для частых случаев
 */
export const TourPresets = {
  /**
   * Стандартный welcome тур
   */
  welcome: () => createTour('welcome-tour')
    .name('Добро пожаловать!')
    .autoStart(true)
    .skippable(true),

  /**
   * Тур по новым функциям
   */
  newFeatures: () => createTour('new-features-tour')
    .name('Новые возможности')
    .autoStart(false)
    .skippable(true),

  /**
   * Обучающий тур
   */
  tutorial: () => createTour('tutorial-tour')
    .name('Обучение')
    .autoStart(false)
    .skippable(false)
} as const
