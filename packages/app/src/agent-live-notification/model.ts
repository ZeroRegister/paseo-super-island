import type { Agent } from "@/stores/session-store";

const VISIBLE_SESSIONS = 3;
const MAX_TITLE_LENGTH = 36;

export type LiveAgent = Pick<
  Agent,
  | "id"
  | "title"
  | "status"
  | "archivedAt"
  | "background"
  | "pendingPermissions"
  | "turn"
  | "lastUserMessageAt"
  | "createdAt"
>;

interface LiveHost {
  serverId: string;
  agents: Iterable<LiveAgent>;
}

export interface AgentLiveSummary {
  serverId: string;
  agentId: string;
  titles: string[];
  total: number;
}

function isActiveSession(agent: LiveAgent): boolean {
  if (
    agent.archivedAt ||
    agent.background ||
    agent.status === "closed" ||
    agent.status === "error"
  ) {
    return false;
  }
  return (
    agent.status === "running" ||
    agent.status === "initializing" ||
    agent.pendingPermissions.length > 0
  );
}

function startedAt(agent: LiveAgent): number {
  const turnStart = agent.turn.phase === "open" ? agent.turn.startedAt : null;
  return (turnStart ?? agent.lastUserMessageAt ?? agent.createdAt).getTime();
}

function formatSessionTitle(title: string | null): string {
  const characters = Array.from(title?.replace(/\s+/gu, " ").trim() ?? "");
  if (characters.length <= MAX_TITLE_LENGTH) return characters.join("");
  return `${characters.slice(0, MAX_TITLE_LENGTH - 1).join("")}…`;
}

export function summarizeLiveAgents(hosts: Iterable<LiveHost>): AgentLiveSummary | null {
  const active = [];
  for (const { serverId, agents } of hosts) {
    for (const agent of agents) {
      if (isActiveSession(agent)) active.push({ serverId, agent });
    }
  }
  active.sort(
    (a, b) =>
      startedAt(b.agent) - startedAt(a.agent) ||
      a.serverId.localeCompare(b.serverId) ||
      a.agent.id.localeCompare(b.agent.id),
  );
  const first = active[0];
  if (!first) return null;
  return {
    serverId: first.serverId,
    agentId: first.agent.id,
    titles: active.slice(0, VISIBLE_SESSIONS).map(({ agent }) => formatSessionTitle(agent.title)),
    total: active.length,
  };
}
