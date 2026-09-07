const { nextLocalTime } = require('./textLimitDetector');

function relativeUnitMultiplier(unit) {
  return /^(m|min|mins|minute|minutes)$/i.test(unit) ? 60000 : 3600000;
}

function parseManualTime(input, now = new Date()) {
  const value = (input || '').trim();
  if (!value) return null;

  let m = value.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return nextLocalTime(hour, minute);
  }

  m = value.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (m) {
    let hour = Number(m[1]);
    const minute = Number(m[2]);
    const ap = m[3].toLowerCase();
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
    if (hour === 12) hour = 0;
    if (ap === 'pm') hour += 12;
    return nextLocalTime(hour, minute);
  }

  m = value.match(/^(\d{1,2})\s*(am|pm)$/i);
  if (m) {
    let hour = Number(m[1]);
    const ap = m[2].toLowerCase();
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
    if (ap === 'pm') hour += 12;
    return nextLocalTime(hour, 0);
  }

  m = value.match(/^\+(\d+)\s*(m|min|mins|minutes?|h|hr|hrs|hours?)$/i);
  if (m) {
    const amount = Number(m[1]);
    const multiplier = relativeUnitMultiplier(m[2]);
    return new Date(now.getTime() + amount * multiplier);
  }

  m = value.match(/^in\s+(\d+)\s*(minutes?|mins?|hours?|hrs?)$/i);
  if (m) {
    const amount = Number(m[1]);
    const multiplier = relativeUnitMultiplier(m[2]);
    return new Date(now.getTime() + amount * multiplier);
  }

  return null;
}

module.exports = { parseManualTime };
