/**
 * Vue директивы для туров
 * Позволяют легко добавлять элементы в туры прямо в template
 */

import type { Directive, App } from 'vue'

/**
 * Директива v-tour
 * Автоматически добавляет data-tour атрибут к элементу
 * 
 * Использование:
 * <button v-tour="'create-task'">Создать задачу</button>
 * <div v-tour:calendar>Календарь</div>
 * <component v-tour="{ id: 'sidebar', highlight: true }">
 */
const vTour: Directive = {
  mounted(el: HTMLElement, binding) {
    let tourId: string
    let options: { highlight?: boolean; pulse?: boolean } = {}

    if (typeof binding.value === 'string') {
      tourId = binding.value
    } else if (typeof binding.value === 'object' && binding.value?.id) {
      tourId = binding.value.id
      options = binding.value
    } else if (binding.arg) {
      tourId = binding.arg
    } else {
      console.warn('v-tour directive requires an id')
      return
    }

    // Добавляем data-tour атрибут
    el.setAttribute('data-tour', tourId)

    // Добавляем CSS классы для дополнительных эффектов
    if (options.highlight) {
      el.classList.add('tour-highlightable')
    }

    if (options.pulse) {
      el.classList.add('tour-pulsable')
    }

    // Сохраняем оригинальные стили для восстановления
    el.dataset.originalTransition = el.style.transition || ''
    el.dataset.originalTransform = el.style.transform || ''
  },

  updated(el: HTMLElement, binding) {
    // Обновляем атрибут при изменении значения
    if (typeof binding.value === 'string') {
      el.setAttribute('data-tour', binding.value)
    } else if (typeof binding.value === 'object' && binding.value?.id) {
      el.setAttribute('data-tour', binding.value.id)
    }
  },

  unmounted(el: HTMLElement) {
    // Очищаем атрибуты и классы при размонтировании
    el.removeAttribute('data-tour')
    el.classList.remove('tour-highlightable', 'tour-pulsable', 'tour-active')
    
    // Восстанавливаем оригинальные стили
    if (el.dataset.originalTransition !== undefined) {
      el.style.transition = el.dataset.originalTransition
      delete el.dataset.originalTransition
    }
    if (el.dataset.originalTransform !== undefined) {
      el.style.transform = el.dataset.originalTransform
      delete el.dataset.originalTransform
    }
  }
}

/**
 * Директива v-tour-step
 * Автоматически регистрирует элемент как шаг тура с полной конфигурацией
 * 
 * Использование:
 * <button v-tour-step="{
 *   id: 'create-task',
 *   title: 'Создание задач',
 *   description: 'Нажмите здесь чтобы создать новую задачу',
 *   placement: 'bottom'
 * }">Создать</button>
 */
const vTourStep: Directive = {
  mounted(el: HTMLElement, binding) {
    const config = binding.value

    if (!config || !config.id) {
      console.warn('v-tour-step directive requires a configuration object with id')
      return
    }

    // Добавляем data-tour атрибут
    el.setAttribute('data-tour', config.id)

    // Сохраняем конфигурацию шага в элементе для последующего использования
    el.dataset.tourStepConfig = JSON.stringify(config)

    // Добавляем визуальные индикаторы
    el.classList.add('tour-step-registered')

    // Опционально добавляем подсказку
    if (config.tooltip) {
      el.title = config.tooltip
    }
  },

  updated(el: HTMLElement, binding) {
    const config = binding.value
    if (config?.id) {
      el.setAttribute('data-tour', config.id)
      el.dataset.tourStepConfig = JSON.stringify(config)
    }
  },

  unmounted(el: HTMLElement) {
    el.removeAttribute('data-tour')
    el.classList.remove('tour-step-registered', 'tour-active')
    delete el.dataset.tourStepConfig
  }
}

/**
 * Директива v-tour-highlight
 * Добавляет возможность подсветки элемента вне активного тура
 * 
 * Использование:
 * <div v-tour-highlight="isHighlighted">Контент</div>
 * <div v-tour-highlight="{ active: true, color: 'blue' }">Контент</div>
 */
const vTourHighlight: Directive = {
  mounted(el: HTMLElement, binding) {
    updateHighlight(el, binding.value)
  },

  updated(el: HTMLElement, binding) {
    updateHighlight(el, binding.value)
  },

  unmounted(el: HTMLElement) {
    el.classList.remove('tour-highlighted', 'tour-highlight-blue', 'tour-highlight-green', 'tour-highlight-red')
    el.style.removeProperty('--tour-highlight-color')
  }
}

function updateHighlight(el: HTMLElement, value: any) {
  // Очищаем предыдущие классы
  el.classList.remove('tour-highlighted', 'tour-highlight-blue', 'tour-highlight-green', 'tour-highlight-red')
  el.style.removeProperty('--tour-highlight-color')

  if (!value) return

  if (typeof value === 'boolean' && value) {
    el.classList.add('tour-highlighted')
  } else if (typeof value === 'object') {
    if (value.active) {
      el.classList.add('tour-highlighted')
      
      if (value.color) {
        if (['blue', 'green', 'red'].includes(value.color)) {
          el.classList.add(`tour-highlight-${value.color}`)
        } else {
          el.style.setProperty('--tour-highlight-color', value.color)
        }
      }
    }
  }
}

/**
 * CSS стили для директив (должны быть добавлены в глобальные стили)
 */
export const tourDirectiveStyles = `
.tour-highlightable {
  transition: all 0.3s ease;
}

.tour-pulsable {
  animation: tour-pulse 2s infinite;
}

.tour-highlighted {
  position: relative;
  z-index: 100;
}

.tour-highlighted::before {
  content: '';
  position: absolute;
  top: -4px;
  left: -4px;
  right: -4px;
  bottom: -4px;
  border: 2px solid var(--tour-highlight-color, #3b82f6);
  border-radius: 8px;
  pointer-events: none;
  animation: tour-highlight-pulse 2s infinite;
}

.tour-highlight-blue::before { border-color: #3b82f6; }
.tour-highlight-green::before { border-color: #10b981; }
.tour-highlight-red::before { border-color: #ef4444; }

.tour-step-registered {
  position: relative;
}

.tour-active {
  z-index: 9999 !important;
}

@keyframes tour-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

@keyframes tour-highlight-pulse {
  0%, 100% { opacity: 0.7; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.02); }
}
`

/**
 * Плагин для регистрации всех директив
 */
export function installTourDirectives(app: App) {
  app.directive('tour', vTour)
  app.directive('tour-step', vTourStep)
  app.directive('tour-highlight', vTourHighlight)
}

// Экспорт отдельных директив
export { vTour, vTourStep, vTourHighlight }

// Экспорт по умолчанию
export default {
  install: installTourDirectives
}
