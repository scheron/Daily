document.addEventListener("DOMContentLoaded", () => {
  const previewImage = document.getElementById("preview")
  const canvas = document.getElementById("maskCanvas")
  const getPath = (index) => (import.meta.env.ENV === "production" ? `/Daily/landing/assets/${index}.webp` : `/assets/${index}.webp`)

  const ctx = canvas.getContext("2d")
  const DURATION = 600
  const bubbleCount = () => Math.floor(Math.random() * 100) + 2

  let isAnimating = false
  let currentAnimationId = null

  function bubbleReveal(newSrc) {
    if (isAnimating) {
      if (currentAnimationId) {
        cancelAnimationFrame(currentAnimationId)
      }
      canvas.style.visibility = "hidden"
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    isAnimating = true

    const displayWidth = previewImage.clientWidth
    const displayHeight = previewImage.clientHeight
    const dpr = window.devicePixelRatio || 1
    canvas.width = displayWidth * dpr
    canvas.height = displayHeight * dpr
    canvas.style.width = `${displayWidth}px`
    canvas.style.height = `${displayHeight}px`
    ctx.scale(dpr, dpr)

    const tempImg = new Image()
    tempImg.src = newSrc
    tempImg.onload = () => {
      if (!isAnimating) return

      const startTime = performance.now()
      const maxRadius = Math.hypot(displayWidth, displayHeight)
      const bubbles = []
      for (let i = 0; i < bubbleCount(); i++) {
        const x = Math.random() * displayWidth
        const y = Math.random() * displayHeight
        const delay = Math.random() * 0.6
        const duration = 1 - delay
        bubbles.push({x, y, delay, duration})
      }
      function easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      }
      function animate(now) {
        if (!isAnimating) return

        let t = (now - startTime) / DURATION
        if (t > 1) t = 1
        if (canvas.style.visibility === "hidden") canvas.style.visibility = "visible"
        ctx.clearRect(0, 0, displayWidth, displayHeight)
        ctx.save()
        ctx.beginPath()
        for (const bubble of bubbles) {
          if (t <= bubble.delay) continue
          let localT = (t - bubble.delay) / bubble.duration
          if (localT > 1) localT = 1
          const radius = easeInOutQuad(localT) * maxRadius
          ctx.moveTo(bubble.x + radius, bubble.y)
          ctx.arc(bubble.x, bubble.y, radius, 0, Math.PI * 2)
        }
        ctx.clip()
        ctx.drawImage(tempImg, 0, 0, displayWidth, displayHeight)
        ctx.restore()
        if (t < 1) {
          currentAnimationId = requestAnimationFrame(animate)
        } else {
          ctx.clearRect(0, 0, displayWidth, displayHeight)
          ctx.save()
          ctx.beginPath()
          for (const bubble of bubbles) {
            ctx.moveTo(bubble.x + maxRadius, bubble.y)
            ctx.arc(bubble.x, bubble.y, maxRadius, 0, Math.PI * 2)
          }
          ctx.clip()
          ctx.drawImage(tempImg, 0, 0, displayWidth, displayHeight)
          ctx.restore()
          previewImage.style.opacity = "0"
          previewImage.src = newSrc
          previewImage.onload = () => {
            previewImage.style.opacity = "1"
            canvas.style.visibility = "hidden"
            isAnimating = false
            currentAnimationId = null
          }
        }
      }
      currentAnimationId = requestAnimationFrame(animate)
    }
  }

  const previewButtons = document.querySelectorAll(".preview-btn")
  let currentTheme = "0"

  previewButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = btn.getAttribute("data-preview")
      if (index === currentTheme) return
      currentTheme = index
      bubbleReveal(getPath(index))
    })
  })
})
