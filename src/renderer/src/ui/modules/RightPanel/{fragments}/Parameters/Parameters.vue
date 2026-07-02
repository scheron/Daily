<script setup lang="ts">
import {useTaskEditor} from "../../composables/useTaskEditor"
import BranchProperty from "./{fragments}/properties/BranchProperty.vue"
import DateProperty from "./{fragments}/properties/DateProperty.vue"
import StatusProperty from "./{fragments}/properties/StatusProperty.vue"
import TagsProperty from "./{fragments}/properties/TagsProperty.vue"
import TimeProperty from "./{fragments}/properties/TimeProperty.vue"
import PropertyRow from "./{fragments}/PropertyRow.vue"
import TaskNavigator from "./{fragments}/TaskNavigator.vue"

const {activeTask, isNew, flatOrderedTasks, currentIndex, canPrev, canNext, navigatePrev, navigateNext} = useTaskEditor()
</script>

<template>
  <div v-if="activeTask" class="flex flex-col gap-0.5 px-4 py-4">
    <PropertyRow label="Status" class="relative">
      <StatusProperty :task="activeTask" />

      <div v-if="!(isNew || flatOrderedTasks.length <= 1)" class="absolute top-1/2 right-0 shrink-0 -translate-y-1/2">
        <TaskNavigator
          :index="currentIndex"
          :total="flatOrderedTasks.length"
          :can-prev="canPrev"
          :can-next="canNext"
          @prev="navigatePrev"
          @next="navigateNext"
        />
      </div>
    </PropertyRow>
    <PropertyRow label="Date">
      <DateProperty :task="activeTask" />
    </PropertyRow>
    <PropertyRow label="Project">
      <BranchProperty :task="activeTask" />
    </PropertyRow>
    <PropertyRow label="Estimate">
      <TimeProperty :task="activeTask" field="estimatedTime" placeholder="00:00" />
    </PropertyRow>
    <PropertyRow label="Spent" :disabled="activeTask.estimatedTime === 0">
      <TimeProperty :task="activeTask" field="spentTime" placeholder="00:00" />
    </PropertyRow>
    <PropertyRow label="Tags">
      <TagsProperty :task="activeTask" />
    </PropertyRow>
  </div>
</template>
