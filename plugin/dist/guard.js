// The break guard, a Claude Code UserPromptSubmit hook. After a break longer than the prompt cache lasts, the next
// request writes the whole context again. For a large session the guard holds the first prompt once and says what
// sending it will cost, so new work can start in a fresh session instead; sending the prompt again goes through.
import { appendFileSync, closeSync, fstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BREAK, pricing } from "./report.js";
import { quenchHome } from "./settings.js";
/**
 * The newest assistant response with usage in a transcript's tail. Null when there is none, or when the session
 * compacted after it: the context is then small and is written again whatever happens.
 */
export function lastTurn(tail) {
    const lines = tail.split('\n');
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i];
        if (line.includes('"compact_boundary"'))
            return null;
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
        const read = u.cache_read_input_tokens ?? 0;
        const written = u.cache_creation_input_tokens ?? 0;
        return {
            at, model: e.message?.model ?? '',
            ctx: (u.input_tokens ?? 0) + written + read,
            ttlMs: (oneHour ? 60 : 5) * 60e3,
            cached: read + written > 0,
        };
    }
    return null;
}
export const defaults = { minContext: BREAK.minContext, minIdleMs: BREAK.minIdleMs };
export function decide(last, now, mark, options = defaults) {
    // Only Claude models are priced, and a session that never used the cache has nothing to lose.
    if (!last || !last.model.startsWith('claude') || !last.cached || last.ctx < options.minContext)
        return { block: false };
    const idle = now - last.at;
    if (idle < Math.max(last.ttlMs, options.minIdleMs))
        return { block: false };
    // One hold per break: the prompt after it goes through, even if no reply was logged in between.
    if (mark?.at === last.at)
        return { block: false, resend: !mark.resent };
    const p = pricing.claude;
    const scale = p.scale(last.model);
    const usd = scale === null ? null : scale * (last.ttlMs > 5 * 60e3 ? p.write1h : p.write5m) * last.ctx;
    const minutes = Math.round(idle / 60e3);
    const idleText = minutes >= 120 ? `${Math.round(minutes / 60)} hours` : `${minutes} minutes`;
    const costText = usd === null ? '' : ` (about $${usd.toFixed(2)} at list price)`;
    return {
        block: true, usd, idleMinutes: minutes,
        reason: `Quench: this session's prompt cache expired (last reply ${idleText} ago), so this prompt will write its ${Math.round(last.ctx / 1e3)}K-token context again${costText}.\n` +
            'New task? Run /clear first, then send it. Same task? Send it again (copy it from above) and it goes through.',
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
const MARK_DAYS = 7;
/** Counts only, for the report: no prompt text, paths or session ids. */
const log = (entry) => appendFileSync(join(quenchHome(), 'guard.log'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
/** The hook: reads the event on stdin, prints a block decision or nothing. It never fails the prompt. */
export async function guardMain(fromPlugin) {
    try {
        let input = '';
        for await (const chunk of process.stdin)
            input += chunk;
        // The plugin's /config options reach the hook as CLAUDE_PLUGIN_OPTION_<KEY>. In the plugin the guard is off
        // until the user turns it on; a hook added with `quench apply break-guard` is on already.
        const option = (key) => process.env[`CLAUDE_PLUGIN_OPTION_${key.toUpperCase()}`];
        if (fromPlugin && !/^(true|1|on|yes)$/i.test(option('break_guard') ?? ''))
            return;
        if (/^(false|0|off|no)$/i.test(process.env.QUENCH_GUARD ?? ''))
            return;
        // Scripts and the SDK (claude -p) have no one to send the prompt again.
        const entry = process.env.CLAUDE_CODE_ENTRYPOINT;
        if (entry !== undefined && entry !== 'cli')
            return;
        const event = JSON.parse(input);
        if (!event.transcript_path || !event.session_id || !/^[\w-]+$/.test(event.session_id))
            return;
        let last = lastTurn(readTail(event.transcript_path, 512 * 1024));
        if (!last)
            last = lastTurn(readTail(event.transcript_path, 8 * 1024 * 1024));
        const dir = join(quenchHome(), 'guard');
        const markPath = join(dir, `${event.session_id}.json`);
        let mark = null;
        try {
            mark = JSON.parse(readFileSync(markPath, 'utf8'));
        }
        catch { }
        const minContext = Number(process.env.QUENCH_GUARD_MIN_CONTEXT ?? option('guard_min_context') ?? defaults.minContext) || defaults.minContext;
        const verdict = decide(last, Date.now(), mark, { ...defaults, minContext });
        if (!verdict.block) {
            if (verdict.resend && mark) {
                writeFileSync(markPath, JSON.stringify({ ...mark, resent: true }));
                log({ event: 'resent' });
            }
            return;
        }
        mkdirSync(dir, { recursive: true });
        for (const name of readdirSync(dir)) {
            const path = join(dir, name);
            try {
                if (Date.now() - statSync(path).mtimeMs > MARK_DAYS * 864e5)
                    rmSync(path, { force: true });
            }
            catch { }
        }
        writeFileSync(markPath, JSON.stringify({ at: last?.at, heldAt: Date.now() }));
        log({ event: 'held', ctx: last?.ctx, idleMinutes: verdict.idleMinutes, usd: verdict.usd });
        process.stdout.write(JSON.stringify({ decision: 'block', reason: verdict.reason }));
    }
    catch {
        // A guard that fails must let the prompt through.
    }
}
