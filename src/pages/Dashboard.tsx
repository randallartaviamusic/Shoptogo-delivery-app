import { useAuth } from "@/hooks/use-auth";
import { ROLE_HOME } from "@/lib/format";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router";

/** Entry point after sign-in: sends each role to its own workspace. */
export default function Dashboard() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/auth?returnTo=%2Fdashboard" replace />;
  }

  if (!user.role) return <Navigate to="/onboarding" replace />;

  return <Navigate to={ROLE_HOME[user.role] ?? "/swipe"} replace />;
}
