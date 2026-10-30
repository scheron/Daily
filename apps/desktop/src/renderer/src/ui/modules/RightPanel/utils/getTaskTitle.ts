/**
 * The first non-empty line of a task's markdown without its marks.
 *
 * @example
 * getTaskTitle("## **Ship** it\nmore") // "Ship it"
 */
export function getTaskTitle(content: string): string {
  const line = content.split("\n").find((value) => value.trim()) ?? ""
  return line
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)/g, "$2")
    .replace(/(\*\*|~~)(?=\S)(.+?)(?<=\S)\1/g, "$2")
    .replace(/\*(?=\S)(.+?)(?<=\S)\*/g, "$1")
    .replace(/(?<!\w)(__?)(?=\S)(.+?)(?<=\S)\1(?!\w)/g, "$2")
    .trim()
}
