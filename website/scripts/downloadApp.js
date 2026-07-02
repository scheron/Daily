const INSTALL_URL = "https://github.com/scheron/Daily?tab=readme-ov-file#install"
const RELEASES_API = "https://api.github.com/repos/scheron/Daily/releases/latest"

document.addEventListener("DOMContentLoaded", async () => {
  const downloadButtons = document.querySelectorAll(".js-download")
  if (!downloadButtons.length) return

  try {
    const response = await fetch(RELEASES_API)
    if (!response.ok) throw new Error(`GitHub API responded ${response.status}`)

    const release = await response.json()
    const dmg = release.assets?.find((asset) => asset.name.endsWith(".dmg"))
    if (!dmg) return

    for (const button of downloadButtons) {
      button.href = dmg.browser_download_url
    }
  } catch {
    for (const button of downloadButtons) {
      button.href = INSTALL_URL
    }
  }
})
