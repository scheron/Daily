document.addEventListener("DOMContentLoaded", () => {
  const platformLinks = {
    mac: "https://github.com/scheron/Daily?tab=readme-ov-file#-installation",
  }

  function detectPlatform() {
    const {platform} = navigator
    if (/Mac/i.test(platform)) return "mac"
    return null
  }

  const downloadBtn = document.querySelector("#download")
  const platform = detectPlatform()

  if (downloadBtn && platform && platformLinks[platform]) {
    downloadBtn.href = platformLinks[platform]
    downloadBtn.textContent = `Download for macOS`
  } else if (downloadBtn) {
    downloadBtn.href = platformLinks.mac
    downloadBtn.textContent = `Download for macOS`
  }
})
