import { PermissionsAndroid, Platform } from "react-native";
import { create } from "zustand";
import { getHostRuntimeStore, isHostRuntimeConnected } from "@/runtime/host-runtime";
import { useSessionStore, type Agent } from "@/stores/session-store";
import { summarizeLiveAgents } from "./model";
import { agentLiveNotification } from "./native";

const useTracking = create<{ enabled: boolean }>(() => ({ enabled: false }));
let disposeTracking: (() => void) | null = null;
let latestRequest = 0;

export const canTrackAgentLive = agentLiveNotification !== null;

export function useIsAgentLiveTrackingEnabled(): boolean {
  return useTracking((state) => state.enabled);
}

function stopTracking() {
  disposeTracking?.();
  disposeTracking = null;
  agentLiveNotification?.clear();
  useTracking.setState({ enabled: false });
}

async function requestNotificationPermission(): Promise<boolean> {
  if (Number(Platform.Version) < 33) return true;
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (await PermissionsAndroid.check(permission)) return true;
  return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
}

export async function toggleAgentLiveTracking(): Promise<"permission" | null> {
  const notification = agentLiveNotification;
  if (!notification) return null;
  const request = ++latestRequest;
  if (useTracking.getState().enabled) {
    stopTracking();
    return null;
  }

  const allowed = await requestNotificationPermission();
  if (request !== latestRequest) return null;
  if (!allowed) return "permission";

  const host = getHostRuntimeStore();
  const releaseDirectories = new Map<string, () => void>();
  let lastDirectories = new Map<string, ReadonlyMap<string, Agent>>();
  let lastSummary: string | null = null;
  let pending = false;
  let disposed = false;

  const refresh = () => {
    const hostIds = new Set(host.getHosts().map((entry) => entry.serverId));
    for (const [serverId, release] of releaseDirectories) {
      if (hostIds.has(serverId)) continue;
      releaseDirectories.delete(serverId);
      release();
    }
    for (const serverId of hostIds) {
      if (!releaseDirectories.has(serverId)) {
        releaseDirectories.set(serverId, host.acquireDirectoryDemand(serverId));
      }
    }

    const directories = new Map<string, ReadonlyMap<string, Agent>>();
    const { sessions } = useSessionStore.getState();
    for (const serverId of hostIds) {
      const agents = sessions[serverId]?.agents;
      if (agents && isHostRuntimeConnected(host.getSnapshot(serverId))) {
        directories.set(serverId, agents);
      }
    }
    if (
      directories.size === lastDirectories.size &&
      Array.from(directories).every(
        ([serverId, agents]) => lastDirectories.get(serverId) === agents,
      )
    ) {
      return true;
    }

    lastDirectories = directories;
    const summary = summarizeLiveAgents(
      Array.from(directories, ([serverId, agents]) => ({ serverId, agents: agents.values() })),
    );
    if (!summary) {
      if (lastSummary !== null) notification.clear();
      lastSummary = null;
      return true;
    }
    const key = JSON.stringify(summary);
    if (key === lastSummary) return true;
    if (!notification.publish(summary.serverId, summary.agentId, summary.titles, summary.total)) {
      stopTracking();
      return false;
    }
    lastSummary = key;
    return true;
  };

  // Host demand can synchronously update both stores. Reconcile once after each batch.
  const scheduleRefresh = () => {
    if (pending || disposed) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      if (!disposed) refresh();
    });
  };
  const unsubscribeSession = useSessionStore.subscribe(scheduleRefresh);
  const unsubscribeHost = host.subscribeAll(scheduleRefresh);
  const unsubscribeHostList = host.subscribeHostList(scheduleRefresh);
  disposeTracking = () => {
    disposed = true;
    unsubscribeSession();
    unsubscribeHost();
    unsubscribeHostList();
    for (const release of releaseDirectories.values()) release();
  };
  useTracking.setState({ enabled: true });
  return refresh() ? null : "permission";
}
