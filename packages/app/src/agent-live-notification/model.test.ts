import { describe, expect, it } from "vitest";
import { summarizeLiveAgents, type LiveAgent, type LiveWorkspace } from "./model";

function agent(id: string, started: number, extra?: Partial<LiveAgent>): LiveAgent {
  return {
    id,
    workspaceId: id,
    status: "running",
    pendingPermissions: [],
    turn: { phase: "open", startedAt: new Date(started), turnId: id, cancellationRequestId: null },
    lastUserMessageAt: null,
    createdAt: new Date(0),
    ...extra,
  };
}

function workspaceNames(names: Record<string, string>): Map<string, LiveWorkspace> {
  return new Map(Object.entries(names).map(([id, name]) => [id, { id, name }]));
}

describe("summarizeLiveAgents", () => {
  it("shows the newest three across hosts while retaining the full count", () => {
    expect(
      summarizeLiveAgents([
        {
          serverId: "old-host",
          agents: [agent("first", 1), agent("third", 3, { workspaceId: "shared-id" })],
          workspaces: workspaceNames({ first: "First task", "shared-id": "Third task" }),
        },
        {
          serverId: "new-host",
          agents: [agent("second", 2), agent("fourth", 4, { workspaceId: "shared-id" })],
          workspaces: workspaceNames({ second: "Second task", "shared-id": "Fourth task" }),
        },
      ]),
    ).toEqual({
      serverId: "new-host",
      agentId: "fourth",
      titles: ["Fourth task", "Third task", "Second task"],
      total: 4,
    });
  });

  it("drops completed, failed, archived and background sessions and keeps approvals", () => {
    expect(
      summarizeLiveAgents([
        {
          serverId: "host",
          workspaces: workspaceNames({ approval: "Review changes" }),
          agents: [
            agent("done", 1, { status: "idle" }),
            agent("error", 2, { status: "error" }),
            agent("archived", 3, { archivedAt: new Date(10) }),
            agent("background", 4, { background: true }),
            agent("approval", 5, {
              status: "idle",
              pendingPermissions: [
                { id: "permission", kind: "tool", provider: "codex", name: "shell" },
              ],
            }),
          ],
        },
      ]),
    ).toEqual({
      serverId: "host",
      agentId: "approval",
      titles: ["Review changes"],
      total: 1,
    });
    expect(summarizeLiveAgents([])).toBeNull();
  });

  it("uses the sidebar task name and never exposes the prompt while naming is pending", () => {
    const named = { ...agent("one", 3), title: "The first prompt in the named session" };
    const unnamed = { ...agent("two", 2), title: "The first prompt in a new session" };
    const summary = summarizeLiveAgents([
      {
        serverId: "host",
        agents: [named, unnamed],
        workspaces: workspaceNames({ one: "  检查\n文件导出状态 🦊  " }),
      },
    ]);
    expect(summary?.titles).toEqual(["检查 文件导出状态 🦊", ""]);
  });
});
