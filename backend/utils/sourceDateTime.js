const asText = value => String(value ?? '').normalize('NFKC').trim();

function validTime(hourText, minuteText, secondText, meridiemText) {
  let hour = Number(hourText || 0);
  const minute = Number(minuteText || 0);
  const second = Number(secondText || 0);
  const meridiem = String(meridiemText || '').toLowerCase();
  if (minute > 59 || second > 59 || hour > (meridiem ? 12 : 23) || (meridiem && hour === 0)) return null;
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function parseSourceDateTime(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }

  const raw = asText(value);
  if (!raw) return null;
  let match = raw.match(/^([0-9]{4})[-/.]([0-9]{1,2})[-/.]([0-9]{1,2})(?:[, T]+([0-9]{1,2}):([0-9]{2})(?::([0-9]{2}))?\s*(AM|PM)?)?/i);
  let year;
  let month;
  let day;
  let time;
  if (match) {
    [, year, month, day] = match;
    time = validTime(match[4], match[5], match[6], match[7]);
  } else {
    match = raw.match(/^([0-9]{1,2})[-/.]([0-9]{1,2})[-/.]([0-9]{4})(?:[, T]+([0-9]{1,2}):([0-9]{2})(?::([0-9]{2}))?\s*(AM|PM)?)?/i);
    if (!match) return null;
    // Workbook dates use the IPCS India locale: DD/MM/YYYY.
    [, day, month, year] = match;
    time = validTime(match[4], match[5], match[6], match[7]);
  }
  if (!time) return null;

  const parts = [Number(year), Number(month), Number(day)];
  const check = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (check.getUTCFullYear() !== parts[0] || check.getUTCMonth() !== parts[1] - 1 || check.getUTCDate() !== parts[2]) return null;
  return `${String(parts[0]).padStart(4, '0')}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')} ${time}`;
}

module.exports = { parseSourceDateTime };
