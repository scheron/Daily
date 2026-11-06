/** Trims one complete emoji grapheme; empty values and other text use the standard project icon. */
export function normalizeProjectEmoji(value: string | null | undefined): string | null {
  const EMOJI_PATTERN = /^(?:\p{RGI_Emoji}|\p{Extended_Pictographic})$/v
  const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, {granularity: "grapheme"})
  const emoji = value?.trim()
  if (!emoji || !EMOJI_PATTERN.test(emoji) || /^\p{Emoji_Modifier}$/u.test(emoji)) return null
  return [...GRAPHEME_SEGMENTER.segment(emoji)].length === 1 ? emoji : null
}
