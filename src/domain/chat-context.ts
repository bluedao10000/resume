export type ContextMessage = { role: 'user' | 'assistant'; content: string }
// A bounded model window, independent of the full retained UI transcript.
export function boundedHistory(messages: ContextMessage[]) {
  const retained: ContextMessage[] = []
  let remaining = 32000
  for (const message of messages.slice(-40).reverse()) {
    const content = message.content.slice(-Math.min(20000, remaining))
    if (!content || remaining <= 0) break
    retained.unshift({ role: message.role, content })
    remaining -= content.length
  }
  return retained
}
