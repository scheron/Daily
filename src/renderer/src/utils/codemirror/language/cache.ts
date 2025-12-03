import {languages} from "@codemirror/language-data"

import type {LanguageSupport} from "@codemirror/language"

const languageCache = new Map<string, LanguageSupport | null>()

/**
 * Check if language is already loaded
 */
export function isLanguageLoaded(languageName: string): boolean {
  return languageCache.has(languageName)
}

/**
 * Get cached language (synchronously)
 * Returns undefined if not loaded, null if load failed
 */
export function getCachedLanguage(languageName: string): LanguageSupport | null | undefined {
  return languageCache.get(languageName)
}

/**
 * Load a language parser dynamically
 * Returns null if language not found or load fails
 */
export async function loadLanguage(languageName: string): Promise<LanguageSupport | null> {
  // Check cache first
  if (languageCache.has(languageName)) {
    return languageCache.get(languageName) || null
  }

  // Find language in CodeMirror's language data
  const langInfo = languages.find(
    (lang) =>
      lang.name.toLowerCase() === languageName.toLowerCase() || lang.alias?.some((alias) => alias.toLowerCase() === languageName.toLowerCase()),
  )

  if (!langInfo) {
    languageCache.set(languageName, null)
    return null
  }

  try {
    // Load language support dynamically
    const language = await langInfo.load()
    languageCache.set(languageName, language)
    return language
  } catch (err) {
    console.warn(`Failed to load language: ${languageName}`, err)
    languageCache.set(languageName, null)
    return null
  }
}

/**
 * Clear the language cache (useful for testing)
 */
export function clearLanguageCache(): void {
  languageCache.clear()
}
