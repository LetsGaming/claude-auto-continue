// Fallback path only: scans ANSI-rendered terminal text for a usage-limit banner when the
// transcript-file watcher (src/transcriptWatcher.js) isn't attached yet for a session. See
// that module for why the transcript is the primary, more reliable detection source.

const ANSI_RE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -\/]*[@-~])/g;

const LIMIT_SIGNAL_RE = /(usage\s+limit|rate\s+limit|limit\s+(?:has\s+been\s+)?reached|you(?:'|’)ve\s+(?:hit|reached)\s+(?:your\s+)?(?:\w+\s+)?limit|out\s+of\s+usage)/i;
const DOC_NOISE_RE = /\b(e\.g\.|such as|seen in the wild|documented|example|format:|unix-timestamp|unix epoch|readme)\b/i;

function clean(text) {
  return text.replace(ANSI_RE, '').replace(/\r/g, '');
}

function isClaudeCommand(commandLine) {
  const value = (commandLine || '').toLowerCase();
  return /(^|[\\/\s])claude(?:\.cmd|\.exe)?(?:\s|$)/i.test(value) ||
    /@anthropic-ai[\\/]claude-code/.test(value) ||
    /npx(?:\.cmd)?\s+.*claude/.test(value);
}

function looksLikeLiveBannerLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Comment markers, markdown bullets/code, and quoted/example text are not live output.
  if (/^(\/\/|\/\*|#|\*|-|`|"|')/.test(trimmed)) return false;
  if (DOC_NOISE_RE.test(trimmed)) return false;
  return true;
}

function nextLocalTime(hour, minute) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

function detectLimit(text) {
  const normalized = text.replace(/\u00a0/g, ' ');
  const lines = normalized.split('\n');

  for (const line of lines) {
    if (!looksLikeLiveBannerLine(line)) continue;
    if (!LIMIT_SIGNAL_RE.test(line)) continue;

    // Pipe-delimited unix timestamp, e.g. "Claude AI usage limit reached|1760000400".
    const epochMatch = line.match(/limit\s+reached\s*\|\s*(\d{10,13})/i);
    if (epochMatch) {
      const rawNum = Number(epochMatch[1]);
      const ms = epochMatch[1].length >= 13 ? rawNum : rawNum * 1000;
      return { resetAt: new Date(ms), raw: epochMatch[0] };
    }

    // Common reset formats: "resets at 21:47", "reset at 21:47", "try again after 21:47" /
    // "after 7pm", "continuing automatically at 7:00pm" — all on the same line as the signal.
    const timePatterns = [
      /(?:resets?|reset|again|available|retry|continuing\s+automatically)[^\n]{0,80}?\b(\d{1,2})(?::(\d{2}))?\s*([ap]m)\b/i,
      /\b(\d{1,2}):(\d{2})\s*([ap]m)?\b[^\n]{0,80}?(?:reset|again|available|retry)/i
    ];

    let matchedTime = null;
    for (const re of timePatterns) {
      const m = line.match(re);
      if (m) {
        let hour = Number(m[1]);
        const minute = Number(m[2] || 0);
        if (m[3]) {
          const ap = m[3].toLowerCase();
          if (hour === 12) hour = 0;
          if (ap === 'pm') hour += 12;
        }
        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
          matchedTime = { resetAt: nextLocalTime(hour, minute), raw: m[0] };
          break;
        }
      }
    }
    if (matchedTime) return matchedTime;

    // Some messages may contain a duration such as "try again in 2 hours".
    const duration = line.match(/(?:reset|again|available|retry)[^\n]{0,80}?\bin\s+(\d+)\s*(seconds?|minutes?|hours?)/i);
    if (duration) {
      const amount = Number(duration[1]);
      const unit = duration[2].toLowerCase();
      const ms = unit.startsWith('second') ? amount * 1000 : unit.startsWith('minute') ? amount * 60000 : amount * 3600000;
      return { resetAt: new Date(Date.now() + ms), raw: duration[0] };
    }

    // Limit detected but no reset time on this line: retry periodically rather than asking the user.
    return { resetAt: null, raw: line.trim() };
  }

  return null;
}

module.exports = { clean, isClaudeCommand, detectLimit };
