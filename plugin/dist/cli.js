#!/usr/bin/env node
// quench: find what your coding agent spends money on, and change it.
//   quench [report] [--days 30] [--json] ...   ranked actions from your local transcripts
//   quench apply <action> [--yes]              make a setting change the report suggests (shown first, backed up)
//   quench undo <action> [--yes]               put it back
//   quench guard                               the break-guard hook (Claude Code runs this)
import { fileURLToPath } from 'node:url';
import { apply, SETTING_ACTIONS, undo } from "./settings.js";
const [command, ...rest] = process.argv.slice(2);
const out = (line = '') => { process.stdout.write(`${line}\n`); };
function show(change, write, verb) {
    out(`${verb === 'apply' ? 'Apply' : 'Undo'} ${change.action}: ${change.describe}.`);
    out(`Settings file: ${change.path}`);
    if (change.skip)
        out(`Nothing to do: ${change.skip}.`);
    else if (!write)
        out(`Nothing written yet. Run \`quench ${verb} ${change.action} --yes\` to ${verb === 'apply' ? 'make' : 'reverse'} the change.`);
    else
        out(`Done; the previous file was backed up beside it.${verb === 'apply' ? ` Reverse it with \`quench undo ${change.action} --yes\`. It applies to Claude Code sessions started from now on.` : ''}`);
}
if (command === 'guard') {
    await (await import("./guard.js")).guardMain();
}
else if (command === 'apply' || command === 'undo') {
    const action = rest.find((a) => !a.startsWith('--'));
    if (!action || !SETTING_ACTIONS[action]) {
        out(`usage: quench ${command} <action> [--yes]; actions: ${Object.keys(SETTING_ACTIONS).join(', ')}`);
        process.exitCode = 2;
    }
    else {
        const write = rest.includes('--yes');
        show(command === 'apply' ? apply(action, write, fileURLToPath(import.meta.url)) : undo(action, write), write, command);
    }
}
else if (command === undefined || command === 'report' || command.startsWith('--')) {
    await import("./cli-report.js");
}
else {
    out('usage: quench [report | apply <action> | undo <action> | guard] [options]');
    process.exitCode = 2;
}
