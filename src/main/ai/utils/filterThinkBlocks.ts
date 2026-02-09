export function filterThinkBlocks(content: string) {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .replace(/<internal>[\s\S]*?<\/internal>/gi, "")
    .split("\n")
    .filter((line) => !/^\s*(?:\d+\.\s*)?(?:\*\*)?(thought|action|action input|observation)(?:\*\*)?\s*:/i.test(line))
    .join("\n")
    .replace(/^\s+/, "")
    .trim()
}
