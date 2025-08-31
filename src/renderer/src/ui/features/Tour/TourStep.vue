<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from "vue"
import {computePosition, autoUpdate, offset, flip, shift, arrow, size} from "@floating-ui/vue"
import {useDevice} from "@/composables/useDevice"

import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"

import type { TourStep } from "@/types/tour"

interface TourStepProps {
  step: TourStep
  currentIndex: number
  totalSteps: number
  isVisible: boolean
}

const props = defineProps<TourStepProps>()

const emit = defineEmits<{
  next: []
  previous: []
  skip: []
  close: []
}>()

const {isMobile} = useDevice()

// Refs для floating-ui
const popperElement = ref<HTMLElement>()
const arrowElement = ref<HTMLElement>()
const targetElement = ref<HTMLElement>()

// Состояние позиционирования
const x = ref(0)
const y = ref(0)
const placement = ref(props.step.placement || 'bottom')
const arrowX = ref(0)
const arrowY = ref(0)

// Cleanup функция для autoUpdate
let cleanup: (() => void) | null = null

// Проверяем, является ли это первым/последним шагом
const isFirst = computed(() => props.currentIndex === 0)
const isLast = computed(() => props.currentIndex === props.totalSteps - 1)

// Автоматическое определение лучшей позиции
async function getBestPlacement(target: HTMLElement): Promise<string> {
  if (props.step.placement && props.step.placement !== 'auto') {
    return props.step.placement
  }

  const rect = target.getBoundingClientRect()
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight
  }
  
  const tourWidth = 320
  const tourHeight = 200
  const padding = 20
  
  const spaceTop = rect.top
  const spaceBottom = viewport.height - rect.bottom
  const spaceLeft = rect.left
  const spaceRight = viewport.width - rect.right
  
  const positions: Array<{placement: string, score: number}> = []
  
  // Снизу (приоритет)
  if (spaceBottom >= tourHeight + padding) {
    positions.push({placement: 'bottom', score: spaceBottom + 100}) // Бонус для нижней позиции
  }
  
  // Сверху
  if (spaceTop >= tourHeight + padding) {
    positions.push({placement: 'top', score: spaceTop})
  }
  
  // Справа
  if (spaceRight >= tourWidth + padding) {
    positions.push({placement: 'right', score: spaceRight})
  }
  
  // Слева
  if (spaceLeft >= tourWidth + padding) {
    positions.push({placement: 'left', score: spaceLeft})
  }
  
  if (positions.length === 0) {
    return 'bottom'
  }
  
  positions.sort((a, b) => b.score - a.score)
  return positions[0].placement
}

// Обновление позиции
async function updatePosition() {
  if (!targetElement.value || !popperElement.value) return

  const bestPlacement = await getBestPlacement(targetElement.value)
  
  const middleware = [
    offset(typeof props.step.offset === 'number' ? {mainAxis: props.step.offset, crossAxis: 0} : {mainAxis: 12, crossAxis: 0}),
    flip({
      fallbackPlacements: ['top', 'bottom', 'left', 'right']
    }),
    shift({padding: 20}),
    size({
      apply({availableWidth, availableHeight, elements}) {
        Object.assign(elements.floating.style, {
          maxWidth: `${Math.min(350, availableWidth - 20)}px`,
          maxHeight: `${Math.min(400, availableHeight - 20)}px`,
        })
      }
    })
  ]

  if (arrowElement.value) {
    middleware.push(arrow({element: arrowElement.value}))
  }

  try {
    const result = await computePosition(
      targetElement.value,
      popperElement.value,
      {
        placement: bestPlacement as any,
        middleware
      }
    )

    x.value = result.x
    y.value = result.y
    placement.value = result.placement

    // Позиционирование стрелки
    if (result.middlewareData.arrow && arrowElement.value) {
      const {x: arrowXPos, y: arrowYPos} = result.middlewareData.arrow
      arrowX.value = arrowXPos ?? 0
      arrowY.value = arrowYPos ?? 0
    }

    // Обновляем spotlight после позиционирования
    updateSpotlight()
  } catch (error) {
    console.warn('Error positioning tour step:', error)
  }
}

