import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { InternalLayout } from './layouts/InternalLayout';
import { ClientPortalLayout } from './layouts/ClientPortalLayout';
import { Login } from './pages/auth/Login';
import { AcceptInvite } from './pages/auth/AcceptInvite';
import { InternalDashboard } from './pages/dashboard/InternalDashboard';
import { ProjectList } from './pages/projects/ProjectList';
import { ProjectWorkspace } from './pages/projects/ProjectWorkspace';
import { QaWorkspace } from './pages/qa/QaWorkspace';
import { InvoiceList } from './pages/finance/InvoiceList';
import { ReportsDashboard } from './pages/reports/ReportsDashboard';
import { TeamManagement } from './pages/admin/TeamManagement';
import { AuditLogs } from './pages/admin/AuditLogs';
import { ProjectRequests } from './pages/admin/ProjectRequests';
import { BDLeads } from './pages/bd/BDLeads';
import { ClientProjects } from './pages/client/ClientProjects';
import { ClientDashboard } from './pages/client/ClientDashboard';
import { ClientProjectDetail } from './pages/client/ClientProjectDetail';
import { ClientRequirementDetail } from './pages/client/ClientRequirementDetail';
import { ClientInvoices } from './pages/client/ClientInvoices';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { UserRole } from '@deliveryos/shared';

const queryClient = new QueryClient();

// Protected Route Component
const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}> = ({ children, allowedRoles }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner size="lg" className="h-screen" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // If client tries to access internal layout, redirect to portal
    if (user.role === UserRole.CLIENT) {
      return <Navigate to="/portal/dashboard" replace />;
    }
    return <Navigate to="/app/dashboard" replace />;
  }

  return <>{children}</>;
};

// Root Redirect Handler based on Role
const RootRedirect: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner size="lg" className="h-screen" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === UserRole.CLIENT) {
    return <Navigate to="/portal/dashboard" replace />;
  }

  return <Navigate to="/app/dashboard" replace />;
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              {/* Root & Auth */}
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<Login />} />
              <Route path="/accept-invite" element={<AcceptInvite />} />

              {/* Internal Staff App */}
              <Route
                path="/app"
                element={
                  <ProtectedRoute
                    allowedRoles={[
                      UserRole.SUPER_ADMIN,
                      UserRole.ADMIN,
                      UserRole.BD,
                      UserRole.PROJECT_MANAGER,
                      UserRole.DEVELOPER,
                      UserRole.QA,
                    ]}
                  >
                    <InternalLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/app/dashboard" replace />} />
                <Route path="dashboard" element={<InternalDashboard />} />
                <Route path="projects" element={<ProjectList />} />
                <Route path="projects/:id" element={<ProjectWorkspace />} />
                <Route path="my-work" element={<Navigate to="/app/dashboard" replace />} />
                <Route
                  path="qa"
                  element={
                    <ProtectedRoute
                      allowedRoles={[
                        UserRole.SUPER_ADMIN,
                        UserRole.ADMIN,
                        UserRole.PROJECT_MANAGER,
                        UserRole.QA,
                      ]}
                    >
                      <QaWorkspace />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="invoices"
                  element={
                    <ProtectedRoute
                      allowedRoles={[
                        UserRole.SUPER_ADMIN,
                        UserRole.ADMIN,
                        UserRole.PROJECT_MANAGER,
                      ]}
                    >
                      <InvoiceList />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="reports"
                  element={
                    <ProtectedRoute
                      allowedRoles={[
                        UserRole.SUPER_ADMIN,
                        UserRole.ADMIN,
                        UserRole.PROJECT_MANAGER,
                      ]}
                    >
                      <ReportsDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="leads"
                  element={
                    <ProtectedRoute
                      allowedRoles={[
                        UserRole.SUPER_ADMIN,
                        UserRole.ADMIN,
                        UserRole.BD,
                      ]}
                    >
                      <BDLeads />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="users"
                  element={
                    <ProtectedRoute
                      allowedRoles={[
                        UserRole.SUPER_ADMIN,
                        UserRole.ADMIN,
                        UserRole.PROJECT_MANAGER,
                      ]}
                    >
                      <TeamManagement />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="audit"
                  element={
                    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.ADMIN]}>
                      <AuditLogs />
                    </ProtectedRoute>
                  }
                />
                <Route path="project-requests" element={<Navigate to="/app/projects?tab=requests" replace />} />
              </Route>

              {/* Dedicated Client Portal */}
              <Route
                path="/portal"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.CLIENT]}>
                    <ClientPortalLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/portal/dashboard" replace />} />
                <Route path="dashboard" element={<ClientDashboard />} />
                <Route path="projects" element={<ClientProjects />} />
                <Route path="projects/:id" element={<ClientProjectDetail />} />
                <Route path="requirements/:id" element={<ClientRequirementDetail />} />
                <Route path="invoices" element={<ClientInvoices />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};
