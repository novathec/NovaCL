import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissions } from "@/lib/permissions";
import { visibleNav } from "@/lib/nav";
import { ROLE_LABELS } from "@/lib/constants";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { OnboardingCard } from "@/components/shell/onboarding";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();

  // Usuario autenticado sin organización → onboarding
  if (ctx.organizations.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <OnboardingCard email={ctx.user.email} />
      </div>
    );
  }

  const isSuper = ctx.profile?.es_superadmin ?? false;
  const supabase = await createClient();
  const perms = await getEffectivePermissions(
    supabase,
    ctx.activeOrgId!,
    ctx.activeSedeId,
    ctx.roles,
    isSuper
  );
  const sections = visibleNav(perms);
  const roleLabel = ctx.roles[0] ? ROLE_LABELS[ctx.roles[0]] : "Miembro";

  return (
    <div className="flex min-h-screen bg-muted/20">
      <Sidebar sections={sections} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          sections={sections}
          organizations={ctx.organizations}
          sedes={ctx.sedes}
          activeOrgId={ctx.activeOrgId}
          activeSedeId={ctx.activeSedeId}
          user={{ email: ctx.user.email, nombre: ctx.profile?.nombre ?? "" }}
          roleLabel={roleLabel}
        />
        <main className="flex-1 bg-tech-grid px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
