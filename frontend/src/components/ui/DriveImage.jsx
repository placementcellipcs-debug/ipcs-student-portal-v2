import { useState } from 'react';
import { getDriveImageCandidates } from './driveImageUtils';

export default function DriveImage({ src, alt, className, children, ...props }) {
  const candidates = getDriveImageCandidates(src);
  const [failedSource, setFailedSource] = useState({ src: '', attempt: 0 });
  const attempt = failedSource.src === src ? failedSource.attempt : 0;
  if (!candidates.length || attempt >= candidates.length) return children || null;
  return <img {...props} className={className} src={candidates[attempt]} alt={alt || ''} referrerPolicy="no-referrer" onError={() => setFailedSource((previous) => ({ src, attempt: (previous.src === src ? previous.attempt : 0) + 1 }))} />;
}
