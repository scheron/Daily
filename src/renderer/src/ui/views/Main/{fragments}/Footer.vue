<script setup lang="ts">
import {computed, ref} from "vue"
import {toasts} from "vue-toasts-lite"
import {useNow} from "@vueuse/core"
import {DateTime} from "luxon"

import {TAG_QUICK_COLORS} from "@shared/constants/theme/colorPalette"
import {ISODate} from "@shared/types/common"
import {toFullDate} from "@shared/utils/date/formatters"
import {getWeekDays} from "@shared/utils/date/getWeekDays"
import {useFilterStore} from "@/stores/filter.store"
import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks.store"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import TagsInput from "@/ui/common/inputs/TagsInput.vue"
import DayPicker from "@/ui/common/pickers/DayPicker.vue"

import type {Tag} from "@shared/types/storage"

const props = defineProps<{activeDay: string}>()

const tasksStore = useTasksStore()
const tagsStore = useTagsStore()
const filterStore = useFilterStore()

const newTagName = ref("")
const newTagColor = ref(TAG_QUICK_COLORS[0])

const isTagValid = computed(() => {
  const name = newTagName.value.trim()
  return name.length > 0 && !name.includes(" ")
})

async function createTag() {
  if (!isTagValid.value) return

  const tagName = newTagName.value.trim()
  if (tagsStore.tags.some((tag) => tag.name === tagName)) {
    toasts.error("Tag with this name already exists")
    return
  }

  await tagsStore.createTag(tagName, newTagColor.value)
  newTagName.value = ""
  newTagColor.value = TAG_QUICK_COLORS[0]
}

async function deleteTag(id: Tag["id"]) {
  filterStore.removeActiveTag(id)
  await tagsStore.deleteTag(id)
  await tasksStore.revalidate()
}

const now = useNow()

const week = computed(() => getWeekDays(tasksStore.days, tasksStore.activeDay))
const today = computed(() => DateTime.fromJSDate(now.value).toISODate())

function getBadgeText(activeTasksCount: number) {
  return activeTasksCount > 9 ? "9+" : String(activeTasksCount)
}

function isToday(date: ISODate): boolean {
  return date === today.value
}
</script>

<template>
  <div class="app-footer border-base-300 h-header border-t px-4">
    <div class="flex h-full w-full items-center justify-between gap-3">
      <div class="flex items-center justify-between gap-1">
        <DayPicker :days="tasksStore.days" :active-day="tasksStore.activeDay" :selected-day="tasksStore.activeDay" @select="tasksStore.setActiveDay">
          <template #trigger="{toggle}">
            <BaseButton variant="ghost" icon="calendar" class="p-0.5" tooltip="Select day" @click="toggle" />
          </template>
        </DayPicker>

        <BasePopup title="Tags" position="start" class="w-64" hide-close-btn>
          <template #trigger="{toggle}">
            <BaseButton variant="ghost" icon="tags" class="p-0.5" tooltip="Tags" @click="toggle" />
          </template>

          <form class="flex items-center gap-1" @submit.prevent="createTag">
            <div class="relative flex flex-1 items-center">
              <span class="text-base-content/40 pointer-events-none absolute left-2 text-sm">#</span>
              <TagsInput v-model="newTagName" class="!py-1 !pr-1 !pl-6 text-sm" />
            </div>
            <button
              v-for="color in TAG_QUICK_COLORS.slice(0, 5)"
              :key="color"
              type="button"
              class="size-3.5 shrink-0 rounded-full transition-opacity hover:opacity-100"
              :class="newTagColor === color ? 'ring-offset-base-100 opacity-100 ring-1 ring-offset-1' : 'opacity-40'"
              :style="{backgroundColor: color, '--tw-ring-color': color}"
              @click="newTagColor = color"
            />
            <BaseButton type="submit" size="sm" variant="ghost" icon="plus" icon-class="size-3.5" class="shrink-0 p-0.5" :disabled="!isTagValid" />
          </form>

          <div v-if="tagsStore.tags.length" class="flex flex-wrap gap-1 pt-1">
            <span
              v-for="tag in tagsStore.tags"
              :key="tag.id"
              class="group inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs"
              :style="{backgroundColor: `${tag.color}15`, color: tag.color}"
            >
              <span class="leading-0">#</span>
              <span class="truncate">{{ tag.name }}</span>
              <button
                class="ml-0.5 opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100"
                :style="{color: tag.color}"
                @click="deleteTag(tag.id)"
              >
                <BaseIcon name="x-mark" class="size-3" />
              </button>
            </span>
          </div>
        </BasePopup>
      </div>

      <ul class="flex w-full min-w-0 items-center justify-between gap-1">
        <li
          v-for="weekDay in week"
          :key="weekDay.date"
          class="relative flex min-w-0 flex-1 items-center justify-center rounded-lg border px-2 py-1 font-semibold transition-colors duration-150"
          :class="[
            weekDay.date === props.activeDay
              ? isToday(weekDay.date)
                ? 'text-accent bg-accent/15 border-accent'
                : 'text-accent bg-base-100 border-accent/50'
              : isToday(weekDay.date)
                ? 'border-accent'
                : 'bg-base-200 text-base-content/80 border-transparent',
          ]"
          @click="tasksStore.setActiveDay(weekDay.date)"
        >
          <div
            class="bg-accent absolute top-0 left-0 z-10 w-1 rounded-l-md transition-all duration-200"
            :class="[isToday(weekDay.date) ? 'h-full opacity-100' : 'h-0 opacity-0']"
          />
          <span class="truncate text-[10px]">{{ toFullDate(weekDay.date) }}</span>

          <span
            v-if="weekDay.day?.tasks.length"
            class="ml-auto flex size-4 items-center justify-center gap-1 rounded-md"
            :class="[weekDay.day.countActive === 0 ? 'text-base-100 bg-success/50' : 'text-warning bg-warning/10']"
          >
            <BaseIcon v-if="weekDay.day.countActive === 0" name="check" class="size-4" />
            <span v-else class="text-[10px]">{{ getBadgeText(weekDay.day.countActive) }}</span>
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>
