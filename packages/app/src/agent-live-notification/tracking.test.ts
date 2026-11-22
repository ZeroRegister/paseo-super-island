import type { AppStateStatus } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LiveAgent, LiveWorkspace } from "./model";
import { startAgentLiveTracking } from "./index";

const fake = vi.hoisted(() => ({
  sessions: {} as Record<
    string,
    { agents: Map<string, LiveAgent>; workspaces: Map<string, LiveWorkspace> }
  >,
  listeners: new Set<() => void>(),
  appStateListeners: new Set<(state: AppStateStatus) => void>(),
  connected: new Set<string>(),
  permission: vi.fn(async () => true),
  publish: vi.fn(() => true),
  clear: vi.fn(),
  releaseDirectory: vi.fn(),
}));

vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_event: "change", listener: (state: AppStateStatus) => void) => {
      fake.appStateListeners.add(listener);
      return { remove: () => fake.appStateListeners.delete(listener) };
    },
  },
}));

vi.mock("@/push-notifications", () => ({ ensurePushPermission: fake.permission }));

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

let stopTracking: (() => void) | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  fake.permission.mockResolvedValue(true);
  fake.connected = new Set(["mac", "server"]);
  fake.sessions = {};
});

afterEach(() => {
  stopTracking?.();
  stopTracking = undefined;
});

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
          workspaceId: String(id),
          status,
          turn: { phase: "idle", cancellationRequestId: null },
          pendingPermissions: [],
          lastUserMessageAt: new Date(id),
          createdAt: new Date(0),
        },
      ]),
    ),
    workspaces: new Map(ids.map((id) => [String(id), { id: String(id), name: `Task ${id}` }])),
  };
}

it("automatically starts on the first run and updates one summary until all sessions end", async () => {
  setSessions("mac", [1], "idle");
  stopTracking = startAgentLiveTracking();
  await emit();
  expect(fake.publish).not.toHaveBeenCalled();
  expect(fake.permission).not.toHaveBeenCalled();

  setSessions("mac", [1, 2, 3]);
  setSessions("server", [4]);
  await emit();
  await vi.waitFor(() =>
    expect(fake.publish).toHaveBeenCalledExactlyOnceWith(
      "server",
      "4",
      ["Task 4", "Task 3", "Task 2"],
      4,
    ),
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

  stopTracking();
  stopTracking = undefined;
  expect(fake.clear).toHaveBeenCalledTimes(2);
  expect(fake.releaseDirectory.mock.calls.flat()).toEqual(["mac", "server"]);
  expect(fake.listeners.size).toBe(0);
  expect(fake.appStateListeners.size).toBe(0);
});

it("automatically shows existing runs after notification access is granted on resume", async () => {
  fake.permission.mockResolvedValue(false);
  setSessions("mac", [1]);
  stopTracking = startAgentLiveTracking();
  await emit();
  expect(fake.permission).toHaveBeenCalledExactlyOnceWith({ requireActiveApp: true });
  expect(fake.publish).not.toHaveBeenCalled();

  setSessions("mac", [1, 2]);
  await emit();
  expect(fake.permission).toHaveBeenCalledOnce();

  fake.permission.mockResolvedValue(true);
  for (const listener of fake.appStateListeners) listener("active");
  await vi.waitFor(() =>
    expect(fake.publish).toHaveBeenCalledExactlyOnceWith("mac", "2", ["Task 2", "Task 1"], 2),
  );
});

it("refreshes an active notification when its workspace name arrives or changes", async () => {
  setSessions("mac", [1]);
  const session = fake.sessions.mac;
  session.workspaces = new Map();
  stopTracking = startAgentLiveTracking();
  await vi.waitFor(() => expect(fake.publish).toHaveBeenCalledExactlyOnceWith("mac", "1", [""], 1));

  session.workspaces = new Map([["1", { id: "1", name: "检查文件导出" }]]);
  await emit();
  expect(fake.publish).toHaveBeenNthCalledWith(2, "mac", "1", ["检查文件导出"], 1);

  session.workspaces = new Map([["1", { id: "1", name: "检查 CSV 文件导出进度" }]]);
  await emit();
  expect(fake.publish).toHaveBeenNthCalledWith(3, "mac", "1", ["检查 CSV 文件导出进度"], 1);
});
