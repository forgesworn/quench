#!/usr/bin/env node
// Where your coding agent's spend goes, from its local transcripts. Aggregates only: no content, project names
// or paths are printed.
// Usage: quench-report [--agent claude|codex|all] [--days 30] [--json] [--summary <tokens>]
//                      [--claude-root ~/.claude/projects] [--codex-root ~/.codex/sessions]
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { agentReport, claudeParser, codexParser, premiumSubagentShare } from "./report.js";
import { claudeHome, claudeSettingsPath, pluginState, quenchHome, readSettings, readState } from "./settings.js";
const args = process.argv.slice(2);
const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
const agentOption = option('--agent') ?? 'all';
if (!['claude', 'codex', 'all'].includes(agentOption))
    throw new Error('--agent must be claude, codex or all');
const days = Number(option('--days') ?? '30');
const summaryOption = option('--summary');
const summary = summaryOption === undefined ? undefined : Number(summaryOption);
const roots = {
    claude: option('--claude-root') ?? join(claudeHome(), 'projects'),
    codex: option('--codex-root') ?? join(homedir(), '.codex', 'sessions'),
};
const since = Date.now() - days * 864e5;
const skipped = { claude: 0, codex: 0 };
function transcripts(root, depth) {
    const out = [];
    const walk = (dir, level) => {
        let names;
        try {
            names = readdirSync(dir);
        }
        catch {
            return;
        }
        for (const name of names) {
            const path = join(dir, name);
            let stat;
            try {
                stat = statSync(path);
            }
            catch {
                continue;
            }
            if (stat.isDirectory() && level < depth)
                walk(path, level + 1);
            else if (name.endsWith('.jsonl') && stat.mtimeMs > since)
                out.push(path);
        }
    };
    if (existsSync(root))
        walk(root, 0);
    return out;
}
async function read(agent, path) {
    const parser = agent === 'claude' ? claudeParser() : codexParser();
    try {
        for await (const line of createInterface({ input: createReadStream(path), crlfDelay: Infinity }))
            parser.line(line);
    }
    catch {
        return null;
    }
    // Claude Code can route to other models (a gateway, a local server); their prices differ, so they are left out.
    // A file modified in the window can hold older requests; those are left out.
    const all = parser.requests().filter((r) => r.at === null || r.at >= since);
    const requests = agent === 'claude' ? all.filter((r) => r.model.startsWith('claude')) : all;
    skipped[agent] += all.length - requests.length;
    const sub = agent === 'claude' ? /[\\/]subagents[\\/]/.test(path) : parser.sub();
    if (!requests.length)
        return null;
    const agentType = sub && agent === 'claude' ? subagentType(path) : undefined;
    return { agent, sub, requests, ...(agentType ? { agentType } : {}) };
}
// Claude Code writes <agent>.meta.json beside a subagent transcript. Only built-in type names are kept: a custom
// agent's name could name a project.
const BUILT_IN = new Set(['general-purpose', 'Explore', 'Plan', 'claude-code-guide', 'statusline-setup', 'output-style-setup', 'fork']);
function subagentType(path) {
    try {
        const type = JSON.parse(readFileSync(path.replace(/\.jsonl$/, '.meta.json'), 'utf8')).agentType;
        return typeof type === 'string' ? (BUILT_IN.has(type) ? type : 'custom') : undefined;
    }
    catch {
        return undefined;
    }
}
const reports = [];
const sessionsBy = {};
for (const agent of ['claude', 'codex']) {
    if (agentOption !== 'all' && agentOption !== agent)
        continue;
    const files = transcripts(roots[agent], agent === 'claude' ? 3 : 4);
    const sessions = [];
    let done = 0;
    for (const file of files) {
        const session = await read(agent, file);
        if (session)
            sessions.push(session);
        done += 1;
        if (process.stderr.isTTY)
            process.stderr.write(`\r${agent}: ${done}/${files.length} transcripts`);
    }
    if (process.stderr.isTTY && files.length)
        process.stderr.write('\r\x1b[K');
    sessionsBy[agent] = sessions;
    if (sessions.length)
        reports.push({ ...agentReport(agent, sessions, summary), otherModelRequests: skipped[agent] });
}
const state = readState();
let settings = {};
try {
    settings = readSettings(claudeSettingsPath());
}
catch { }
const plugin = pluginState(settings);
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
/** What changed after an applied action. These lines check that a change took effect; they do not measure a saving. */
function appliedLines() {
    const lines = [];
    const sub = state.applied['subagent-model'];
    if (sub) {
        const at = Date.parse(sub.at);
        const before = premiumSubagentShare(sessionsBy.claude ?? [], since, at);
        const after = premiumSubagentShare(sessionsBy.claude ?? [], at, Infinity);
        const then = before.requests ? `against ${Math.round(100 * before.share)}% before` : 'with no requests before it in this window to compare';
        lines.push(`subagent-model since ${day(sub.at)}: general-purpose subagents on models dearer than Sonnet 5 took ${Math.round(100 * after.share)}% of cost (${after.requests.toLocaleString('en-GB')} requests), ${then}. This shows whether the setting took effect, not what it saved.`);
    }
    let log = [];
    try {
        log = readFileSync(join(quenchHome(), 'guard.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    }
    catch { }
    log = log.filter((h) => Date.parse(h.at) >= since);
    const held = log.filter((h) => (h.event ?? 'held') === 'held');
    const resent = log.filter((h) => h.event === 'resent').length;
    if (state.applied['break-guard'] || plugin.guard || held.length) {
        const usd = held.reduce((a, h) => a + (h.usd ?? 0), 0);
        const kept = Math.max(0, held.length - resent);
        lines.push(`break guard: held ${held.length} prompt${held.length === 1 ? '' : 's'} after a break in the last ${days} days${held.length ? `; ${resent} ${resent === 1 ? 'was' : 'were'} sent again, ${kept} ${kept === 1 ? 'was' : 'were'} not (a fresh session, or dropped). Sending all of them at once would have written about $${usd.toFixed(2)}` : ''}.`);
    }
    return lines;
}
if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ days, reports, applied: appliedLines() }, null, 2)}\n`);
}
else {
    const out = (line = '') => { process.stdout.write(`${line}\n`); };
    const pct = (x) => `${Math.round(100 * x)}%`;
    const count = (n, noun) => `${n.toLocaleString('en-GB')} ${noun}${n === 1 ? '' : 's'}`;
    const k = (n) => `${Math.round(n / 1e3)}K`;
    const range = (from, to, unit) => (to === null ? `${unit(from)}+` : `${unit(from)}-${unit(to)}`);
    const name = { claude: 'Claude Code', codex: 'Codex' };
    const model = (id) => (id === 'other' ? 'other models' : !id.startsWith('claude-') ? id : id.replace(/^claude-/, '').replace(/-\d{8}$/, '').replace(/-(\d+)-(\d+)(?=$|-)/, ' $1.$2').replace(/-(\d+)(?=$|-)/, ' $1'));
    const effortSetting = { claude: '/effort', codex: 'model_reasoning_effort' };
    out(`quench report: the last ${days} days of local transcripts, aggregates only`);
    if (!reports.length)
        out('\nNo transcripts found.');
    for (const r of reports) {
        const money = (x) => (r.currency === 'USD' ? `$${x >= 100 ? Math.round(x).toLocaleString('en-GB') : x.toFixed(2)}` : `${Math.round(x / 1e6).toLocaleString('en-GB')}M base-input units`);
        out(`\n${name[r.agent]}: ${count(r.sessions, 'session')}, ${count(r.subagentTranscripts, 'subagent transcript')}, ${count(r.requests, 'request')}`);
        out(`  ${r.currency === 'USD' ? `${money(r.total)} at API list prices. On a subscription this is not your bill; it shows where the tokens went, priced alike` : `${money(r.total)} (relative multipliers; no dollar price is known for these models)`}.`);
        out(`  Priced with ${r.pricing}.${r.otherModelRequests ? ` Left out: ${count(r.otherModelRequests, 'request')} to non-Claude models.` : ''}${r.unpricedRequests ? ` ${count(r.unpricedRequests, 'request')} to models without a known price count as zero.` : ''}`);
        out('\n  Actions');
        let n = 0;
        for (const a of r.actions) {
            n += 1;
            const f = a.facts;
            if (a.id === 'fresh-after-break') {
                out(`  ${n}. After a break of more than an hour, start new work in a fresh session (/clear) instead of carrying on.`);
                out(`     ${count(Number(f.breaks), 'time')} you came back to a session of ${k(Number(f.minContext))}+ whose prompt cache had expired, so its whole context (median ${k(Number(f.medianContext))}) was written again.`);
                out(`     A fresh session writes only its ${k(Number(f.basePrompt))} base prompt: up to ${money(a.saving)} (${pct(a.share)}) if every one of those was new work. Keep the session when you are continuing the same task.`);
                if (r.agent === 'claude') {
                    const guardOn = state.applied['break-guard'] ? `the break guard has been on since ${day(state.applied['break-guard'].at)}` : plugin.guard ? 'the Quench plugin\'s break guard is on' : null;
                    out(guardOn ? `     Applied: ${guardOn}.` : plugin.enabled || process.env.CLAUDE_PLUGIN_ROOT ? '     Do it: turn on break_guard under the Quench plugin in /config (holds the first prompt after such a break once, with its cost)' : '     Do it: quench apply break-guard (holds the first prompt after such a break once, with its cost)');
                }
            }
            else if (a.id === 'subagent-model') {
                out(`  ${n}. Run general-purpose subagents on Sonnet 5 unless the task needs a stronger model (CLAUDE_CODE_SUBAGENT_MODEL=sonnet).`);
                out(`     General-purpose subagents on dearer models cost ${money(Number(f.premiumCost))} (${pct(Number(f.premiumShare))}). The same tokens on Sonnet 5 would cost up to ${money(a.saving)} (${pct(a.share)}) less;`);
                out(`     Claude can still pick a stronger model for a task, and the quality of the switch is not measured.${Number(f.unmovedCost) > 0 ? ` A further ${money(Number(f.unmovedCost))} on Explore, Plan, forks and custom agents is not changed by this setting.` : ''}`);
                out(state.applied['subagent-model'] ? `     Applied on ${day(state.applied['subagent-model'].at)}; see Since applied below.` : '     Do it: quench apply subagent-model');
            }
            else if (a.id === 'effort') {
                out(`  ${n}. Thinking is ${pct(a.share)} of cost (${pct(r.components.thinkingShareOfOutput)} of output tokens). Lowering ${effortSetting[r.agent]} trims that, and may also mean fewer tool calls, which Quench has not measured.`);
            }
            out(`     Evidence: ${a.evidence}.`);
        }
        const applied = r.agent === 'claude' ? appliedLines() : [];
        if (applied.length) {
            out('\n  Since applied');
            for (const line of applied)
                out(`    ${line}`);
        }
        out('\n  Where the cost goes');
        out(`    By kind: cache reads ${pct(r.components.cacheReads)}, cache writes and fresh input ${pct(r.components.writesAndFresh)}, output ${pct(r.components.output)}; subagents ${pct(r.subagentShare)}.`);
        if (r.byModel.length > 1)
            out(`    By model: ${r.byModel.slice(0, 6).map((m) => `${model(m.model)} ${pct(m.share)}`).join(', ')}.`);
        out('    By session length (requests):');
        for (const g of r.bySessionLength)
            out(`      ${range(g.from, g.to, String).padEnd(10)} ${String(g.sessions).padStart(5)} sessions  ${pct(g.costShare).padStart(4)} of session cost`);
        out('    By context size at the request:');
        for (const g of r.byContext)
            out(`      ${range(g.from, g.to, k).padEnd(10)} ${pct(g.requestShare).padStart(4)} of requests  ${pct(g.costShare).padStart(4)} of session cost`);
        if (r.compactions.count)
            out(`    Compactions seen: ${r.compactions.count}; median context ${k(r.compactions.medianBefore)} before, ${k(r.compactions.medianAfter)} after.`);
        if (r.agent === 'claude')
            out('    Compaction: no advice. Quench\'s one test (DeepSeek, two task chains, contexts to 110K) went both ways and nothing above 200K is tested; see docs/EVIDENCE.md, Q8.');
    }
}
