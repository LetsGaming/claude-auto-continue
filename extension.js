const vscode = require('vscode');
const logger = require('./src/logger');
const statusBar = require('./src/statusBar');
const sessionManager = require('./src/sessionManager');
const history = require('./src/history');
const config = require('./src/config');
const { cfg, enabled } = config;
const { isClaudeCommand, clean, detectLimit } = require('./src/textLimitDetector');
const commands = require('./src/commands');

let timer;
let scheduledRunKeys = new Set();

function activate(context) {
  const outputChannel = vscode.window.createOutputChannel('Claude Auto Continue');
  context.subscriptions.push(outputChannel);
  if (cfg().get('debug', false)) {
    outputChannel.show(true);
  }
  logger.init(outputChannel);
  history.setLimit(cfg().get('historyLimit', 200));

  statusBar.create(context);
  sessionManager.onChange(updateStatus);

  context.subscriptions.push(vscode.commands.registerCommand('claudeAutoContinue.runNow', () => sessionManager.continueAll('manual').then(updateStatus)));
  context.subscriptions.push(vscode.commands.registerCommand('claudeAutoContinue.showStatus', () => statusBar.showStatus(sessionManager.sessions)));
  context.subscriptions.push(vscode.commands.registerCommand('claudeAutoContinue.toggle', toggleEnabled));
  context.subscriptions.push(vscode.commands.registerCommand('claudeAutoContinue.openLogs', () => outputChannel.show(true)));
  context.subscriptions.push(vscode.commands.registerCommand('claudeAutoContinue.setResetTime', () => commands.setResetTime(sessionManager)));
  context.subscriptions.push(vscode.commands.registerCommand('claudeAutoContinue.togglePause', () => commands.togglePause(sessionManager)));
  context.subscriptions.push(vscode.commands.registerCommand('claudeAutoContinue.selectMessageProfile', () => commands.selectMessageProfile(sessionManager)));
  context.subscriptions.push(vscode.commands.registerCommand('claudeAutoContinue.showHistory', () => commands.showHistory()));
  context.subscriptions.push(vscode.commands.registerCommand('claudeAutoContinue.setOneTimeMessage', () => commands.setOneTimeMessage(sessionManager)));
  context.subscriptions.push(vscode.commands.registerCommand('claudeAutoContinue.scheduleOnceMessage', () => commands.scheduleOnceMessage(sessionManager)));

  context.subscriptions.push(vscode.window.onDidStartTerminalShellExecution(event => monitorExecution(event).catch(err => logger.logError(err))));
  context.subscriptions.push(vscode.window.onDidCloseTerminal(terminal => {
    const session = sessionManager.sessions.get(terminal);
    if (session?.retryTimer) clearTimeout(session.retryTimer);
    if (session) sessionManager.detachTranscriptWatcher(session);
    sessionManager.sessions.delete(terminal);
  }));
  context.subscriptions.push(vscode.window.onDidChangeTerminalShellIntegration(({ terminal, shellIntegration }) => {
    // Shell integration (and its cwd) can become available slightly after we first notice a
    // Claude session, so (re-)attach the transcript watcher once we learn the cwd.
    const session = sessionManager.sessions.get(terminal);
    const cwd = shellIntegration?.cwd?.fsPath;
    if (session?.isClaude && cwd && !session.transcript) {
      sessionManager.attachTranscriptWatcher(session, cwd);
    }
    updateStatus();
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('claudeAutoContinue')) {
      history.setLimit(cfg().get('historyLimit', 200));
      updateStatus();
    }
  }));

  timer = setInterval(() => {
    checkScheduledTime().catch(err => logger.logError(err));
    updateStatus();
  }, 1000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });

  updateStatus();
  logger.log(`activate: extensionHostPid=${process.pid}`);
  logger.log('activated');
  sessionManager.logStartupState().then(updateStatus).catch(err => logger.logError(err));
}

function deactivate() {
  if (timer) clearInterval(timer);
  sessionManager.disposeAll();
}

function updateStatus() {
  statusBar.update(sessionManager.sessions);
}

async function toggleEnabled() {
  await cfg().update('enabled', !enabled(), vscode.ConfigurationTarget.Global);
  updateStatus();
}

