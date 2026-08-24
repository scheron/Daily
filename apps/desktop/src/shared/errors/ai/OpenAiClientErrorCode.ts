/**
 * Error codes thrown by the OpenAI-compatible client (and its subclasses
 * for remote/local providers) on streaming / response failures.
 */
export enum OpenAiClientErrorCode {
  NoResponseBody = "No response body",
  NoResponse = "No response from client",
  ApiError = "API error",
  HttpError = "HTTP error",
}
