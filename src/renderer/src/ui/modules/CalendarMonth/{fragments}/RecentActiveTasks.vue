<script setup lang="ts">
import {computed} from "vue"

import {toFullDate} from "@shared/utils/date/formatters"
import {groupActiveDays} from "@shared/utils/date/groupActiveDays"
import {useTasksStore} from "@/stores/tasks.store"
import BaseButton from "@/ui/base/BaseButton.vue"

const tasksStore = useTasksStore()

const groupedActiveDays = computed(() => groupActiveDays(tasksStore.days))

const hasRecentActiveTasks = computed(() => groupedActiveDays.value.some((group) => group.count))

function selectDay(date: string) {
  tasksStore.setActiveDay(date)
}
</script>

<template>
  <div v-if="hasRecentActiveTasks" class="text-xs">
    <template v-for="group in groupedActiveDays" :key="group.label">
      <div v-if="group.count">
        <div class="text-accent bg-base-100 flex items-center gap-1 p-2 text-xs font-bold uppercase select-none">
          {{ group.label }}
          <div class="text-info bg-info/30 flex size-4 items-center justify-center rounded-sm text-xs">
            {{ group.count > 9 ? "9+" : group.count }}
          </div>
        </div>

        <div class="flex flex-col gap-1 px-2">
          <template v-for="item in group.items.slice(0, 5)" :key="item.date">
            <BaseButton size="sm" class="justify-between gap-2" variant="ghost" @click="selectDay(item.date)">
              <span class="text-sm">{{ toFullDate(item.date) }}</span>
              <div class="text-info bg-info/30 flex size-4 items-center justify-center rounded-sm text-xs">
                {{ item.count > 9 ? "9+" : item.count }}
              </div>
            </BaseButton>
          </template>

          <div v-if="group.items.length > 5" class="text-accent/70 bg-accent/10 flex items-center justify-center rounded px-2 py-1">
            +{{ group.items.length - 5 }} more
          </div>
        </div>
      </div>
    </template>
  </div>
  <div v-else class="text-accent/70 bg-accent/10 flex items-center justify-center rounded p-2">No recent active tasks</div>
</template>
