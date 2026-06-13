export function countMarkdownWords(content: string): number {
  const withoutFrontmatter = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
  const matches = withoutFrontmatter.match(/\S+/g)
  return matches?.length ?? 0
}
