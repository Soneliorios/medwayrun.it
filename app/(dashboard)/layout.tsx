export const dynamic = "force-dynamic";

import { TopNav } from "@/components/shared/TopNav";
import { AuthProvider } from "@/features/auth/components/AuthProvider";
import { ApprovalGate } from "@/features/auth/components/ApprovalGate";
import { ProjectsBootstrap } from "@/features/projects/components/ProjectsBootstrap";
import { TimerProvider } from "@/features/timer/components/TimerProvider";
import { NotificationProvider } from "@/features/notifications/components/NotificationProvider";
import { GlobalCreateTaskModal } from "@/features/tasks/components/GlobalCreateTaskModal";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <ApprovalGate>
        <ProjectsBootstrap />
        <NotificationProvider />
        <TimerProvider>
          <div className="flex flex-col h-screen overflow-hidden bg-neutral-50">
            <TopNav />
            <main className="flex-1 overflow-hidden min-w-0">
              {children}
            </main>
            <GlobalCreateTaskModal />
          </div>
        </TimerProvider>
      </ApprovalGate>
    </AuthProvider>
  );
}
