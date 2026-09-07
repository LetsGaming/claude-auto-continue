const vscode = require('vscode');
const { cfg, enabled } = require('./config');

let statusBar = null;

function create(context) {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'claudeAutoContinue.showStatus';
  context.subscriptions.push(statusBar);
  return statusBar;
}

function update(sessions) {
  if (!statusBar) return;
  const active = [...sessions.values()].filter(s => s.isClaude);
  const limited = active.filter(s => s.limit);
  const state = enabled() ? 'on' : 'off';
  statusBar.text = `$(sync) Claude Auto: ${active.length} ${state}${limited.length ? ` · ${limited.length} limited` : ''}`;
  statusBar.tooltip = limited.length
    ? limited.map(s => `${s.terminal.name}: reset ${s.resetAt ? s.resetAt.toLocaleTimeString() : 'unknown'}`).join('\n')
    : 'Claude Auto Continue';
  statusBar.show();
}

async function showStatus(sessions) {
  const scheduledOn = cfg().get('scheduledContinueEnabled', false);
  const lines = [
    `Enabled: ${enabled()}`,
    `Auto-detect (limit reset): ${cfg().get('detectLimits', true)}`,
    `Scheduled continuation: ${scheduledOn ? `on (${cfg().get('scheduledTime', '19:30')})` : 'off'}`,
    ''
  ];
  for (const s of sessions.values()) {
    if (!s.isClaude) continue;
    lines.push(`${s.terminal.name}: ${s.limit ? `LIMIT${s.resetAt ? ` → ${s.resetAt.toLocaleString()}` : ''}` : 'running'}`);
  }
  if (lines.length === 3) lines.push('No Claude sessions detected yet.');
  vscode.window.showInformationMessage(lines.join('\n'));
}

module.exports = { create, update, showStatus };
