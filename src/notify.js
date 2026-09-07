const vscode = require('vscode');
const { cfg } = require('./config');

function limitDetected(session, resetAt) {
  if (!cfg().get('notifyOnLimitDetected', true)) return;
  const message = resetAt instanceof Date && !isNaN(resetAt.getTime())
    ? `Claude limit detected in "${session.terminal.name}" — continuing at ${resetAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : `Claude limit detected in "${session.terminal.name}"`;
  vscode.window.showInformationMessage(message, 'Change Reset Time…', 'Pause This Terminal').then((choice) => {
    if (choice === 'Change Reset Time…') {
      vscode.commands.executeCommand('claudeAutoContinue.setResetTime', session.terminal);
    } else if (choice === 'Pause This Terminal') {
      vscode.commands.executeCommand('claudeAutoContinue.togglePause', session.terminal);
    }
  });
}

function continueSent(session, reason) {
  if (!cfg().get('notifyOnSend', true)) return;
  vscode.window.showInformationMessage(`Continued "${session.terminal.name}"${reason ? ` (${reason})` : ''}`);
}

function sendFailed(session, error) {
  vscode.window.showWarningMessage(`Failed to continue "${session.terminal.name}": ${error?.message || error}`, 'Continue Now').then((choice) => {
    if (choice === 'Continue Now') {
      vscode.commands.executeCommand('claudeAutoContinue.runNow');
    }
  });
}

function retriesExhausted(session) {
  vscode.window.showWarningMessage(`Gave up retrying "${session.terminal.name}" after repeated attempts.`, 'Continue Now').then((choice) => {
    if (choice === 'Continue Now') {
      vscode.commands.executeCommand('claudeAutoContinue.runNow');
    }
  });
}

module.exports = { limitDetected, continueSent, sendFailed, retriesExhausted };
