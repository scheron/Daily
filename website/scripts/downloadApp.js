document.addEventListener("DOMContentLoaded", () => {
  const platformLinks = {
    mac: "https://github.com/scheron/Daily?tab=readme-ov-file#-installation",
    win: "https://github.com/scheron/Daily?tab=readme-ov-file#-installation",
    linux: "https://github.com/scheron/Daily?tab=readme-ov-file#-installation",
  }

  function detectPlatform() {
    const {platform} = navigator
    if (/Mac/i.test(platform)) return "mac"
    if (/Win/i.test(platform)) return "win"
    if (/Linux/i.test(platform)) return "linux"
    return null
  }

  const downloadBtn = document.querySelector("#download")
  const platform = detectPlatform()

  if (downloadBtn && platform && platformLinks[platform]) {
    downloadBtn.href = platformLinks[platform]
    downloadBtn.textContent = `Download for ${{mac: "macOS", win: "Windows", linux: "Linux"}[platform]}`
  }
})
