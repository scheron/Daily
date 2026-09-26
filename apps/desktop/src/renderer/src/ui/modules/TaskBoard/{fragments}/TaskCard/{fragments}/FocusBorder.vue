<template>
  <svg aria-hidden="true" class="pointer-events-none absolute inset-0 z-20 size-full">
    <rect class="focus-border stroke-accent fill-none" />
  </svg>
</template>

<style scoped>
.focus-border {
  x: 0.5px;
  y: 0.5px;
  width: calc(100% - 1px);
  height: calc(100% - 1px);
  rx: calc(1rem - 1.5px);
  stroke-width: 1px;
  stroke-dasharray: 6 5;
  animation: focus-border-travel 16s linear infinite;
}

@keyframes focus-border-travel {
  to {
    stroke-dashoffset: -220;
  }
}
</style>
