let outputChannel = null;

function init(channel) {
  outputChannel = channel;
}

function formatLogValue(value) {
  if (value instanceof Error) {
    return value.stack ? value.stack : `${value.name}: ${value.message}`;
  }
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function log(...args) {
  const line = `[Claude Auto Continue] ${args.map(formatLogValue).join(' ')}`;
  if (outputChannel) outputChannel.appendLine(line);
  console.log(line);
}

function logError(err) {
  const line = `[Claude Auto Continue] ERROR: ${formatLogValue(err)}`;
  if (outputChannel) outputChannel.appendLine(line);
  console.error(line);
}

module.exports = { init, log, logError };