async function checkScheduledTime() {
  if (!enabled() || !cfg().get('scheduledContinueEnabled', false)) return;
  const times = config.scheduledTimes();
  const now = new Date();
  const { dueTimes } = require('./src/scheduler');
  const due = dueTimes(now, times, scheduledRunKeys);
  for (const t of due) {
    const key = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}|${t}`;
    scheduledRunKeys.add(key);
    logger.log(`Scheduled continuation triggered for ${t}`);
    require('./src/history').record(require('./src/history').EVENTS.SCHEDULED_RUN, '*', t);
    await sessionManager.continueAll('scheduled');
    updateStatus();
  }
  // prune keys not from today, to prevent unbounded growth:
  const todayPrefix = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}|`;
  for (const k of scheduledRunKeys) {
    if (!k.startsWith(todayPrefix)) scheduledRunKeys.delete(k);
  }
}

async function monitorExecution(event) {
  const terminal = event.terminal;
  const execution = event.execution;
  const command = execution.commandLine?.value || '';
  logger.log(`monitor: shell execution started terminal=${terminal.name} command=${JSON.stringify(command)} shellIntegration=${Boolean(event.shellIntegration)}`);
  if (!isClaudeCommand(command)) {
    if (cfg().get('debug', false)) logger.log(`monitor: ignored non-Claude command in ${terminal.name}`);
    return;
  }

  const session = sessionManager.sessionFor(terminal);
  session.isClaude = true;
  session.execution = execution;
  sessionManager.attachTranscriptWatcher(session, event.shellIntegration?.cwd?.fsPath || sessionManager.workspaceCwdGuess());
  session.outputBuffer = '';
  session.chunkCount = 0;
  if (session.noChunkTimer) clearTimeout(session.noChunkTimer);
  logger.log(`Monitoring Claude session: ${terminal.name}`);

  session.noChunkTimer = setTimeout(() => {
    if ((session.chunkCount || 0) === 0) {
      logger.log(`monitor: no output chunks received yet for ${terminal.name} after 3000ms`);
    }
  }, 3000);

  // The VS Code API exposes the raw output stream for a terminal shell execution.
  // This must be read immediately after execution starts to avoid missing output.
  try {
    logger.log(`monitor: attaching to execution.read() for ${terminal.name}`);
    for await (const chunk of execution.read()) {
      session.chunkCount += 1;
      if (!enabled() || !cfg().get('detectLimits', true)) continue;
      const text = clean(String(chunk));
      session.outputBuffer = (session.outputBuffer + text).slice(-16000);
      if (session.chunkCount === 1 && session.noChunkTimer) {
        clearTimeout(session.noChunkTimer);
        session.noChunkTimer = null;
      }
      if (cfg().get('debug', false)) {
        const preview = text.replace(/\r/g, '\\r').replace(/\n/g, '\\n').slice(0, 200);
        logger.log(`monitor: chunk#${session.chunkCount} terminal=${terminal.name} len=${text.length} preview=${JSON.stringify(preview)}`);
      }

      // While a limit is already armed with a known future reset time, or we're in the
      // brief post-send cooldown, skip re-scanning: repeated screen redraws of the same
      // still-visible banner (or a stale redraw right after sending) must not reset or
      // re-trigger the wait, otherwise the continuation gets sent early and repeatedly.
      if (Date.now() < (session.cooldownUntil || 0)) continue;
      if (session.limit && session.resetAt && Date.now() < session.resetAt.getTime()) continue;

      // The transcript-file watcher (see src/transcriptWatcher.js) gives an exact reset
      // timestamp straight from Claude Code's own JSONL log and is the primary detection
      // path. Text scanning here only runs as a fallback while that watcher isn't attached
      // (e.g. the project directory hasn't shown up on disk yet, or its cwd is unknown).
      if (session.transcript?.watching) continue;

      const limit = detectLimit(session.outputBuffer);
      if (limit) {
        await sessionManager.handleLimit(session, limit);
      } else if (cfg().get('debug', false)) {
        logger.log(`monitor: chunk#${session.chunkCount} terminal=${terminal.name} did not match a limit yet`);
      }
    }
  } catch (error) {
    logger.log(`Output stream ended for ${terminal.name}: ${error.message || error}`);
  } finally {
    if (session.noChunkTimer) {
      clearTimeout(session.noChunkTimer);
      session.noChunkTimer = null;
    }
  }
}

module.exports = { activate, deactivate };
