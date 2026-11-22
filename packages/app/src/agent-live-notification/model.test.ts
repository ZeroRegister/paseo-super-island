import { describe, expect, it } from "vitest";
import { resolveAgentLivePhase } from "./model";

describe("resolveAgentLivePhase", () => {
  const running = { status: "running" as const, pendingPermissions: [] };

  it("shows a run, requests for input, and reconnection", () => {
    expect(resolveAgentLivePhase(running, true)).toBe("running");
    expect(resolveAgentLivePhase({ ...running, status: "initializing" }, true)).toBe("running");
    expect(resolveAgentLivePhase(running, false)).toBe("reconnecting");
    const waiting = {
      status: "idle" as const,
      pendingPermissions: [
        { id: "request", provider: "codex" as const, kind: "tool" as const, name: "tool" },
      ],
    };
    expect(resolveAgentLivePhase(waiting, true)).toBe("waiting");
    expect(resolveAgentLivePhase(waiting, false)).toBe("reconnecting");
  });

  it("removes the notification when a run settles or is archived", () => {
    for (const status of ["idle", "error", "closed"] as const) {
      expect(resolveAgentLivePhase({ ...running, status }, true)).toBeNull();
    }
    expect(resolveAgentLivePhase({ ...running, archivedAt: new Date(0) }, true)).toBeNull();
    expect(resolveAgentLivePhase(undefined, true)).toBeNull();
  });
});
