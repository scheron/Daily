/**
 * Thrown when the GitHub releases API rejects an update check because the
 * unauthenticated rate limit (60 requests per hour, per IP) is exhausted.
 * Background checks swallow it; manual checks surface the retry window.
 */
export class GitHubRateLimitError extends Error {
  constructor(readonly resetAt: Date | null) {
    super(GitHubRateLimitError.buildMessage(resetAt))
    this.name = "GitHubRateLimitError"
  }

  private static buildMessage(resetAt: Date | null): string {
    if (!resetAt) return "GitHub rate limit reached. Try checking for updates again later."

    const minutes = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 60_000))
    return `GitHub rate limit reached. Try checking for updates again in ${minutes} min.`
  }
}
