<script setup lang="ts">
import {computed, nextTick, useTemplateRef} from "vue"

import {useBranchesStore} from "@/stores/branches"
import {useProjectScopeStore} from "@/stores/project-scope"
import {useUiStore} from "@/stores/ui"
import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon.vue"
import BaseMenu from "@/ui/base/BaseMenu.vue"
import BasePopup from "@/ui/base/BasePopup.vue"
import ProjectIcon from "@/ui/common/(icons)/ProjectIcon.vue"
import BranchPicker from "@/ui/common/(pickers)/BranchPicker.vue"
import {useSearchModal} from "@/ui/overlays/SearchModal"
import {getProjectName} from "@/utils/projects/getProjectName"
import {toShortcutKeys} from "@/utils/shortcuts/toShortcutKeys"
import {cn} from "@/utils/ui/tailwindcss"
import ConnectionIndicator from "./{fragments}/ConnectionIndicator.vue"

import type {BaseMenuItem} from "@/ui/base/BaseMenu.vue"
import type {Branch} from "@daily/protocol"

const props = defineProps<{compact: boolean}>()

const emit = defineEmits<{createTask: []}>()

const actions: (BaseMenuItem & {run: () => void})[] = [
  {value: "assistant", label: "AI Assistant", icon: "ai", run: onOpenAssistantPanel},
  {value: "search", label: "Search", icon: "search", run: onOpenSearch},
  {
    value: "new",
    label: "New task",
    icon: "plus",
    run() {
      emit("createTask")
    },
  },
]

const branchesStore = useBranchesStore()
const uiStore = useUiStore()
const projectScopeStore = useProjectScopeStore()

const compactActionsRef = useTemplateRef<HTMLElement>("compactActions")
const menuRef = useTemplateRef<HTMLElement>("menu")

const activeBranchName = computed(() => {
  if (projectScopeStore.isAllProjectsMode) return "All projects"
  return getProjectName(branchesStore.activeBranch)
})
const hasAllProjectsRow = computed(() => uiStore.frame === "day")
const projectTriggerClass = computed(() => cn("grid h-full items-center", {"min-w-20": !props.compact}))
const compactProjectButtonAttrs = computed(() =>
  props.compact ? {"aria-label": `Project: ${activeBranchName.value}`, tooltip: activeBranchName.value} : {},
)

const searchModal = useSearchModal()

function onToggleActions(toggle: () => void) {
  toggle()
  nextTick(() => menuRef.value?.querySelector("button")?.focus({preventScroll: true}))
}

function closeActions(hide: () => void) {
  hide()
  compactActionsRef.value?.querySelector("button")?.focus({preventScroll: true})
}

function onActionsEscape(event: KeyboardEvent, hide: () => void) {
  event.preventDefault()
  event.stopPropagation()
  closeActions(hide)
}

function onSelectAction(value: BaseMenuItem["value"], hide: () => void) {
  closeActions(hide)
  actions.find((action) => action.value === value)?.run()
}

function onOpenAssistantPanel() {
  window.BridgeIPC.send("assistant:open")
}

function onOpenSearch() {
  searchModal.toggle()
}

async function onSelectBranch(branch: Branch) {
  await projectScopeStore.setAllProjects(false)
  if (branch.id === branchesStore.activeBranchId) return
  await branchesStore.setActiveBranch(branch.id)
}

async function onSelectAllProjects() {
  await projectScopeStore.setAllProjects(true)
}
</script>

<template>
  <BaseAnimation name="fade" :duration="200">
    <div
      v-if="!uiStore.isCalendarDockExpanded"
      class="dock-surface h-8.5 absolute right-3.5 top-2 z-20 flex items-center gap-0.5 rounded-full px-1 [-webkit-app-region:no-drag]"
    >
      <ConnectionIndicator :compact="compact" />

      <BranchPicker
        :selected-id="branchesStore.activeBranchId"
        side="bottom"
        :position="compact ? 'end' : 'start'"
        :trigger-class="projectTriggerClass"
        hover-mode
        :has-all-projects="hasAllProjectsRow"
        :is-all-projects-selected="projectScopeStore.isAllProjectsMode"
        @select="onSelectBranch"
        @select-all="onSelectAllProjects"
      >
        <template #trigger="{show}">
          <BaseButton variant="ghost-primary" size="sm" v-bind="compactProjectButtonAttrs" @mouseenter="show" @click="show">
            <template #icon="{class: iconClass}">
              <BaseIcon v-if="projectScopeStore.isAllProjectsMode" name="layers" :class="iconClass" />
              <ProjectIcon v-else :project="branchesStore.activeBranch" :class="iconClass" />
            </template>
            <template v-if="!compact" #default>
              <span class="max-w-24 truncate">{{ activeBranchName }}</span>
            </template>
          </BaseButton>
        </template>
      </BranchPicker>

      <div v-if="compact" ref="compactActions">
        <BasePopup hide-header position="end">
          <template #trigger="{toggle, hide, isOpen}">
            <BaseButton
              icon="dots-horizontal"
              variant="ghost-primary"
              size="sm"
              aria-label="More actions"
              :aria-expanded="isOpen"
              tooltip="More actions"
              @click="onToggleActions(toggle)"
              @keydown.esc="isOpen && onActionsEscape($event, hide)"
            />
          </template>

          <template #default="{hide}">
            <div ref="menu" @keydown.esc="onActionsEscape($event, hide)">
              <BaseMenu :items="actions" @select="onSelectAction($event, hide)" />
            </div>
          </template>
        </BasePopup>
      </div>

      <template v-else>
        <div class="bg-base-300 h-4.5 mx-0.5 w-px" />

        <BaseButton
          icon="ai"
          variant="ghost-primary"
          size="sm"
          :tooltip="`AI Assistant (${toShortcutKeys('ui:open-assistant-panel')})`"
          @click="onOpenAssistantPanel"
        />

        <BaseButton
          variant="ghost-primary"
          icon="search"
          size="sm"
          :tooltip="`Search (${toShortcutKeys('ui:open-search-panel')})`"
          @click="onOpenSearch"
        />

        <div class="bg-base-300 h-4.5 mx-0.5 w-px" />

        <BaseButton
          variant="primary-ghost"
          icon="plus"
          size="sm"
          class="min-w-20"
          :tooltip="`New task (${toShortcutKeys('tasks:create')})`"
          @click="emit('createTask')"
        >
          New
        </BaseButton>
      </template>
    </div>
  </BaseAnimation>
</template>
