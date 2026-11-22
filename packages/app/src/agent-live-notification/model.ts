import type { Agent } from "@/stores/session-store";

export type AgentLivePhase = "running" | "waiting" | "reconnecting";

type AgentStatus = Pick<Agent, "status" | "archivedAt" | "pendingPermissions">;

export function resolveAgentLivePhase(
  agent: AgentStatus | undefined,
  connected: boolean,
): AgentLivePhase | null {
  if (!agent || agent.archivedAt || agent.status === "closed" || agent.status === "error") {
    return null;
  }
  if (agent.pendingPermissions.length > 0) return connected ? "waiting" : "reconnecting";
  if (agent.status === "running" || agent.status === "initializing") {
    return connected ? "running" : "reconnecting";
  }
  return null;
}
