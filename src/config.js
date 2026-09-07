const vscode = require('vscode');

const DEFAULT_MESSAGE = 'Continue working on the current task. Do not ask me for confirmation, clarification, or additional user input. You have permission to continue autonomously. Review the current state and proceed with the remaining work.';

function cfg() {
  return vscode.workspace.getConfiguration('claudeAutoContinue');
}

function enabled() {
  return cfg().get('enabled', true);
}

function lookupProfile(name) {
  if (!name) return '';
  const profiles = cfg().get('messageProfiles', {});
  const value = profiles[name];
  return value ? value : '';
}

function resolveMessage(session) {
  if (session && session.messageProfile) {
    const fromSession = lookupProfile(session.messageProfile);
    if (fromSession) return fromSession;
  }

  const defaultProfile = cfg().get('messageProfile', '');
  if (defaultProfile) {
    const fromDefault = lookupProfile(defaultProfile);
    if (fromDefault) return fromDefault;
  }

  const configured = cfg().get('message', DEFAULT_MESSAGE);
  if (configured) return configured;

  return DEFAULT_MESSAGE;
}

function profileNames() {
  return Object.keys(cfg().get('messageProfiles', {}));
}

function scheduledTimes() {
  return require('./scheduler').normalizeTimes(cfg().get('scheduledTimes', []), cfg().get('scheduledTime', '19:30'));
}

module.exports = { cfg, enabled, resolveMessage, profileNames, scheduledTimes, DEFAULT_MESSAGE };
