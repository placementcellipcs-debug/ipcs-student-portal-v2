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
    return localDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  const text = String(value ?? '').trim();
  if (!text || /^(?:n\/a|undefined|null|tba|date unavailable)$/i.test(text)) return null;

  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    const [, yearText, monthText, dayText] = iso;
    const parts = localDateParts(Number(yearText), Number(monthText), Number(dayText));
    return validDateParts(parts.year, parts.month, parts.day) ? parts : null;
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

export const formatPortalDateTime = (value) => {
  if (!value) return '';
  const text = String(value).trim();
  const parts = getPortalDateParts(text, { legacyUsTimestamp: true });
  if (!parts) return text;

  const legacyTimestamp = text.match(/^\d{1,2}[-/]\d{1,2}[-/]\d{4},\s*(.+)$/);
  if (legacyTimestamp) return `${formatPortalDate(text, { legacyUsTimestamp: true })} · ${legacyTimestamp[1]}`;

  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}T/i.test(text)) {
    const instant = new Date(text);
    if (!Number.isNaN(instant.getTime())) {
      const time = new Intl.DateTimeFormat('en-GB', {
        timeZone: INDIA_TIME_ZONE,
        hour: '2-digit',
        minute: '2-digit',
      }).format(instant);
      return `${formatPortalDate(text)} · ${time}`;
    }
  }

  if (/\b\d{1,2}:\d{2}\b/.test(text)) {
    const instant = new Date(text);
    if (!Number.isNaN(instant.getTime())) {
      const time = new Intl.DateTimeFormat('en-GB', {
        timeZone: INDIA_TIME_ZONE,
        hour: '2-digit',
        minute: '2-digit',
      }).format(instant);
      return `${formatPortalDate(text)} · ${time}`;
    }
  }

  return formatPortalDate(text);
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
