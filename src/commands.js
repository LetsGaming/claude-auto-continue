const vscode = require('vscode');

async function pickSession(sessionManager, { claudeOnly = true } = {}) {
  const items = [];

  if (claudeOnly) {
    for (const session of sessionManager.sessions.values()) {
      if (!session.isClaude) continue;
      const flags = [];
      if (session.limit) flags.push('limited');
      if (session.paused) flags.push('paused');
      if (session.messageProfile) flags.push(`profile: ${session.messageProfile}`);
      if (session.oneTimeMessage) flags.push('one-time msg queued');
      items.push({ label: session.terminal.name, description: flags.join(' · '), session });
    }
  } else {
    for (const terminal of vscode.window.terminals) {
      const session = sessionManager.sessionFor(terminal);
      const flags = [];
      if (session.limit) flags.push('limited');
      if (session.paused) flags.push('paused');
      if (session.messageProfile) flags.push(`profile: ${session.messageProfile}`);
      if (session.oneTimeMessage) flags.push('one-time msg queued');
      items.push({ label: session.terminal.name, description: flags.join(' · '), session });
    }
  }

  if (items.length === 0) {
    vscode.window.showInformationMessage(claudeOnly ? 'No Claude Code terminals found.' : 'No open terminals found.');
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a Claude terminal' });
  return picked?.session;
}

async function setResetTime(sessionManager) {
  // Always re-prompt for a terminal here, even when invoked from notify.js's action button
  // with a specific vscode.Terminal argument — the registered command wrapper in extension.js
  // discards that argument and calls this with just sessionManager, keeping this function's
  // signature simple and the "which terminal" logic centralized in pickSession.
  const session = await pickSession(sessionManager, { claudeOnly: false });
  if (!session) return;

  const input = await vscode.window.showInputBox({
    prompt: 'When does the limit reset? (e.g. 21:47, 9:47pm, 7pm, +90m, +2h, in 45 minutes)',
    placeHolder: '7pm'
  });
  if (!input) return;

  const { parseManualTime } = require('./timeInput');
  const resetAt = parseManualTime(input);
  if (resetAt === null) {
    vscode.window.showErrorMessage(`Could not parse "${input}" as a time.`);
    return;
  }

  session.isClaude = true;
  await sessionManager.handleLimit(session, { resetAt, raw: input }, { force: true });
}

async function togglePause(sessionManager) {
  const session = await pickSession(sessionManager, { claudeOnly: false });
  if (!session) return;

  sessionManager.setPaused(session, !session.paused);
  vscode.window.showInformationMessage(`${session.paused ? 'Paused' : 'Resumed'} auto-continue for "${session.terminal.name}".`);
}

async function selectMessageProfile(sessionManager) {
  const session = await pickSession(sessionManager, { claudeOnly: false });
  if (!session) return;

  const { profileNames } = require('./config');
  const names = profileNames();
  if (names.length === 0) {
    vscode.window.showInformationMessage('No message profiles configured. Add entries to the "claudeAutoContinue.messageProfiles" setting first.');
    return;
  }

  const items = ['(default message)', ...names];
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a message profile' });
  if (!picked) return;

  if (picked === '(default message)') {
    sessionManager.setMessageProfile(session, null);
  } else {
    sessionManager.setMessageProfile(session, picked);
  }
  vscode.window.showInformationMessage(`Message profile for "${session.terminal.name}" set to ${picked}.`);
}

async function setOneTimeMessage(sessionManager) {
  const session = await pickSession(sessionManager, { claudeOnly: false });
  if (!session) return;

  const input = await vscode.window.showInputBox({
    prompt: `One-time message for "${session.terminal.name}" — sent instead of the usual message the next time this session continues (on limit reset or the next scheduled run), then forgotten`,
    placeHolder: 'e.g. Now that the limit reset, please also update the README',
    value: session.oneTimeMessage || ''
  });
  if (input === undefined) return;

  sessionManager.setOneTimeMessage(session, input.trim());
  vscode.window.showInformationMessage(
    input.trim()
      ? `Queued a one-time message for "${session.terminal.name}".`
      : `Cleared the queued one-time message for "${session.terminal.name}".`
  );
}

async function scheduleOnceMessage(sessionManager) {
  const items = [{ label: 'All Claude Sessions', session: null }];
  for (const session of sessionManager.sessions.values()) {
    if (!session.isClaude) continue;
    items.push({ label: session.terminal.name, session });
  }
  for (const terminal of vscode.window.terminals) {
    if (items.some(i => i.session?.terminal === terminal)) continue;
    items.push({ label: terminal.name, session: sessionManager.sessionFor(terminal) });
  }

  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Send the one-time message to…' });
  if (!picked) return;

  const timeInput = await vscode.window.showInputBox({
    prompt: 'When should this be sent? (e.g. 21:47, 9:47pm, 7pm, +90m, +2h, in 45 minutes)',
    placeHolder: '7pm'
  });
  if (!timeInput) return;

  const { parseManualTime } = require('./timeInput');
  const at = parseManualTime(timeInput);
  if (at === null) {
    vscode.window.showErrorMessage(`Could not parse "${timeInput}" as a time.`);
    return;
  }

  const message = await vscode.window.showInputBox({
    prompt: 'Message to send (leave blank to use the normal continuation message)',
    placeHolder: 'e.g. Start working on the payment integration task'
  });
  if (message === undefined) return;

  if (picked.session) picked.session.isClaude = true;
  sessionManager.scheduleOnceMessage(picked.session, at, message.trim());
  vscode.window.showInformationMessage(`Scheduled a one-time message for ${picked.label} at ${at.toLocaleString()}.`);
}

async function showHistory() {
  const { recent } = require('./history');
  const events = recent(50);
  if (events.length === 0) {
    vscode.window.showInformationMessage('No activity recorded yet.');
    return;
  }

  const items = events.map(e => ({
    label: `${e.type}`,
    description: e.terminalName,
    detail: `${e.at.toLocaleString()}${e.detail ? ' — ' + e.detail : ''}`
  }));
  await vscode.window.showQuickPick(items, { placeHolder: 'Recent activity (read-only)' });
}

module.exports = { setResetTime, togglePause, selectMessageProfile, showHistory, setOneTimeMessage, scheduleOnceMessage };