// Вычисление позиции spotlight с учетом границ экрана
function calculateSpotlightRect(rect: DOMRect) {
  const padding = 4 // Отступ вокруг элемента
  
  // Вычисляем желаемую позицию
  let x = rect.x - padding
  let y = rect.y - padding
  let width = rect.width + padding * 2
  let height = rect.height + padding * 2
  
  // Корректируем позицию, чтобы spotlight не выходил за края экрана
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const margin = 4 // Минимальный отступ от края экрана
  
  // Проверяем левую границу
  if (x < margin) {
    const shift = margin - x
    x = margin
    width -= shift // Уменьшаем ширину на величину сдвига
  }
  
  // Проверяем правую границу
  if (x + width > viewportWidth - margin) {
    const overflow = (x + width) - (viewportWidth - margin)
    width -= overflow // Уменьшаем ширину на величину переполнения
  }
  
  // Проверяем верхнюю границу
  if (y < margin) {
    const shift = margin - y
    y = margin
    height -= shift // Уменьшаем высоту на величину сдвига
  }
  
  // Проверяем нижнюю границу
  if (y + height > viewportHeight - margin) {
    const overflow = (y + height) - (viewportHeight - margin)
    height -= overflow // Уменьшаем высоту на величину переполнения
  }
  
  return { x, y, width, height }
}

// Обновление spotlight
function updateSpotlight() {
  if (targetElement.value) {
    const rect = targetElement.value.getBoundingClientRect()
    const newSpotlightRect = calculateSpotlightRect(rect)
    
    spotlightRect.value = newSpotlightRect
  }
}

// Spotlight overlay
const spotlightOverlay = ref<HTMLElement>()
const spotlightRect = ref({ x: 0, y: 0, width: 0, height: 0 })

// Подсветка целевого элемента
function highlightTarget() {
  if (targetElement.value) {
    // Добавляем класс для z-index
    targetElement.value.classList.add('tour-target-active')
    
    // Получаем размеры и позицию элемента
    const rect = targetElement.value.getBoundingClientRect()
    const newSpotlightRect = calculateSpotlightRect(rect)
    
    spotlightRect.value = newSpotlightRect
    
    // Прокручиваем к элементу
    targetElement.value.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    })
  }
}

function removeHighlight() {
  // Убираем класс активного элемента
  if (targetElement.value) {
    targetElement.value.classList.remove('tour-target-active')
  }
  // Сбрасываем spotlight
  spotlightRect.value = { x: 0, y: 0, width: 0, height: 0 }
}

// Инициализация
async function initializeStep() {
  if (!props.isVisible) return

  await nextTick()
  
  // Находим целевой элемент
  targetElement.value = document.querySelector(props.step.target) as HTMLElement
  
  if (!targetElement.value) {
    console.warn(`Tour target element not found: ${props.step.target}`)
    return
  }

  // Небольшая задержка для завершения рендеринга
  setTimeout(() => {
    highlightTarget()
  }, 100)
  
  await updatePosition()

  // Настройка автообновления позиции
  if (cleanup) cleanup()
  cleanup = autoUpdate(
    targetElement.value,
    popperElement.value!,
    updatePosition
  )

  // Слушаем изменения размеров окна для обновления spotlight
  window.addEventListener('resize', updateSpotlight)
  window.addEventListener('scroll', updateSpotlight)
}

// Очистка
function cleanup_() {
  if (cleanup) {
    cleanup()
    cleanup = null
  }
  
  // Убираем event listeners
  window.removeEventListener('resize', updateSpotlight)
  window.removeEventListener('scroll', updateSpotlight)
  
  removeHighlight()
}

// Watchers
watch(() => props.isVisible, (visible) => {
  if (visible) {
    initializeStep()
  } else {
    cleanup_()
  }
})

watch(() => props.step.target, () => {
  if (props.isVisible) {
    cleanup_()
    initializeStep()
  }
})

onMounted(() => {
  if (props.isVisible) {
    initializeStep()
  }
})

onUnmounted(() => {
  cleanup_()
})

// Обработчики событий
function handleNext() {
  emit('next')
}

function handlePrevious() {
  emit('previous')
}

function handleSkip() {
  emit('skip')
}

function handleClose() {
  emit('close')
}

