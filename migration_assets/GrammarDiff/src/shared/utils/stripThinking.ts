/**
 * Remove `<think>…</think>` reasoning blocks from model output. Closed blocks are
 * stripped wherever they appear; a remaining unclosed `<think>` (the model stopped
 * mid-reasoning) drops everything from that tag onward.
 */
export function stripThinking(text: string): string {
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, "")
  const stray = out.search(/<think>/i)
  if (stray !== -1) out = out.slice(0, stray)
  return out
}
