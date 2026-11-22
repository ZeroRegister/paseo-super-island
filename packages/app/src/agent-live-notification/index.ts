import { AppState } from "react-native";
import { ensurePushPermission } from "@/push-notifications";
import { getHostRuntimeStore, isHostRuntimeConnected } from "@/runtime/host-runtime";
import { useSessionStore, type Agent } from "@/stores/session-store";
import { summarizeLiveAgents, type AgentLiveSummary } from "./model";
import { agentLiveNotification } from "./native";

export function startAgentLiveTracking(): () => void {
  const notification = agentLiveNotification;
  if (!notification) return () => undefined;

  const host = getHostRuntimeStore();
  const releaseDirectories = new Map<string, () => void>();
  let lastDirectories = new Map<string, ReadonlyMap<string, Agent>>();
  let summary: AgentLiveSummary | null = null;
  let postedSummary: string | null = null;
  let permission: boolean | undefined;
  let checkingPermission = false;
  let pending = false;
  let disposed = false;

  const clearNotification = () => {
    if (postedSummary !== null) notification.clear();
    postedSummary = null;
  };

  const checkPermission = async () => {
    if (checkingPermission) return;
    checkingPermission = true;
    const granted = await ensurePushPermission({ requireActiveApp: true }).catch((error) => {
      console.warn("[AgentLiveNotification] Unable to check notification permission", error);
      return false;
    });
    checkingPermission = false;
    if (disposed) return;
    permission = granted;
    if (!granted) clearNotification();
    scheduleRefresh();
  };

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
    const sameDirectories =
      directories.size === lastDirectories.size &&
      Array.from(directories).every(
        ([serverId, agents]) => lastDirectories.get(serverId) === agents,
      );
    if (!sameDirectories) {
      lastDirectories = directories;
      summary = summarizeLiveAgents(
        Array.from(directories, ([serverId, agents]) => ({ serverId, agents: agents.values() })),
      );
    }

    if (!summary) {
      clearNotification();
      return;
    }
    if (permission === undefined) void checkPermission();
    if (!permission) return;

    const key = JSON.stringify(summary);
    if (key === postedSummary) return;
    if (!notification.publish(summary.serverId, summary.agentId, summary.titles, summary.total)) {
      permission = false;
      clearNotification();
      return;
    }
    postedSummary = key;
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
  const appState = AppState.addEventListener("change", (state) => {
    if (state !== "active") return;
    permission = undefined;
    scheduleRefresh();
  });
  scheduleRefresh();
  return () => {
    disposed = true;
    appState.remove();
    unsubscribeSession();
    unsubscribeHost();
    unsubscribeHostList();
    for (const release of releaseDirectories.values()) release();
    clearNotification();
  };
}
