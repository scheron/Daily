<script setup lang="ts">
import {computed, onMounted} from "vue"
import {invoke} from "@vueuse/core"
import {useContentSize} from "@/composables/useContentSize"
import {useDevice} from "@/composables/useDevice"
import {useTour} from "@/composables/useTour"
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

const tasksStore = useTasksStore()
const tagsStore = useTagsStore()
const taskEditorStore = useTaskEditorStore()
const uiStore = useUIStore()
const storageStore = useStorageStore()

useThemeStore()

const {isDesktop, isMobile, isTablet} = useDevice()
const {contentHeight, contentWidth} = useContentSize("container")
const {onboardingConfig, onboardingEvents, onboardingRef, tourSteps, initializeTour} = useTour()

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
    const unwatch = computed(() => isDataLoaded.value).watchEffect(() => {
      if (isDataLoaded.value) {
        initializeTour()
        unwatch() // Останавливаем наблюдение
      }
    })
  }
})
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

    <!-- V-Onboarding Component -->
    <VOnboardingWrapper
      ref="onboardingRef"
      :steps="tourSteps"
      :options="onboardingConfig"
      v-on="onboardingEvents"
    >
      <template #default="{ previous, next, step, exit, isFirst, isLast, index }">
        <VOnboardingStep>
          <div class="v-onboarding-step">
            <div class="v-onboarding-step__header">
              <h3 class="v-onboarding-step__title">{{ step.content.title }}</h3>
              <div class="v-onboarding-step__counter">{{ index + 1 }} / {{ tourSteps.length }}</div>
            </div>
            <div class="v-onboarding-step__content">
              <p>{{ step.content.description }}</p>
            </div>
            <div class="v-onboarding-step__actions">
              <div class="v-onboarding-step__navigation">
                <div class="v-onboarding-step__dots">
                  <span
                    v-for="(_, i) in tourSteps"
                    :key="i"
                    class="v-onboarding-step__dot"
                    :class="{ 'v-onboarding-step__dot--active': i === index }"
                  />
                </div>
              </div>
              <div style="display: flex; gap: 8px;">
                <button
                  v-if="!isFirst"
                  class="v-onboarding-step__button v-onboarding-step__button--secondary"
                  @click="previous"
                >
                  Назад
                </button>
                <button
                  class="v-onboarding-step__button v-onboarding-step__button--secondary"
                  @click="exit"
                >
                  Пропустить
                </button>
                <button
                  class="v-onboarding-step__button v-onboarding-step__button--primary"
                  @click="isLast ? exit() : next()"
                >
                  {{ isLast ? 'Завершить' : 'Далее' }}
                </button>
              </div>
            </div>
          </div>
        </VOnboardingStep>
      </template>
    </VOnboardingWrapper>
  </div>
</template>
