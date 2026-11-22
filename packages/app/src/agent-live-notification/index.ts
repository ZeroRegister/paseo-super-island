import { PermissionsAndroid, Platform } from "react-native";
import { create } from "zustand";
import { getHostRuntimeStore, isHostRuntimeConnected } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { resolveAgentLivePhase, type AgentLivePhase } from "./model";
import { agentLiveNotification } from "./native";

interface AgentTarget {
  serverId: string;
  agentId: string;
}

const useTracking = create<{ target: AgentTarget | null }>(() => ({ target: null }));
let disposeTracking: (() => void) | null = null;
let latestRequest = 0;

function tracks(target: AgentTarget, current: AgentTarget | null): boolean {
  return target.serverId === current?.serverId && target.agentId === current.agentId;
}

export const canTrackAgentLive = agentLiveNotification !== null;

export function useIsAgentLiveTracked(target: AgentTarget): boolean {
  return useTracking((state) => tracks(target, state.target));
}

function stopTracking() {
  disposeTracking?.();
  disposeTracking = null;
  agentLiveNotification?.clear();
  useTracking.setState({ target: null });
}

async function requestNotificationPermission(): Promise<boolean> {
  if (Number(Platform.Version) < 33) return true;
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (await PermissionsAndroid.check(permission)) return true;
  return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
}

type TrackingError = "inactive" | "permission";

export async function toggleAgentLiveTracking(target: AgentTarget): Promise<TrackingError | null> {
  const notification = agentLiveNotification;
  if (!notification) return null;
  const request = ++latestRequest;
  if (tracks(target, useTracking.getState().target)) {
    stopTracking();
    return null;
  }

  const { serverId, agentId } = target;
  const host = getHostRuntimeStore();
  const readPhase = () => {
    const session = useSessionStore.getState().sessions[serverId];
    return resolveAgentLivePhase(
      session?.agents.get(agentId) ?? session?.agentDetails.get(agentId),
      isHostRuntimeConnected(host.getSnapshot(serverId)),
    );
  };
  const initialPhase = readPhase();
  if (!initialPhase || initialPhase === "reconnecting") return "inactive";
  const allowed = await requestNotificationPermission();
  if (request !== latestRequest) return null;
  if (!allowed) return "permission";

  const phaseAfterPermission = readPhase();
  if (!phaseAfterPermission || phaseAfterPermission === "reconnecting") return "inactive";
  if (!notification.publish(serverId, agentId, phaseAfterPermission)) return "permission";

  // The system replaces the previous notification under the same ID.
  disposeTracking?.();
  const releaseDirectory = host.acquireDirectoryDemand(serverId);
  let lastPhase: AgentLivePhase = phaseAfterPermission;
  const refresh = () => {
    const phase = readPhase();
    if (phase === lastPhase) return;
    if (!phase || !notification.publish(serverId, agentId, phase)) {
      stopTracking();
      return;
    }
    lastPhase = phase;
  };
  const unsubscribeSession = useSessionStore.subscribe(refresh);
  const unsubscribeHost = host.subscribe(serverId, refresh);
  disposeTracking = () => {
    unsubscribeSession();
    unsubscribeHost();
    releaseDirectory();
  };
  useTracking.setState({ target });
  refresh();
  return null;
}
