document.addEventListener("DOMContentLoaded", () => {
  const typewriter = document.getElementById("typewriter")

  const config = {
    typingSpeed: 60,
    deletingSpeed: 30,
    pauseBetween: 1500,
    pauseAfterDelete: 200,
  }

  const phrases = [
    "Minimal. Beautiful. Powerful.",
    "Markdown meets productivity",
    "See your progress by day",
    "Theme your focus",
    "AI-assisted productivity",
  ]

  function animateTypewriter(element, phrases, config) {
    let phraseIndex = 0
    let charIndex = 0
    let isDeleting = false
    let lastTime = performance.now()
    let requestId = null
    let isActive = true

    function updateText(text) {
      element.textContent = text
    }

    function animate(currentTime) {
      if (!isActive) return

      const delta = currentTime - lastTime
      const currentPhrase = phrases[phraseIndex]
      const actionDelay = isDeleting ? config.deletingSpeed : config.typingSpeed

      if (delta >= actionDelay) {
        if (!isDeleting) {
          if (charIndex < currentPhrase.length) {
            updateText(currentPhrase.substring(0, ++charIndex))
          } else {
            isActive = false
            setTimeout(() => {
              isDeleting = true
              isActive = true
              lastTime = performance.now()
              requestId = requestAnimationFrame(animate)
            }, config.pauseBetween)
            return
          }
        } else {
          if (charIndex > 0) {
            updateText(currentPhrase.substring(0, --charIndex))
          } else {
            isActive = false
            setTimeout(() => {
              phraseIndex = (phraseIndex + 1) % phrases.length
              isDeleting = false
              isActive = true
              lastTime = performance.now()
              requestId = requestAnimationFrame(animate)
            }, config.pauseAfterDelete)
            return
          }
        }
        lastTime = currentTime
      }

      requestId = requestAnimationFrame(animate)
    }
    requestId = requestAnimationFrame(animate)
  }

  if (typewriter) animateTypewriter(typewriter, phrases, config)
})