// Стили стрелки
const arrowStyles = computed(() => {
  const side = placement.value.split('-')[0]
  
  const styles: Record<string, any> = {
    position: 'absolute',
    width: '8px',
    height: '8px',
    background: 'hsl(var(--base-100))',
    transform: 'rotate(45deg)',
    border: '1px solid hsl(var(--base-300))',
  }

  if (side === 'top') {
    styles.bottom = '-5px'
    styles.left = `${arrowX.value}px`
    styles.borderTop = 'none'
    styles.borderLeft = 'none'
  } else if (side === 'bottom') {
    styles.top = '-5px'
    styles.left = `${arrowX.value}px`
    styles.borderBottom = 'none'
    styles.borderRight = 'none'
  } else if (side === 'left') {
    styles.right = '-5px'
    styles.top = `${arrowY.value}px`
    styles.borderLeft = 'none'
    styles.borderBottom = 'none'
  } else if (side === 'right') {
    styles.left = '-5px'
    styles.top = `${arrowY.value}px`
    styles.borderRight = 'none'
    styles.borderTop = 'none'
  }

  return styles
})
</script>

<template>
  <Teleport to="body">
    <!-- Subtle Dark Overlay with cutout -->
    <div
      v-if="isVisible"
      class="tour-overlay fixed inset-0 z-[9998] bg-black/30"
      :style="spotlightRect.width > 0 ? {
        clipPath: `polygon(
          0% 0%, 
          0% 100%, 
          ${spotlightRect.x}px 100%, 
          ${spotlightRect.x}px ${spotlightRect.y}px, 
          ${spotlightRect.x + spotlightRect.width}px ${spotlightRect.y}px, 
          ${spotlightRect.x + spotlightRect.width}px ${spotlightRect.y + spotlightRect.height}px, 
          ${spotlightRect.x}px ${spotlightRect.y + spotlightRect.height}px, 
          ${spotlightRect.x}px 100%, 
          100% 100%, 
          100% 0%
        )`
      } : {}"
    />

    <!-- Spotlight Highlight -->
    <div
      v-if="isVisible && spotlightRect.width > 0"
      ref="spotlightOverlay"
      class="tour-spotlight"
      :style="{
        position: 'fixed',
        top: `${spotlightRect.y}px`,
        left: `${spotlightRect.x}px`,
        width: `${spotlightRect.width}px`,
        height: `${spotlightRect.height}px`,
        zIndex: 9999,
        pointerEvents: 'none',
      }"
    />

    <!-- Tour Step -->
    <div
      v-if="isVisible"
      ref="popperElement"
      class="tour-step"
      :style="{
        position: 'absolute',
        top: `${y}px`,
        left: `${x}px`,
        zIndex: 9999,
      }"
    >
      <!-- Arrow -->
      <div
        ref="arrowElement"
        class="tour-arrow"
        :style="arrowStyles"
      />

      <!-- Content -->
      <div class="tour-content">
        <!-- Header -->
        <div class="tour-header">
          <h3 class="tour-title">{{ step.title }}</h3>
          <div class="tour-counter">{{ currentIndex + 1 }} / {{ totalSteps }}</div>
          <button
            class="tour-close"
            @click="handleClose"
          >
            <BaseIcon name="x-mark" class="size-4" />
          </button>
        </div>

        <!-- Description -->
        <div class="tour-body">
          <p class="tour-description">{{ step.description }}</p>
        </div>

        <!-- Actions -->
        <div class="tour-actions">
          <!-- Progress dots -->
          <div class="tour-progress">
            <span
              v-for="(_, i) in totalSteps"
              :key="i"
              class="tour-dot"
              :class="{ 'tour-dot--active': i === currentIndex }"
            />
          </div>

          <!-- Buttons -->
          <div v-if="!step.interactive" class="tour-buttons" :class="{ 'tour-buttons--mobile': isMobile }">
            <BaseButton
              v-if="!isFirst"
              variant="ghost"
              size="sm"
              @click="handlePrevious"
            >
              Назад
            </BaseButton>
            
            <BaseButton
              variant="ghost"
              size="sm"
              @click="handleSkip"
            >
              Пропустить
            </BaseButton>
            
            <BaseButton
              v-if="!step.waitForAction"
              variant="primary"
              size="sm"
              class="bg-accent text-accent-content"
              @click="handleNext"
            >
              {{ isLast ? 'Завершить' : 'Далее' }}
            </BaseButton>
          </div>

          <!-- Интерактивный режим -->
          <div v-else class="tour-interactive-hint">
            <p class="text-sm text-base-content/70">
              Выполните указанное действие для продолжения
            </p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
