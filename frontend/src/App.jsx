import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Keep secondary portal pages out of the initial mobile download.
const Login = lazy(() => import('./pages/auth/Login'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const Signup = lazy(() => import('./pages/auth/Signup'));
const DashboardLayout = lazy(() => import('./components/layout/DashboardLayout'));
const DashboardHome = lazy(() => import('./pages/dashboard/DashboardHome'));
const GamePalHub = lazy(() => import('./pages/gamepal/GamePalHub'));
const IndustryFeed = lazy(() => import('./pages/dashboard/IndustryFeed'));
const StudyMaterials = lazy(() => import('./pages/dashboard/StudyMaterials'));
const JobVacancies = lazy(() => import('./pages/dashboard/JobVacancies'));
const ApplicationStatus = lazy(() => import('./pages/dashboard/ApplicationStatus'));
const TalentinoAttendance = lazy(() => import('./pages/dashboard/TalentinoAttendance'));
const StudentDiary = lazy(() => import('./pages/dashboard/StudentDiary'));
const LeaveApplications = lazy(() => import('./pages/dashboard/LeaveApplications'));
const EventsAndDrives = lazy(() => import('./pages/dashboard/EventsAndDrives'));
const AssessmentCenter = lazy(() => import('./pages/dashboard/AssessmentCenter'));
const StudentProfile = lazy(() => import('./pages/dashboard/StudentProfile'));
const GuideResources = lazy(() => import('./pages/dashboard/GuideResources'));
const Settings = lazy(() => import('./pages/dashboard/Settings'));
const HelpCenter = lazy(() => import('./pages/dashboard/HelpCenter'));

const GlobalIcons = () => {
  useEffect(() => {
    if (!document.getElementById('phosphor-icons')) {
      const script = document.createElement('script');
      script.id = 'phosphor-icons';
      script.src = 'https://unpkg.com/@phosphor-icons/web';
      document.head.appendChild(script);
    }
  }, []);
  return null;
};

export default function App() {
  return (
    <>
      <GlobalIcons />
      <BrowserRouter>
        <Suspense fallback={<div className="dashboard-loading" role="status"><i className="ph ph-spinner animate-spin" aria-hidden="true"></i> Loading portal section…</div>}>
        <Routes>
          {/* Public Auth Routes */}
          <Route path="/" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Protected Dashboard Routes */}
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardHome />} />
            <Route path="gamepal" element={<GamePalHub />} />
            <Route path="industry-feed" element={<IndustryFeed />} />
            <Route path="materials" element={<StudyMaterials />} />
            <Route path="vacancies" element={<JobVacancies />} />
            <Route path="status" element={<ApplicationStatus />} />
            <Route path="talentino" element={<TalentinoAttendance />} />
            <Route path="events" element={<EventsAndDrives />} />
            <Route path="aptitude" element={<AssessmentCenter />} />
            <Route path="profile" element={<StudentProfile />} />
            <Route path="student-diary" element={<StudentDiary />} />
            <Route path="leave" element={<LeaveApplications />} />
            <Route path="guide" element={<GuideResources />} />
            <Route path="settings" element={<Settings />} />
            <Route path="help" element={<HelpCenter />} />
            <Route path="*" element={<div className="portal-empty-state"><h2>Page not found</h2><p>Choose a section from the menu to continue.</p></div>} />
          </Route>
          <Route path="*" element={<div className="portal-empty-state"><h2>Page not found</h2><p>This portal address is not available.</p></div>} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </>
  );
}
