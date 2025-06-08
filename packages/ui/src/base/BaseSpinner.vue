<template>
  <div class="flex size-full items-center justify-center">
    <span class="loader"></span>
  </div>
</template>

<style scoped>
.loader {
  width: 48px;
  height: 48px;
  position: relative;
  border: 3px solid currentColor;
  border-radius: 50%;
  box-sizing: border-box;
  animation: animloader 2s linear infinite;
}
.loader::after {
  content: "";
  box-sizing: border-box;
  width: 6px;
  height: 24px;
  background: currentColor;
  transform: rotate(-45deg);
  position: absolute;
  bottom: -20px;
  left: 46px;
}

@keyframes animloader {
  0% {
    transform: translate(-10px, -10px);
  }
  25% {
    transform: translate(-10px, 10px);
  }
  50% {
    transform: translate(10px, 10px);
  }
  75% {
    transform: translate(10px, -10px);
  }
  100% {
    transform: translate(-10px, -10px);
  }
}
</style> 