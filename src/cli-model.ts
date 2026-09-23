#!/usr/bin/env node
// Q3 runner: ask the typed model decider at each gated point of every labelled
// session, in order, until it says stop. Answers are appended to
// <out>/model-answers.jsonl as they arrive and reused on a rerun, so an
// interrupted pass resumes without asking any point twice.
// Usage: quench-model [--limit <sessions>] [--config quench.local.json]
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig, loadSessions, type Manifest } from './data.ts'
import { answerSchema, modelMessages, modelSettings, parseAnswer } from './deciders/model.ts'
import { gatedSummary, readAnswers, summaryKey, type RecordedAnswer } from './model-replay.ts'
import { parseSession } from './session.ts'

const args = process.argv.slice(2)
const option = (name: string): string | undefined => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const config = loadConfig(option('--config'))
const limit = Number(option('--limit') ?? Infinity)
const endpoint = process.env.QUENCH_OLLAMA ?? 'http://127.0.0.1:11435'
const answersPath = join(config.out, 'model-answers.jsonl')
const answers = readAnswers(answersPath)
const manifest = JSON.parse(readFileSync(join(config.out, 'manifest.json'), 'utf8')) as Manifest

async function ask(summary: string): Promise<Omit<RecordedAnswer, 'key'>> {
  const started = Date.now()
  const response = await fetch(`${endpoint}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modelSettings.model,
      messages: modelMessages(summary),
      format: answerSchema,
      think: modelSettings.think,
      stream: false,
      options: { temperature: modelSettings.temperature, num_predict: modelSettings.maxOutputTokens },
    }),
  })
  const body = await response.text()
  if (!response.ok) {
    // Refusals and spending holds stop the pass; they are never retried.
    throw new Error(`model call failed with HTTP ${response.status}: ${body.slice(0, 300)}`)
  }
  const json = JSON.parse(body) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number }
  const content = json.message?.content ?? ''
  const answer = parseAnswer(content)
  return {
    answer,
    ...(answer ? {} : { error: `unparsed: ${content.slice(0, 200)}` }),
    promptTokens: json.prompt_eval_count ?? 0,
    outputTokens: json.eval_count ?? 0,
    ms: Date.now() - started,
  }
}

let sessions = 0
let asked = 0
let reused = 0
let promptTokens = 0
let outputTokens = 0
for (const loaded of loadSessions(config, manifest)) {
  if (sessions >= limit) break
  sessions += 1
  const parsed = parseSession(loaded.stream, loaded.prompt)
  const state = gatedSummary()
  let cursor = 0
  for (const point of parsed.points) {
    for (; cursor < point.eventEnd; cursor += 1) {
      const event = parsed.events[cursor]
      if (event) state.observe(event)
    }
    const summary = state.next()
    if (summary === null) continue
    const key = summaryKey(summary)
    let row = answers.get(key)
    if (row) reused += 1
    else {
      row = { key, ...(await ask(summary)) }
      answers.set(key, row)
      appendFileSync(answersPath, `${JSON.stringify(row)}\n`)
      asked += 1
      promptTokens += row.promptTokens
      outputTokens += row.outputTokens
    }
    if (row.answer?.decision === 'stop') break
  }
  process.stderr.write(`${sessions} sessions, ${asked} asked, ${reused} reused, ${promptTokens} input and ${outputTokens} output tokens\n`)
}
process.stdout.write(`sessions ${sessions}; asked ${asked}; reused ${reused}; input tokens ${promptTokens}; output tokens ${outputTokens}\n`)
