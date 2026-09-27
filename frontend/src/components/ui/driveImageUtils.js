export const getDriveImageCandidates = (source) => {
  const value = String(source || '').trim();
  if (!value || value === 'N/A') return [];
  if (/^(data:image\/|blob:)/i.test(value)) return [value];
  const match = value.match(/(?:[?&]id=|\/d\/)([\w-]+)/i);
  const looksLikeId = /^[\w-]{20,}$/.test(value);
  const id = match?.[1] || (looksLikeId ? value : '');
  if (!id) return [value];
  return [
    `https://drive.google.com/thumbnail?id=${id}&sz=w1000`,
    `https://lh3.googleusercontent.com/d/${id}=w1000`,
    `https://drive.google.com/uc?export=view&id=${id}`,
    `https://drive.usercontent.google.com/download?id=${id}&export=view&authuser=0`,
    value,
  ].filter((url, index, items) => items.indexOf(url) === index);
};
