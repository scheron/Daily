export enum WebFetchErrorCode {
  DisallowedScheme = "DISALLOWED_SCHEME",
  BlockedBySsrfGuard = "BLOCKED_BY_SSRF_GUARD",
  DisallowedContentType = "DISALLOWED_CONTENT_TYPE",
  ResponseTooLarge = "RESPONSE_TOO_LARGE",
  TooManyRedirects = "TOO_MANY_REDIRECTS",
  Timeout = "TIMEOUT",
  EmptyContent = "EMPTY_CONTENT",
  FetchFailed = "FETCH_FAILED",
}
