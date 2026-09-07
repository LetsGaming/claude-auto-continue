const { nextLocalTime } = require('./textLimitDetector');

const HHMM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function normalize(value) {
  const m = HHMM_RE.exec(value);
  if (!m) return null;
  const hour = m[1].padStart(2, '0');
  return `${hour}:${m[2]}`;
}

function normalizeTimes(times, legacySingle) {
  const source = Array.isArray(times) ? times : [];
  const valid = new Set();
  for (const t of source) {
    const normalized = normalize(t);
    if (normalized) valid.add(normalized);
  }
  const result = Array.from(valid).sort();
  if (result.length > 0) return result;

  const legacy = normalize(legacySingle);
  return legacy ? [legacy] : [];
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dueTimes(now, times, alreadyRan) {
  const nowKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const nowHHmm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  return times.filter((t) => t === nowHHmm && !alreadyRan.has(`${nowKey}|${t}`));
}

function nextOccurrence(now, times) {
  if (!times || times.length === 0) return null;
  let earliest = null;
  for (const t of times) {
    const [hour, minute] = t.split(':').map(Number);
    const candidate = nextLocalTime(hour, minute);
    if (earliest === null || candidate.getTime() < earliest.getTime()) earliest = candidate;
  }
  return earliest;
}

module.exports = { normalizeTimes, dueTimes, nextOccurrence };
