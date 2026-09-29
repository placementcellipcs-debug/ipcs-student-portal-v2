export const getDriveImageCandidates = (source) => {
  const value = String(source || '').trim().replace(/&amp;/gi, '&');
  if (!value || value === 'N/A') return [];
  if (/^(data:image\/|blob:)/i.test(value)) return [value];
  let cacheVersion = '';
  try {
    cacheVersion = new URL(value, window.location.origin).searchParams.get('v') || '';
  } catch {
    cacheVersion = '';
  }
  const withCacheVersion = (url) => {
    if (!cacheVersion) return url;
    try {
      if (new URL(url, window.location.origin).searchParams.has('v')) return url;
    } catch {
      // Keep the fallback URL usable even when it is not a valid absolute URL.
    }
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${encodeURIComponent(cacheVersion)}`;
  };
  let id = '';
  try {
    const parsed = new URL(value, window.location.origin);
    if (/drive\.google\.com$|drive\.usercontent\.google\.com$/i.test(parsed.hostname)) {
      id = parsed.searchParams.get('id') || '';
      if (!id) id = parsed.pathname.match(/\/d\/([\w-]+)/i)?.[1] || '';
    }
  } catch {
    // The fallback patterns below also support IDs pasted without a full URL.
  }
  const isDriveUrl = /(?:drive\.google\.com|drive\.usercontent\.google\.com|googleusercontent\.com)/i.test(value);
  const match = isDriveUrl ? value.match(/(?:[?&]id=|\/d\/)([\w-]+)/i) : null;
  const looksLikeId = /^[\w-]{20,}$/.test(value);
  id ||= match?.[1] || (looksLikeId ? value : '');
  if (!id) return [value];
  return [
    `https://lh3.googleusercontent.com/d/${id}=w1000`,
    `https://drive.google.com/uc?export=view&id=${id}`,
    `https://drive.google.com/thumbnail?id=${id}&sz=w1000`,
    `https://drive.usercontent.google.com/download?id=${id}&export=view&authuser=0`,
  ].map(withCacheVersion).filter((url, index, items) => items.indexOf(url) === index);
};
