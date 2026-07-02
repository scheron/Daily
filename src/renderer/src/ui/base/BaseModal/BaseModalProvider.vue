<script setup lang="ts">
import {useBaseModal} from "./composables/useBaseModal"
import HostItem from "./{fragments}/HostItem.vue"

const {stack} = useBaseModal()
</script>

<template>
  <HostItem v-for="(modal, index) in stack" :key="modal.id" :item="modal" :index="index" :is-top="index === stack.length - 1" />
</template>
