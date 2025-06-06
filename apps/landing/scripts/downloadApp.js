document.addEventListener("DOMContentLoaded", () => {
  const platformLinks = {
    mac: "https://github.com/scheron/Daily/releases/latest/download/Daily-macOS.dmg",
    win: "https://github.com/scheron/Daily/releases/latest/download/Daily-Windows.exe",
    linux: "https://github.com/scheron/Daily/releases/latest/download/Daily-Linux.AppImage",
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
