import { cookies } from "next/headers";
import { PageHeader } from "@/components/PageHeader";
import { prisma } from "@/lib/db";
import { startSession } from "../actions";
import ChatClient from "./ChatClient";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const cookieStore = await cookies();
  const sessionKey = cookieStore.get("didi_session_id")?.value;

  // No session cookie — show start page
  if (!sessionKey) {
    return (
      <div>
        <PageHeader title="Chat with Didi" />
        <div className="px-8">
          <div className="ae-card p-6 max-w-md">
            <p className="text-neutral-600 mb-4 text-sm">
              Start a new session to chat with Didi, your Dulong Downs AI coordinator.
            </p>
            <form action={startSession}>
              <button type="submit" className="btn-ae">
                Start Session
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Session key present — try to load the session record
  let session = null;
  try {
    session = await prisma.uc2ChatSession.findFirst({
      where: { sessionId: sessionKey },
    });
  } catch {
    session = null;
  }

  // Session not found in DB — show start page
  if (!session) {
    return (
      <div>
        <PageHeader title="Chat with Didi" />
        <div className="px-8">
          <div className="ae-card p-6 max-w-md">
            <p className="text-neutral-600 mb-4 text-sm">
              Your previous session could not be found. Start a new session to continue.
            </p>
            <form action={startSession}>
              <button type="submit" className="btn-ae">
                Start Session
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Load messages, active rules, and overdue items in parallel
  let messages: {
    id: number;
    role: "user" | "assistant" | "system";
    content: string;
    hasProposal: boolean;
    proposalConfirmed: boolean;
    createdAt: Date;
  }[] = [];
  let activeRules: { ruleCode: string; description: string; cannotOverride: boolean }[] = [];
  let overdueItems: { id: number; action: string; owner: string }[] = [];

  try {
    [messages, activeRules, overdueItems] = await Promise.all([
      prisma.uc2ChatMessage.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          hasProposal: true,
          proposalConfirmed: true,
          createdAt: true,
        },
      }) as Promise<typeof messages>,
      prisma.uc2LearningRule.findMany({
        where: { isActive: true },
        take: 10,
        orderBy: { createdAt: "asc" },
        select: {
          ruleCode: true,
          description: true,
          cannotOverride: true,
        },
      }),
      prisma.uc2ActionHub.findMany({
        where: { status: "overdue" },
        take: 5,
        select: {
          id: true,
          action: true,
          owner: true,
        },
      }),
    ]);
  } catch {
    // graceful degradation — render with empty state
  }

  return (
    <div>
      <PageHeader title="Chat with Didi" subtitle={"Session: " + sessionKey} />
      <div className="px-8">
        <ChatClient
          messages={messages}
          activeRules={activeRules}
          overdueItems={overdueItems}
          sessionKey={sessionKey}
        />
      </div>
    </div>
  );
}
