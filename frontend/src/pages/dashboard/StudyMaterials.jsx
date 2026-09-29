import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../config/axios';
import ModalPortal from '../../components/ui/ModalPortal';

export default function StudyMaterials() {
  const { user } = useOutletContext();
  const [materials, setMaterials] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Modal States
  const [materialModal, setMaterialModal] = useState(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  useEffect(() => {
    if (!user?.email) return undefined;

    let cancelled = false;
    api.post('/api/dashboard/study-materials', {})
      .then((res) => {
        if (cancelled) return;
        if (res.data.success) {
          setMaterials(res.data.materials || []);
          setStatus(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus({
            type: 'error',
            message: error.response?.data?.message || 'Access restricted or server error.'
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [user?.email]);

  const handleViewMaterial = async (mat) => {
    if (!user || !user.email) return;
    setMaterialModal(mat);
    setIsPdfLoading(true);
    setPdfBlobUrl(null);
    
    try {
        const res = await api.post('/api/dashboard/study-materials/stream', { materialId: mat.id });
        
        if (res.data.success && res.data.embedUrl) {
            setPdfBlobUrl(res.data.embedUrl);
            setIsPdfLoading(false);
        } else {
            throw new Error(res.data.message || "Failed to load secure link.");
        }
    } catch (err) {
        console.error('Failed to load study material:', err);
        setIsPdfLoading(false);
        setMaterialModal({ ...mat, error: 'Failed to load document securely.' });
    }
  };

  const closeMaterialModal = () => {
    setMaterialModal(null);
    setPdfBlobUrl(null);
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ margin: '0 0 5px 0', fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)' }}>Study Material</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '1rem', margin: 0 }}>Secure, in-app presentations and notes tailored for your course.</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--accent-cyan)' }}>
          <i className="ph ph-spinner animate-spin" style={{ fontSize: '3rem' }}></i>
        </div>
      ) : status && status.type === 'error' ? (
        <div className="alert alert-error" style={{ padding: '2rem', textAlign: 'center', maxWidth: '600px', margin: '2rem auto', borderRadius: '16px' }}>
          <i className="ph-fill ph-lock-key" style={{ fontSize: '3rem', display: 'block', margin: '0 auto 15px auto', color: '#ef4444' }}></i>
          <h3 style={{ margin: '0 0 10px 0' }}>Access Denied</h3>
          {status.message}
        </div>
      ) : materials.length === 0 && !status ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--card-bg)', border: '1px dashed var(--input-border)', borderRadius: '20px' }}>
          <i className="ph-fill ph-books" style={{ fontSize: '3rem', color: 'var(--text-muted)', marginBottom: '15px' }}></i>
          <div style={{ fontSize: '1.1rem', color: 'var(--text-muted)', fontWeight: 600 }}>No study materials uploaded for your course yet.</div>
        </div>
      ) : (
        <div className="resume-grid">
          {materials.map((mat) => {
            const isPdf = mat.fileType.toLowerCase().includes('pdf');
            return (
              <button type="button" key={mat.id} className="resume-card material-card" onClick={() => handleViewMaterial(mat)}>
                <div className="resume-icon-box" style={{ background: isPdf ? 'rgba(239, 68, 68, 0.15)' : 'rgba(56, 189, 248, 0.15)', color: isPdf ? '#ef4444' : '#38bdf8' }}>
                  <i className={`ph-fill ${isPdf ? 'ph-file-pdf' : 'ph-presentation'}`}></i>
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '1px' }}>
                    {mat.topic}
                  </div>
                  <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {mat.title}
                  </h3>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>
                    Format: {mat.fileType}
                  </span>
                </div>
                <span className="btn-action" style={{ padding: '0.6rem 1.2rem', fontSize: '0.85rem', borderRadius: '8px' }}>View</span>
              </button>
            );
          })}
        </div>
      )}

      {/* SECURE MATERIAL VIEWER MODAL */}
      {materialModal && (
        <ModalPortal>
        <div className="report-modal-overlay">
          <div 
            className="material-viewer-card"
            onContextMenu={(e) => e.preventDefault()}
            style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
          >
            {/* Modal Header */}
            <div style={{ padding: '16px 24px', background: 'var(--card-bg)', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ overflow: 'hidden', paddingRight: '20px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>
                  {materialModal.topic}
                </div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {materialModal.title}
                </h3>
              </div>
              <button className="btn-cancel" style={{ padding: '0.5rem', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={closeMaterialModal}>
                <i className="ph-bold ph-x" style={{ fontSize: '1.2rem' }}></i>
              </button>
            </div>

            {/* Modal Body / Iframe */}
            <div className="material-iframe-container">
              {isPdfLoading && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', color: 'var(--accent-cyan)', zIndex: 20 }}>
                  <i className="ph ph-spinner animate-spin" style={{ fontSize: '3rem', marginBottom: '15px' }}></i>
                  <div style={{ fontWeight: 700, letterSpacing: '1px' }}>Establishing Secure Connection...</div>
                </div>
              )}

              {materialModal.error && (
                <div className="alert alert-error" style={{ margin: '20px', position: 'relative', zIndex: 20, padding: '1.5rem', borderRadius: '12px' }}>
                  <i className="ph-fill ph-warning-circle" style={{ fontSize: '2rem', display: 'block', marginBottom: '10px' }}></i>
                  {materialModal.error}
                </div>
              )}

              {pdfBlobUrl && !isPdfLoading && (
                <iframe
                  src={pdfBlobUrl}
                  title={materialModal.title}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none', zIndex: 1, backgroundColor: '#ffffff' }}
                  allowFullScreen={true}
                ></iframe>
              )}
            </div>
          </div>
        </div>
        </ModalPortal>
      )} 
    </div>
  );
}
