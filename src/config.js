const vscode = require('vscode');

function cfg() {
  return vscode.workspace.getConfiguration('claudeAutoContinue');
}

function enabled() {
  return cfg().get('enabled', true);
}

module.exports = { cfg, enabled };
