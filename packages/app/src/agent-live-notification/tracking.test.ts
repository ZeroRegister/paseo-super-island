import { expect, it, vi } from "vitest";
import type { LiveAgent } from "./model";
import { toggleAgentLiveTracking } from "./index";

const fake = vi.hoisted(() => ({
  sessions: {} as Record<string, { agents: Map<string, LiveAgent> }>,
  listeners: new Set<() => void>(),
  connected: new Set(["mac", "server"]),
  publish: vi.fn(() => true),
  clear: vi.fn(),
  releaseDirectory: vi.fn(),
}));

vi.mock("react-native", () => ({
  Platform: { Version: 36 },
  PermissionsAndroid: {
    PERMISSIONS: { POST_NOTIFICATIONS: "android.permission.POST_NOTIFICATIONS" },
    check: async () => true,
  },
}));

vi.mock("@/runtime/host-runtime", () => ({
  getHostRuntimeStore: () => ({
    getHosts: () => Object.keys(fake.sessions).map((serverId) => ({ serverId })),
    getSnapshot: (serverId: string) => fake.connected.has(serverId),
    subscribeAll: subscribe,
    subscribeHostList: subscribe,
    acquireDirectoryDemand: (serverId: string) => () => fake.releaseDirectory(serverId),
  }),
  isHostRuntimeConnected: (snapshot: boolean) => snapshot,
}));

vi.mock("@/stores/session-store", () => ({
  useSessionStore: {
    getState: () => ({ sessions: fake.sessions }),
    subscribe,
  },
}));

vi.mock("./native", () => ({
  agentLiveNotification: { publish: fake.publish, clear: fake.clear },
}));

function subscribe(callback: () => void) {
  const listener = () => callback();
  fake.listeners.add(listener);
  return () => fake.listeners.delete(listener);
}

async function emit() {
  for (const listener of fake.listeners) listener();
  await Promise.resolve();
}

function setSessions(serverId: string, ids: number[], status: LiveAgent["status"] = "running") {
  fake.sessions[serverId] = {
    agents: new Map(
      ids.map((id) => [
        String(id),
        {
          id: String(id),
          title: `Task ${id}`,
          status,
          turn: { phase: "idle", cancellationRequestId: null },
          pendingPermissions: [],
          lastUserMessageAt: new Date(id),
          createdAt: new Date(0),
        },
      ]),
    ),
  };
}

it("keeps one summary, promotes the next session on completion, and starts a new card after zero", async () => {
  setSessions("mac", [1, 2, 3]);
  setSessions("server", [4]);
  expect(await toggleAgentLiveTracking()).toBeNull();
  await emit();
  expect(fake.publish).toHaveBeenCalledExactlyOnceWith(
    "server",
    "4",
    ["Task 4", "Task 3", "Task 2"],
    4,
  );

  setSessions("server", [4], "idle");
  await emit();
  expect(fake.publish).toHaveBeenLastCalledWith("mac", "3", ["Task 3", "Task 2", "Task 1"], 3);

  fake.connected.delete("mac");
  await emit();
  expect(fake.clear).toHaveBeenCalledOnce();

  setSessions("mac", [], "idle");
  fake.connected.add("mac");
  await emit();
  expect(fake.clear).toHaveBeenCalledOnce();
  expect(fake.publish).toHaveBeenCalledTimes(2);

  setSessions("mac", [5]);
  await emit();
  expect(fake.publish).toHaveBeenLastCalledWith("mac", "5", ["Task 5"], 1);

  expect(await toggleAgentLiveTracking()).toBeNull();
  expect(fake.clear).toHaveBeenCalledTimes(2);
  expect(fake.releaseDirectory.mock.calls.flat()).toEqual(["mac", "server"]);
  expect(fake.listeners.size).toBe(0);
});
