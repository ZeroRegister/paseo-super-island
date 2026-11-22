import { describe, expect, it } from "vitest";
import { summarizeLiveAgents, type LiveAgent } from "./model";

function agent(id: string, started: number, extra?: Partial<LiveAgent>): LiveAgent {
  return {
    id,
    title: id,
    status: "running",
    pendingPermissions: [],
    turn: { phase: "open", startedAt: new Date(started), turnId: id, cancellationRequestId: null },
    lastUserMessageAt: null,
    createdAt: new Date(0),
    ...extra,
  };
}

describe("summarizeLiveAgents", () => {
  it("shows the newest three across hosts while retaining the full count", () => {
    expect(
      summarizeLiveAgents([
        { serverId: "old-host", agents: [agent("first", 1), agent("third", 3)] },
        { serverId: "new-host", agents: [agent("second", 2), agent("fourth", 4)] },
      ]),
    ).toEqual({
      serverId: "new-host",
      agentId: "fourth",
      titles: ["fourth", "third", "second"],
      total: 4,
    });
  });

  it("drops completed, failed, archived and background sessions and keeps approvals", () => {
    expect(
      summarizeLiveAgents([
        {
          serverId: "host",
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
      titles: ["approval"],
      total: 1,
    });
    expect(summarizeLiveAgents([])).toBeNull();
  });

  it("keeps each session title on its own row without cutting a surrogate pair", () => {
    const summary = summarizeLiveAgents([
      {
        serverId: "host",
        agents: [
          agent("one", 3, { title: "  会话\n标题  " }),
          agent("two", 2, { title: "🦊".repeat(40) }),
          agent("three", 1, { title: null }),
        ],
      },
    ]);
    expect(summary?.titles).toEqual(["会话 标题", "🦊".repeat(35) + "…", ""]);
  });
});
