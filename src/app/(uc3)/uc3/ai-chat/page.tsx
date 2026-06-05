import { redirect } from "next/navigation";
import { prisma as db } from "@/lib/db";
import { getActiveTenant } from "@/lib/uc3-tenant";
import { PageHeader } from "@/components/PageHeader";
import ChatClient from "./ChatClient";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ project?: string }>;
}

export default async function AiChatPage({ searchParams }: PageProps) {
  const tenant = await getActiveTenant();
  if (!tenant) redirect("/uc3/select-tenant");

  const { project: projectParam } = await searchParams;
  const selectedProjectId = projectParam ? Number(projectParam) : null;

  let projects: { id: number; name: string }[] = [];
  let messages: {
    id: number;
    role: string;
    content: string;
    requiresApproval: boolean;
    approved: boolean;
    createdAt: Date;
    projectId: number | null;
  }[] = [];

  try {
    [projects, messages] = await Promise.all([
      db.uc3Project.findMany({
        where: { tenantId: tenant.id },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      db.uc3ChatMessage.findMany({
        where: {
          tenantId: tenant.id,
          ...(selectedProjectId ? { projectId: selectedProjectId } : {}),
        },
        orderBy: { createdAt: "asc" },
        take: 20,
        select: {
          id: true,
          role: true,
          content: true,
          requiresApproval: true,
          approved: true,
          createdAt: true,
          projectId: true,
        },
      }),
    ]);
  } catch {
    // graceful empty state
  }

  return (
    <div className="space-y-6">
      <PageHeader title="AI Chat" subtitle="Ask questions and get AI-assisted insights for your projects" />
      <ChatClient
        messages={messages}
        projects={projects}
        selectedProjectId={selectedProjectId}
        tenantId={tenant.id}
      />
    </div>
  );
}
