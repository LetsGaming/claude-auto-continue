const vscode = require('vscode');
const { cfg, enabled, scheduledTimes } = require('./config');
const history = require('./history');
const scheduler = require('./scheduler');

let statusBar = null;

function create(context) {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'claudeAutoContinue.showStatus';
  context.subscriptions.push(statusBar);
  return statusBar;
}

function computeNextAction(limited) {
  let best = null;

  for (const s of limited) {
    if (!s.resetAt) continue;
    const wakeAt = new Date(s.resetAt.getTime() + cfg().get('resetGraceSeconds', 15) * 1000);
    if (!best || wakeAt.getTime() < best.at.getTime()) {
      best = { at: wakeAt, kind: 'session', name: s.terminal.name };
    }
  }

  if (cfg().get('scheduledContinueEnabled', false)) {
    const nextRun = scheduler.nextOccurrence(new Date(), scheduledTimes());
    if (nextRun && (!best || nextRun.getTime() < best.at.getTime())) {
      best = { at: nextRun, kind: 'scheduled' };
    }
  }

  if (!best) return 'None scheduled';
  const time = best.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return best.kind === 'session' ? `Continue "${best.name}" at ${time}` : `Scheduled run at ${time}`;
}

function update(sessions) {
  if (!statusBar) return;
  const active = [...sessions.values()].filter(s => s.isClaude);
  const limited = active.filter(s => s.limit);
  const paused = active.filter(s => s.paused);
  const state = enabled() ? 'on' : 'off';
  const icon = !enabled() ? '$(circle-slash)' : (limited.length > 0 ? '$(clock)' : '$(sync)');
  statusBar.text = `${icon} Claude Auto: ${active.length} ${state}${limited.length ? ` · ${limited.length} limited` : ''}${paused.length ? ` · ${paused.length} paused` : ''}`;

  const lines = [
    `Claude Auto Continue — ${state}`,
    `Active: ${active.length} · Limited: ${limited.length} · Paused: ${paused.length}`,
    '',
    `**Next action:** ${computeNextAction(limited)}`
  ];

  if (limited.length > 0) {
    lines.push('');
    for (const s of limited) {
      lines.push(`- ${s.terminal.name}: reset ${s.resetAt ? s.resetAt.toLocaleTimeString() : 'unknown'}`);
    }
  }

  const recentEntries = history.recent(3);
  if (recentEntries.length > 0) {
    lines.push('');
    lines.push('**Recent:**');
    for (const e of recentEntries) {
      lines.push(`- ${e.type} ${e.terminalName}${e.detail ? `: ${e.detail}` : ''}`);
    }
  }

  statusBar.tooltip = new vscode.MarkdownString(lines.join('\n'));
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
  let pausedCount = 0;
  for (const s of sessions.values()) {
    if (!s.isClaude) continue;
    if (s.paused) pausedCount++;
    lines.push(`${s.terminal.name}: ${s.limit ? `LIMIT${s.resetAt ? ` → ${s.resetAt.toLocaleString()}` : ''}` : s.paused ? 'paused' : 'running'}`);
  }
  if (pausedCount > 0) lines.push(`Paused: ${pausedCount}`);
  if (lines.length === 3) lines.push('No Claude sessions detected yet.');
  vscode.window.showInformationMessage(lines.join('\n'));
}

module.exports = { create, update, showStatus };
