import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";
import type { NotificationTap } from "@/notification-open/source";
import type { AgentLivePhase } from "./model";

interface AgentLiveNotificationModule {
  addListener(
    name: "onAgentLiveNotificationTap",
    onTap: (tap: NotificationTap) => void,
  ): { remove(): void };
  publish(serverId: string, agentId: string, phase: AgentLivePhase): boolean;
  clear(): void;
  takeLaunchTap(): NotificationTap | null;
  acknowledgeTap(id: string): void;
}

export const agentLiveNotification =
  Platform.OS === "android"
    ? requireOptionalNativeModule<AgentLiveNotificationModule>("PaseoAgentLiveNotification")
    : null;
