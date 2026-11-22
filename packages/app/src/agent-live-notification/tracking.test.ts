import { expect, it, vi } from "vitest";
import type { Agent } from "@/stores/session-store";
import { toggleAgentLiveTracking } from "./index";

const fake = vi.hoisted(() => ({
  agents: new Map<string, Pick<Agent, "status" | "pendingPermissions">>(),
  connected: true,
  listeners: new Set<() => void>(),
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
    getSnapshot: () => fake.connected,
    subscribe: (serverId: string, callback: () => void) => {
      expect(serverId).toBe("host");
      return subscribe(callback);
    },
    acquireDirectoryDemand: () => fake.releaseDirectory,
  }),
  isHostRuntimeConnected: (snapshot: boolean) => snapshot,
}));

vi.mock("@/stores/session-store", () => ({
  useSessionStore: {
    getState: () => ({ sessions: { host: { agents: fake.agents } } }),
    subscribe: (callback: () => void) => subscribe(callback),
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

function emit() {
  for (const listener of fake.listeners) listener();
}

it("updates one notification through a run and releases the directory when it ends", async () => {
  const target = { serverId: "host", agentId: "agent" };
  fake.agents.set("agent", { status: "running", pendingPermissions: [] });
  expect(await toggleAgentLiveTracking(target)).toBeNull();
  emit();
  expect(fake.publish).toHaveBeenCalledExactlyOnceWith("host", "agent", "running");

  fake.agents.set("agent", {
    status: "running",
    pendingPermissions: [{ id: "approval", provider: "codex", kind: "tool", name: "shell" }],
  });
  emit();
  expect(fake.publish).toHaveBeenLastCalledWith("host", "agent", "waiting");

  fake.connected = false;
  emit();
  expect(fake.publish).toHaveBeenLastCalledWith("host", "agent", "reconnecting");

  fake.connected = true;
  fake.agents.set("agent", { status: "idle", pendingPermissions: [] });
  emit();
  expect(fake.clear).toHaveBeenCalledOnce();
  expect(fake.releaseDirectory).toHaveBeenCalledOnce();
  expect(fake.listeners.size).toBe(0);
});
