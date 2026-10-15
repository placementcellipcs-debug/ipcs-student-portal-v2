const INDIA_TIME_ZONE = 'Asia/Kolkata';
const INDIA_OFFSET_MINUTES = 330;

const validDateParts = (year, month, day) => (
  Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)
  && month >= 1 && month <= 12 && day >= 1 && day <= new Date(year, month, 0).getDate()
);

const localDateParts = (year, month, day) => ({ year, month, day });

const partsInIndia = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: INDIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return localDateParts(Number(values.year), Number(values.month), Number(values.day));
};

const getPortalDateParts = (value, { legacyUsTimestamp = false } = {}) => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return partsInIndia(value);
  }

  const text = String(value ?? '').trim();
  if (!text || /^(?:n\/a|undefined|null|tba|date unavailable)$/i.test(text)) return null;

  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    const [, yearText, monthText, dayText] = iso;
    const parts = localDateParts(Number(yearText), Number(monthText), Number(dayText));
    return validDateParts(parts.year, parts.month, parts.day) ? parts : null;
  }

  if (/^\d{4}-\d{2}-\d{2}T/i.test(text)) {
    const instant = new Date(text);
    return Number.isNaN(instant.getTime()) ? null : partsInIndia(instant);
  }

  const numeric = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(.*)$/);
  if (numeric) {
    const [, firstText, secondText, yearText, suffix] = numeric;
    const first = Number(firstText);
    const second = Number(secondText);
    const legacyUs = legacyUsTimestamp && /,\s*\d{1,2}:\d{2}/.test(suffix);
    const month = legacyUs || (first <= 12 && second > 12) ? first : second;
    const day = legacyUs || (first <= 12 && second > 12) ? second : first;
    const parts = localDateParts(Number(yearText), month, day);
    return validDateParts(parts.year, parts.month, parts.day) ? parts : null;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : partsInIndia(parsed);
};

const pad = (value) => String(value).padStart(2, '0');

export const parsePortalDate = (value) => {
  const parts = getPortalDateParts(value);
  return parts ? new Date(parts.year, parts.month - 1, parts.day, 12) : null;
};

export const portalDateInputValue = (value) => {
  const parts = getPortalDateParts(value);
  return parts ? `${parts.year}-${pad(parts.month)}-${pad(parts.day)}` : '';
};

export const formatPortalDate = (value, { legacyUsTimestamp = false } = {}) => {
  const parts = getPortalDateParts(value, { legacyUsTimestamp });
  if (!parts) return '';
  return `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`;
};

const getClockParts = (value) => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: INDIA_TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(value);
    const result = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return { hour: Number(result.hour), minute: Number(result.minute), second: Number(result.second) };
  }
  const text = String(value ?? '').trim();
  if (!text) return null;

  const clock = text.match(/(?:^|[,\sT])(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?(?:\s*(?:Z|[+-]\d{2}:?\d{2}))?$/i);
  if (clock) {
    let hour = Number(clock[1]);
    const minute = Number(clock[2]);
    const second = Number(clock[3] || 0);
    const meridiem = String(clock[4] || '').toLowerCase();
    if (minute > 59 || second > 59 || hour > (meridiem ? 12 : 23) || (meridiem && hour === 0)) return null;
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return { hour, minute, second };
  }
  return null;
};

const formatClockParts = (parts) => parts
  ? `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`
  : '';

export const formatPortalTime = (value) => {
  if (value instanceof Date) return formatClockParts(getClockParts(value));
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}T/i.test(text)) {
    const instant = new Date(text);
    return Number.isNaN(instant.getTime()) ? '' : formatClockParts(getClockParts(instant));
  }
  const direct = getClockParts(text);
  if (direct) return formatClockParts(direct);

  const legacyMedium = text.match(/^\d{1,2}\s+[A-Za-z]{3}\s+\d{4},?\s+(.+)$/);
  if (legacyMedium) return formatClockParts(getClockParts(legacyMedium[1]));
  return '';
};

export const parsePortalDateTime = (value) => {
  if (!value) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}T/i.test(text)) {
    const instant = new Date(text);
    return Number.isNaN(instant.getTime()) ? null : instant;
  }

  const legacyMedium = text.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4}),?\s+(\d{1,2}:\d{2}:\d{2})$/);
  if (legacyMedium) {
    const monthNumber = new Date(`${legacyMedium[2]} 1, 2000`).getMonth() + 1;
    const dateText = `${legacyMedium[1]}/${monthNumber}/${legacyMedium[3]}`;
    return parsePortalDateTime(`${dateText} ${legacyMedium[4]}`);
  }

  const timestamp = text.match(/^(\d{1,2}[-/]\d{1,2}[-/]\d{4})(,?\s+)(.+)$/);
  if (timestamp) {
    const legacyUsTimestamp = timestamp[2].startsWith(',') && Number(timestamp[1]) <= 12;
    const dateParts = getPortalDateParts(`${timestamp[1]}${timestamp[2]}`, { legacyUsTimestamp });
    const timeParts = getClockParts(timestamp[3]);
    if (!dateParts || !timeParts) return null;
    const instant = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, timeParts.hour, timeParts.minute, timeParts.second)
      - INDIA_OFFSET_MINUTES * 60 * 1000);
    return Number.isNaN(instant.getTime()) ? null : instant;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatPortalDateTime = (value) => {
  if (!value) return '';
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return formatPortalDate(text);
  const instant = parsePortalDateTime(value);
  if (instant instanceof Date) {
    return `${formatPortalDate(instant)} ${formatPortalTime(instant)}`;
  }
  const dateOnly = formatPortalDate(text);
  if (dateOnly && !getClockParts(text)) return dateOnly;
  return '';
};

const parseEventTime = (value) => {
  const text = String(value ?? '').trim();
  if (!text || /^(?:tba|n\/a|to be announced)$/i.test(text)) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  const meridiem = (match[4] || '').toLowerCase();
  if (minute > 59 || second > 59 || hour > (meridiem ? 12 : 23) || (meridiem && hour === 0)) return null;
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return { hour, minute, second };
};

export const getEventEndInstant = (dateValue, timeValue) => {
  const parts = getPortalDateParts(dateValue);
  if (!parts) return null;
  const time = parseEventTime(timeValue) || { hour: 23, minute: 59, second: 59 };
  const milliseconds = parseEventTime(timeValue) ? 0 : 999;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, time.hour, time.minute, time.second, milliseconds)
    - INDIA_OFFSET_MINUTES * 60 * 1000);
};

export const isEventPast = (dateValue, timeValue, now = new Date()) => {
  const eventEnd = getEventEndInstant(dateValue, timeValue);
  return Boolean(eventEnd && now.getTime() > eventEnd.getTime());
};
