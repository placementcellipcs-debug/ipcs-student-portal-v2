import { useState } from 'react';
import { getDriveImageCandidates } from './driveImageUtils';

export default function DriveImage({ src, alt, className, children, ...props }) {
  const candidates = getDriveImageCandidates(src);
  const [failedSource, setFailedSource] = useState({ src: '', attempt: 0 });
  const attempt = failedSource.src === src ? failedSource.attempt : 0;
  if (!candidates.length || attempt >= candidates.length) return children || null;
  const nextCandidate = () => setFailedSource((previous) => ({ src, attempt: (previous.src === src ? previous.attempt : 0) + 1 }));
  return <img
    {...props}
    className={className}
    src={candidates[attempt]}
    alt={alt || ''}
    referrerPolicy="no-referrer"
    onLoad={(event) => {
      // Drive sometimes returns a tiny placeholder image with a successful HTTP response.
      if (event.currentTarget.naturalWidth < 16 || event.currentTarget.naturalHeight < 16) nextCandidate();
    }}
    onError={nextCandidate}
  />;
}
