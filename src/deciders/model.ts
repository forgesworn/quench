// Q3: the request a typed model decider sends at a gated decision point. Pure:
// it only shapes run-time text; the runner (src/cli-model.ts) calls the model
// off the hot path and the harness replays its recorded answers.
export const modelSettings = {
  model: 'deepseek-v4.1-flash:cloud',
  /** Bumped whenever the request changes, so recorded answers are never reused across versions. */
  promptVersion: 2,
  think: false,
  temperature: 0,
  summaryChars: 12000,
  maxOutputTokens: 200,
} as const

export const answerSchema = {
  type: 'object',
  properties: {
    decision: { type: 'string', enum: ['stop', 'continue'] },
    missing: { type: 'array', items: { type: 'string' }, maxItems: 8 },
  },
  required: ['decision', 'missing'],
  additionalProperties: false,
} as const

export interface ModelAnswer {
  decision: 'stop' | 'continue'
  missing: string[]
}

const system = `You judge whether a coding agent has gathered enough evidence to stop exploring and write its final answer.
You see the task and a summary of the agent's session so far: files read, the newest tool results and the calls made.
Answer "stop" only if the tool results already contain everything the task asks for, including the implementation and focused tests it must cite.
If anything the task asks about has not yet been read, answer "continue" and list what is missing (short phrases).
A premature stop is far worse than one extra tool call.
Reply with exactly this JSON object and nothing else: {"decision": "stop" | "continue", "missing": [string, ...]}
Use the key "decision" (not "verdict") and give "missing": [] when you answer "stop".`

export function modelMessages(summary: string): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    { role: 'system', content: system },
    { role: 'user', content: `${summary}\n\nHas the agent gathered enough evidence to stop?` },
  ]
}

export function parseAnswer(text: string): ModelAnswer | null {
  try {
    const value = JSON.parse(text) as Partial<ModelAnswer>
    if ((value.decision === 'stop' || value.decision === 'continue') && Array.isArray(value.missing)) {
      return { decision: value.decision, missing: value.missing.filter((item): item is string => typeof item === 'string') }
    }
  } catch {}
  return null
}
