import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import { resolveWorkspaceMapKeyByIdentity } from "@/utils/workspace-identity";

const VISIBLE_SESSIONS = 3;

export type LiveAgent = Pick<
  Agent,
  | "id"
  | "workspaceId"
  | "status"
  | "archivedAt"
  | "background"
  | "pendingPermissions"
  | "turn"
  | "lastUserMessageAt"
  | "createdAt"
>;

export type LiveWorkspace = Pick<WorkspaceDescriptor, "id" | "name">;

interface LiveHost {
  serverId: string;
  agents: Iterable<LiveAgent>;
  workspaces: ReadonlyMap<string, LiveWorkspace>;
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

export function summarizeLiveAgents(hosts: Iterable<LiveHost>): AgentLiveSummary | null {
  const active = [];
  for (const { serverId, agents, workspaces } of hosts) {
    for (const agent of agents) {
      if (isActiveSession(agent)) active.push({ serverId, agent, workspaces });
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
    titles: active.slice(0, VISIBLE_SESSIONS).map(({ agent, workspaces }) => {
      const key = resolveWorkspaceMapKeyByIdentity({ workspaces, workspaceId: agent.workspaceId });
      const workspace = key ? workspaces.get(key) : undefined;
      return workspace?.name.replace(/[\s\u0085]+/gu, " ").trim() ?? "";
    }),
    total: active.length,
  };
}
