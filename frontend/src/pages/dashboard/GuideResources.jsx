const RESOURCES = [
  { title: 'Talentino Handbook', detail: 'The official IPCS placement guide', icon: 'ph-book-open', url: 'https://drive.google.com/file/d/10IFApxJGwGwRmVFpEtfQxc1RR-IraOq7/view?pli=1', color: '#4ade80' },
  { title: 'Canva Resume Templates', detail: 'Design a modern, visual resume', icon: 'ph-palette', url: 'https://www.canva.com/en_in/login/?redirect=%2Fs%2Ftemplates%3Fquery%3Dprofessional%2Bresume', color: '#38bdf8' },
  { title: 'Resume Writing · Part 1', detail: 'Essential basics for beginners', icon: 'ph-youtube-logo', url: 'https://www.youtube.com/watch?v=ZMByWenSRdI', color: '#f87171' },
  { title: 'Resume Writing · Part 2', detail: 'Structure your skills and experience', icon: 'ph-youtube-logo', url: 'https://www.youtube.com/watch?v=VB376MMEq38', color: '#f87171' },
  { title: 'Interview Preparation', detail: 'Build confidence for interviews', icon: 'ph-youtube-logo', url: 'https://www.youtube.com/watch?v=gDN7cJ3Rt80', color: '#f87171' },
  { title: 'ATS Resume Guide', detail: 'Make your resume easier to scan', icon: 'ph-youtube-logo', url: 'https://www.youtube.com/watch?v=7JRj3r5vunU', color: '#f87171' },
  { title: 'Body Language Tips', detail: 'Improve non-verbal communication', icon: 'ph-youtube-logo', url: 'https://www.youtube.com/watch?v=EW4dEzfBst0', color: '#f87171' },
  { title: 'Group Discussion Strategy', detail: 'Prepare for group evaluations', icon: 'ph-youtube-logo', url: 'https://www.youtube.com/watch?v=k_f4Mb2ARdA', color: '#f87171' },
  { title: 'Common Resume Mistakes', detail: 'Review frequent CV errors', icon: 'ph-youtube-logo', url: 'https://www.youtube.com/watch?v=UjX_kl5UxPo', color: '#f87171' },
  { title: 'Resume.io', detail: 'Resume builder with ATS templates', icon: 'ph-file-text', url: 'https://resume.io/resume-templates', color: '#c084fc' },
  { title: 'MyPerfectResume', detail: 'Online resume creation tools', icon: 'ph-check-square', url: 'https://www.myperfectresume.com/', color: '#4ade80' },
  { title: 'Zety Resume Builder', detail: 'Create a resume from guided templates', icon: 'ph-pen-nib', url: 'https://zety.com/', color: '#f59e0b' },
  { title: 'Microsoft Word Templates', detail: 'Classic resume document templates', icon: 'ph-file-doc', url: 'https://word.cloud.microsoft/en-us/search/resume/?wdOrigin=SEO-INTENT.WD-SE-L27-1-L27-1.SEARCHTEMPLATES', color: '#3b82f6' },
];

export default function GuideResources() {
  return (
    <section className="portal-page animate-fade-in">
      <header className="portal-page-heading">
        <p className="eyebrow">Career toolkit</p>
        <h1>Guide & Resume Resources</h1>
        <p>Find IPCS placement guidance, resume tools, and interview preparation resources in one place.</p>
      </header>
      <div className="resource-grid">
        {RESOURCES.map((resource) => (
          <a className="resource-card" href={resource.url} target="_blank" rel="noopener noreferrer" key={resource.title}>
            <span className="resource-icon" style={{ color: resource.color, background: `${resource.color}1c` }}><i className={`ph-fill ${resource.icon}`}></i></span>
            <span className="resource-copy"><strong>{resource.title}</strong><small>{resource.detail}</small></span>
            <i className="ph ph-arrow-up-right resource-link-icon" aria-hidden="true"></i>
          </a>
        ))}
      </div>
      <p className="portal-note">These resources open on their providers’ websites. IPCS does not manage those external pages.</p>
    </section>
  );
}
