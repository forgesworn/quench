// The break guard, a Claude Code UserPromptSubmit hook. After a break longer than the prompt cache lasts, the next
// request writes the whole context again. For a large session the guard holds the first prompt once and says what
// sending it will cost, so new work can start in a fresh session instead; sending the prompt again goes through.
import { closeSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { pricing } from "./report.js";
import { quenchHome } from "./settings.js";
/** The newest assistant response with usage in a transcript's tail. */
export function lastTurn(tail) {
    const lines = tail.split('\n');
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i];
        if (!line.includes('"usage"') || !line.includes('"assistant"'))
            continue;
        let e;
        try {
            e = JSON.parse(line);
        }
        catch {
            continue;
        }
        const u = e.message?.usage;
        const at = e.timestamp ? Date.parse(e.timestamp) : NaN;
        if (e.type !== 'assistant' || !u || Number.isNaN(at) || e.message?.model === '<synthetic>')
            continue;
        const oneHour = (u.cache_creation?.ephemeral_1h_input_tokens ?? 0) > 0;
        return {
            at, model: e.message?.model ?? '',
            ctx: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
            ttlMs: (oneHour ? 60 : 5) * 60e3,
        };
    }
    return null;
}
export const defaults = { minContext: 100e3, repeatWindowMs: 15 * 60e3 };
export function decide(last, now, warnedAt, options = defaults) {
    if (!last || last.ctx < options.minContext)
        return { block: false };
    const idle = now - last.at;
    if (idle < last.ttlMs)
        return { block: false };
    if (warnedAt !== null && now - warnedAt < options.repeatWindowMs)
        return { block: false };
    const p = pricing.claude;
    const scale = p.scale(last.model);
    const usd = scale === null ? null : scale * (last.ttlMs > 5 * 60e3 ? p.write1h : p.write5m) * last.ctx;
    const minutes = Math.round(idle / 60e3);
    const idleText = minutes >= 120 ? `${Math.round(minutes / 60)} hours` : `${minutes} minutes`;
    const costText = usd === null ? '' : ` (about $${usd.toFixed(2)} at list price)`;
    return {
        block: true, usd, idleMinutes: minutes,
        reason: `Quench: this session's prompt cache expired (last reply ${idleText} ago), so this prompt will write its ${Math.round(last.ctx / 1e3)}K-token context again${costText}.\n` +
            'New task? Run /clear first, then send it. Same task? Send it again and it goes through.',
    };
}
function readTail(path, bytes) {
    const fd = openSync(path, 'r');
    try {
        const size = fstatSync(fd).size;
        const length = Math.min(size, bytes);
        const buffer = Buffer.alloc(length);
        readSync(fd, buffer, 0, length, size - length);
        return buffer.toString('utf8');
    }
    finally {
        closeSync(fd);
    }
}
/** The hook: reads the event on stdin, prints a block decision or nothing. It never fails the prompt. */
export async function guardMain() {
    try {
        let input = '';
        for await (const chunk of process.stdin)
            input += chunk;
        // The plugin's /config options reach the hook as CLAUDE_PLUGIN_OPTION_<KEY>.
        const option = (key) => process.env[`CLAUDE_PLUGIN_OPTION_${key.toUpperCase()}`] ?? process.env[`CLAUDE_PLUGIN_OPTION_${key}`];
        if (/^(false|0|off|no)$/i.test(option('break_guard') ?? ''))
            return;
        const event = JSON.parse(input);
        if (!event.transcript_path || !event.session_id || !/^[\w-]+$/.test(event.session_id))
            return;
        let last = lastTurn(readTail(event.transcript_path, 512 * 1024));
        if (!last)
            last = lastTurn(readTail(event.transcript_path, 8 * 1024 * 1024));
        const dir = join(quenchHome(), 'guard');
        const mark = join(dir, `${event.session_id}.json`);
        let warnedAt = null;
        try {
            warnedAt = JSON.parse(readFileSync(mark, 'utf8')).warnedAt;
        }
        catch { }
        const minContext = Number(process.env.QUENCH_GUARD_MIN_CONTEXT ?? option('guard_min_context') ?? defaults.minContext) || defaults.minContext;
        const verdict = decide(last, Date.now(), warnedAt, { ...defaults, minContext });
        if (!verdict.block) {
            if (warnedAt !== null)
                rmSync(mark, { force: true });
            return;
        }
        mkdirSync(dir, { recursive: true });
        writeFileSync(mark, JSON.stringify({ warnedAt: Date.now() }));
        // Counts only, for the report: no prompt text, paths or session ids.
        appendFileSync(join(quenchHome(), 'guard.log'), `${JSON.stringify({ at: new Date().toISOString(), ctx: last?.ctx, idleMinutes: verdict.idleMinutes, usd: verdict.usd })}\n`);
        process.stdout.write(JSON.stringify({ decision: 'block', reason: verdict.reason }));
    }
    catch {
        // A guard that fails must let the prompt through.
    }
}
