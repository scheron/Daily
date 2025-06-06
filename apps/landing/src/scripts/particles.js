document.addEventListener("DOMContentLoaded", () => {
  const isDesktop = window.matchMedia("(min-width: 640px)").matches
  if (!isDesktop) return

  // prettier-ignore
  const EMOJIS = [
    "📝", "✅", "📅", "⏰", "🎯", "📊", "📌", "📋", "📓", "✏️", "📚",
    "🎨", "💡", "⭐", "📱", "📎", "🔖", "📖", "📒", "📏", "🔍", "📌",
    "📍", "✨", "🌟", "💫", "💪", "🎉", "🎊", "⏱️", "⏲️", "🏆", "🎖️",
    "📁", "💭", "💡", "🎨", "🎯", "🔖", "📖", "📒", "📏", "🔍", "📌",
  ]

  const particlesContainer = document.querySelector("[data-particles]")
  const PARTICLE_COUNT = 30

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = document.createElement("div")
    const left = Math.random() * 100
    const duration = 6 + Math.random() * 10
    const delay = Math.random() * 10
    const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)]


    p.textContent = emoji
    p.style.left = left + "%"
    p.style.animationDuration = duration + "s"
    p.style.animationDelay = delay + "s"
    p.style.position = "absolute"
    p.style.bottom = "-20px"
    p.style.opacity = "0"
    p.style.animationName = "floatUp"
    p.style.animationTimingFunction = "linear"
    p.style.animationIterationCount = "infinite"

    particlesContainer.appendChild(p)
  }
})
