<script setup lang="ts">
import {useTaskComments} from "../composables/useTaskComments"
import CommentComposer from "./Comments/{fragments}/CommentComposer.vue"

const {addComment} = useTaskComments()
</script>

<template>
  <CommentComposer @submit="addComment" />
</template>
