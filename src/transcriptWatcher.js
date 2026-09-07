const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger');

// Claude Code writes a live JSONL transcript per session to
// ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl regardless of how (or whether) the
// integrated terminal's shell-integration output stream is attached. A rate-limit hit shows
// up there as a structured entry with an exact reset timestamp, which is far more reliable
// than scraping ANSI-rendered terminal text for a phrase like "resets at 6:30pm" — and it
// works even for sessions that were already running before this extension activated.

const watchers = new Map(); // projectDir -> { refCount, watcher, retryTimer, fileOffsets, listeners }

function encodeProjectDir(cwd) {
  return cwd.replace(/[:\\/.]/g, '-');
}

function transcriptDirFor(cwd) {
  return path.join(os.homedir(), '.claude', 'projects', encodeProjectDir(cwd));
}

function initFileOffsets(dir, fileOffsets) {
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.jsonl')) continue;
      const full = path.join(dir, name);
      // Skip past any history that already existed before we started watching — only new
      // rate-limit hits appended from this point on should trigger a continuation.
      const size = fs.statSync(full).size;
      fileOffsets.set(full, { offset: size, partial: '' });
    }
  } catch {
    // Directory doesn't exist yet; the caller retries later once Claude creates it.
  }
}

function readFileRange(file, start, end) {
  return new Promise((resolve, reject) => {
    let data = '';
    const stream = fs.createReadStream(file, { start, end: Math.max(start, end - 1), encoding: 'utf8' });
    stream.on('data', chunk => { data += chunk; });
    stream.on('end', () => resolve(data));
    stream.on('error', reject);
  });
}

function parseRateLimitLine(line) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }

  // isApiErrorMessage / error / quotaLimits sit on the transcript entry itself; only the
  // assistant's rendered text is nested under entry.message.content.
  if (!entry.isApiErrorMessage || entry.error !== 'rate_limit') return null;
  const resetsAtSec = entry.quotaLimits?.resetsAt;
  if (!resetsAtSec) return null;

  const resetAt = new Date(resetsAtSec * 1000);
  const content = entry.message?.content;
  const text = Array.isArray(content) ? content.map(c => c.text || '').join(' ').trim() : '';
  return { resetAt, text };
}

async function scanDir(dir, entry) {
  let names;
  try {
    names = fs.readdirSync(dir).filter(n => n.endsWith('.jsonl'));
  } catch {
    return;
  }

  for (const name of names) {
    const full = path.join(dir, name);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }

    let state = entry.fileOffsets.get(full);
    if (!state) {
      // A brand-new session file created after we started watching: read it from the start.
      state = { offset: 0, partial: '' };
      entry.fileOffsets.set(full, state);
    }
    if (stat.size <= state.offset) continue;

    let chunk;
    try {
      chunk = await readFileRange(full, state.offset, stat.size);
    } catch (err) {
      logger.logError(err);
      continue;
    }
    state.offset = stat.size;

    const combined = state.partial + chunk;
    const lines = combined.split('\n');
    state.partial = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      const hit = parseRateLimitLine(line);
      if (!hit) continue;
      logger.log(`transcript: rate_limit detected dir=${dir} resetAt=${hit.resetAt.toISOString()} text=${JSON.stringify(hit.text)}`);
      for (const listener of entry.listeners) listener(hit);
    }
  }
}

/**
 * Watch the transcript directory for `cwd` and invoke `onRateLimit({ resetAt, text })` for
 * each rate-limit entry appended after this call. Multiple sessions sharing the same project
 * directory each get their own listener, so a single limit hit naturally reaches all of them.
 * Returns a handle with a live `watching` flag (true once the directory exists and is being
 * watched) and an `unwatch()` to release it, or null if `cwd` is unknown.
 */
function watch(cwd, onRateLimit) {
  if (!cwd) return null;
  const dir = transcriptDirFor(cwd);

  let entry = watchers.get(dir);
  if (!entry) {
    entry = { refCount: 0, watcher: null, retryTimer: null, fileOffsets: new Map(), listeners: new Set() };
    watchers.set(dir, entry);
  }
  entry.refCount += 1;
  entry.listeners.add(onRateLimit);

  const attach = () => {
    initFileOffsets(dir, entry.fileOffsets);
    try {
      entry.watcher = fs.watch(dir, { persistent: false }, () => {
        scanDir(dir, entry).catch(err => logger.logError(err));
      });
      logger.log(`transcript: watching ${dir}`);
      return true;
    } catch (err) {
      logger.log(`transcript: directory not available yet for ${dir} (${err.message})`);
      return false;
    }
  };

  if (!entry.watcher && !entry.retryTimer && !attach()) {
    entry.retryTimer = setInterval(() => {
      if (attach() && entry.retryTimer) {
        clearInterval(entry.retryTimer);
        entry.retryTimer = null;
      }
    }, 5000);
  }

  return {
    dir,
    get watching() {
      return Boolean(entry.watcher);
    },
    unwatch() {
      entry.listeners.delete(onRateLimit);
      entry.refCount -= 1;
      if (entry.refCount <= 0) {
        if (entry.watcher) entry.watcher.close();
        if (entry.retryTimer) clearInterval(entry.retryTimer);
        watchers.delete(dir);
        logger.log(`transcript: stopped watching ${dir}`);
      }
    }
  };
}

function disposeAll() {
  for (const entry of watchers.values()) {
    if (entry.watcher) entry.watcher.close();
    if (entry.retryTimer) clearInterval(entry.retryTimer);
  }
  watchers.clear();
}

module.exports = { transcriptDirFor, watch, disposeAll };
