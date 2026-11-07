import {UPDATES_CONFIG} from "@shared/config/updates"

export const WHATS_NEW_MEDIA_SOURCES = [
  `https://github.com/${UPDATES_CONFIG.githubRepo}/releases/download/`,
  "https://github.com/user-attachments/assets/",
  "https://release-assets.githubusercontent.com/",
  "https://objects.githubusercontent.com/",
  "https://user-images.githubusercontent.com/",
  "https://private-user-images.githubusercontent.com/",
]

export const CSP_POLICY =
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ` +
  `img-src 'self' data: blob: https: file: temp: daily:; font-src 'self' data:; ` +
  `media-src 'self' ${WHATS_NEW_MEDIA_SOURCES.join(" ")}; ` +
  `connect-src 'self' https://api.github.com https://github.com; frame-src 'none'; object-src 'none';`

export const PRIVILEGED_SCHEMES = [
  {
    scheme: "daily",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
      bypassCSP: false,
    },
  },
]
