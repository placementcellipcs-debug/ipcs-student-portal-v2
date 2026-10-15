const INDIA_TIME_ZONE = 'Asia/Kolkata';
const INDIA_OFFSET_MINUTES = 330;

const getIndiaParts = (date) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: INDIA_TIME_ZONE,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
};

const formatDateIndia = (date = new Date()) => {
    const parts = getIndiaParts(date);
    return `${parts.day}/${parts.month}/${parts.year}`;
};

const formatTimeIndia = (date = new Date()) => {
    const parts = getIndiaParts(date);
    return `${parts.hour}:${parts.minute}:${parts.second}`;
};

const formatDateTimeIndia = (date = new Date()) => `${formatDateIndia(date)} ${formatTimeIndia(date)}`;

const formatDateInputIndia = (value) => {
    const text = String(value || '').trim();
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const portal = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!iso && !portal) return '';
    const year = Number(iso ? iso[1] : portal[3]);
    const month = Number(iso ? iso[2] : portal[2]);
    const day = Number(iso ? iso[3] : portal[1]);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return '';
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
};

const parsePortalDateTime = (value) => {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? NaN : value.getTime();
    const text = String(value || '').trim();
    if (!text) return NaN;

    // ISO instants already identify their timezone and should be parsed as-is.
    if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
        const instant = Date.parse(text);
        return Number.isNaN(instant) ? NaN : instant;
    }

    const portal = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    const legacyUs = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
    const legacyEn = text.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4}),?\s+(\d{1,2}):(\d{2}):(\d{2})$/);

    let year; let month; let day; let hour; let minute; let second;
    if (portal) {
        [, day, month, year, hour, minute, second = '0'] = portal;
        day = Number(day); month = Number(month); year = Number(year);
        hour = Number(hour); minute = Number(minute); second = Number(second);
    } else if (legacyUs) {
        let meridiem;
        [, month, day, year, hour, minute, second = '0', meridiem] = legacyUs;
        day = Number(day); month = Number(month); year = Number(year);
        hour = Number(hour); minute = Number(minute); second = Number(second);
        if (meridiem.toLowerCase() === 'pm' && hour < 12) hour += 12;
        if (meridiem.toLowerCase() === 'am' && hour === 12) hour = 0;
    } else if (legacyEn) {
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        [, day, month, year, hour, minute, second] = legacyEn;
        day = Number(day); month = months.indexOf(month.toLowerCase()) + 1; year = Number(year);
        hour = Number(hour); minute = Number(minute); second = Number(second);
    } else {
        const instant = Date.parse(text);
        return Number.isNaN(instant) ? NaN : instant;
    }

    const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59
        || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return NaN;
    return check.getTime() - INDIA_OFFSET_MINUTES * 60 * 1000;
};

module.exports = { formatDateIndia, formatTimeIndia, formatDateTimeIndia, formatDateInputIndia, parsePortalDateTime };
