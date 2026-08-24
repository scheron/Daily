export const CSP_POLICY =
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ` +
  `img-src 'self' data: blob: https: file: temp: daily:; font-src 'self' data:; ` +
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
