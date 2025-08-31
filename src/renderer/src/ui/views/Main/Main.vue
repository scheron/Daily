<script setup lang="ts">
import {computed, onMounted, watchEffect} from "vue"
import {useContentSize} from "@/composables/useContentSize"
import {useDevice} from "@/composables/useDevice"
import { useTour } from "@/composables/useTour"
import { useActiveTour } from "@/composables/useActiveTour"
import { createWelcomeSteps, useTutorialStatus, tourNotifier } from "@/composables/useTourHelpers"
import {useStorageStore} from "@/stores/storage.store"
import {useTagsStore} from "@/stores/tags.store"
import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"
import {useThemeStore} from "@/stores/theme.store"
import {useUIStore} from "@/stores/ui.store"

import BaseAnimation from "@/ui/base/BaseAnimation.vue"

import Content from "./fragments/Content"
import Header from "./fragments/Header.vue"
import Sidebar from "./fragments/Sidebar.vue"
import SidebarMini from "./fragments/SidebarMini.vue"
import Toolbar from "./fragments/Toolbar"
import {TourStep} from "@/ui/features/Tour"

const tasksStore = useTasksStore()
const tagsStore = useTagsStore()
const taskEditorStore = useTaskEditorStore()
const uiStore = useUIStore()
const storageStore = useStorageStore()

useThemeStore()

const {isDesktop, isMobile, isTablet} = useDevice()
const {contentHeight, contentWidth} = useContentSize("container")

// Create welcome tour
const welcomeSteps = createWelcomeSteps()
const tour = useTour(welcomeSteps, {
  id: 'welcome-tour',
  onComplete() {
    tutorial.markCompleted()
  }
})

// Active tour for rendering
const activeTour = useActiveTour()

// Computed properties for active tour
const activeTourStep = computed(() => activeTour.value?.currentTourStep || null)
const activeTourCurrentStep = computed(() => activeTour.value?.currentStep || 0)
const activeTourTotalSteps = computed(() => activeTour.value?.totalSteps || 0)
const activeTourIsVisible = computed(() => activeTour.value?.isActive || false)

// Tutorial status tracking
const tutorial = useTutorialStatus()

// Register tour for notifications
tourNotifier.register(tour)

const isDataLoaded = computed(() => tasksStore.isDaysLoaded && tagsStore.isTagsLoaded)

function onCreateTask() {
  taskEditorStore.setCurrentEditingTask(null)
  taskEditorStore.setEditorTags([])
  taskEditorStore.setIsTaskEditorOpen(true)
}

window.electronAPI.onTaskSaved(async () => {
  await storageStore.revalidate()
})

window.electronAPI.onMenuAction((action) => {
  if (action === "new-task") onCreateTask()
  else if (action === "toggle-sidebar") uiStore.toggleSidebarCollapse()
})

// Инициализация тура после загрузки данных
onMounted(() => {
  if (isDataLoaded.value) {
    initializeTour()
  } else {
    // Ждем загрузки данных
    const unwatch = watchEffect(() => {
      if (isDataLoaded.value) {
        initializeTour()
        unwatch() // Останавливаем наблюдение
      }
    })
  }
})

// Initialize tour
async function initializeTour() {
  // Small delay for rendering completion
  setTimeout(async () => {
    if (!tutorial.isCompleted.value) {
      await tour.start()
    }
  }, 1000)
}

// Tour handlers
function handleTourNext() {
  activeTour.value?.next()
}

function handleTourPrevious() {
  activeTour.value?.previous()
}

function handleTourSkip() {
  activeTour.value?.skip()
}

function handleTourStop() {
  activeTour.value?.stop()
}
</script>

<template>
  <div ref="container" class="bg-base-300 flex h-dvh w-dvw overflow-hidden">
    <template v-if="isDesktop">
      <SidebarMini v-if="uiStore.isSidebarCollapsed" :content-height="contentHeight" :data-loaded="isDataLoaded" />
      <Sidebar v-else :content-height="contentHeight" :data-loaded="isDataLoaded" />
    </template>

    <template v-else-if="isTablet">
      <SidebarMini :content-height="contentHeight" :data-loaded="isDataLoaded" />

      <BaseAnimation name="slideRight" :duration="200">
        <div v-if="uiStore.isMobileSidebarOpen" class="fixed top-0 left-0 z-40">
          <Sidebar :content-height="contentHeight" :data-loaded="isDataLoaded" />
        </div>
      </BaseAnimation>
    </template>

    <BaseAnimation name="slideRight" :duration="200">
      <div v-if="isMobile && uiStore.isMobileSidebarOpen" class="fixed top-0 left-0 z-40">
        <Sidebar :content-height="contentHeight" :data-loaded="isDataLoaded" />
      </div>
    </BaseAnimation>

    <BaseAnimation name="fade" :duration="200">
      <div v-if="!isDesktop && uiStore.isMobileSidebarOpen" class="fixed inset-0 z-30 bg-black/50" @click="uiStore.toggleSidebarCollapse(false)" />
    </BaseAnimation>

    <main class="bg-base-100 flex-1" :style="{width: contentWidth + 'px'}">
      <Header
        :task-editor-open="taskEditorStore.isTaskEditorOpen"
        :active-day="tasksStore.activeDay"
        @toggle-sidebar="uiStore.toggleSidebarCollapse()"
        @create-task="onCreateTask"
      />

      <div class="text-base-content flex size-full flex-col" :style="{height: contentHeight + 'px'}">
        <div class="border-base-300 md:h-header flex items-center border-b">
          <Toolbar />
        </div>

        <Content :task-editor-open="taskEditorStore.isTaskEditorOpen" @create-task="onCreateTask" />
      </div>
    </main>

    <!-- Tour Component -->
    <TourStep
      v-if="activeTourStep"
      :step="activeTourStep"
      :current-index="activeTourCurrentStep"
      :total-steps="activeTourTotalSteps"
      :is-visible="activeTourIsVisible"
      @next="handleTourNext"
      @previous="handleTourPrevious"
      @skip="handleTourSkip"
      @close="handleTourStop"
    />
  </div>
</template>
