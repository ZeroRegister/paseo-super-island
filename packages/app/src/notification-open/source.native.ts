import * as Notifications from "expo-notifications";
import { agentLiveNotification } from "@/agent-live-notification/native";
import type { NotificationOpenSource, NotificationTap } from "./source";

function toTap(response: Notifications.NotificationResponse): NotificationTap {
  return {
    id: response.notification.request.identifier,
    data: response.notification.request.content.data,
  };
}

export function createNotificationOpenSource(): NotificationOpenSource {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  return {
    subscribe(onTap) {
      const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
        onTap(toTap(response)),
      );
      const liveSubscription = agentLiveNotification?.addListener(
        "onAgentLiveNotificationTap",
        onTap,
      );
      return () => {
        subscription.remove();
        liveSubscription?.remove();
      };
    },
    async takeLaunchTap() {
      const liveTap = agentLiveNotification?.takeLaunchTap();
      if (liveTap) return liveTap;
      const response = await Notifications.getLastNotificationResponseAsync();
      return response ? toTap(response) : null;
    },
    acknowledge(tap) {
      if (tap.id.startsWith("agent-live:")) {
        agentLiveNotification?.acknowledgeTap(tap.id);
      } else {
        Notifications.clearLastNotificationResponse();
      }
    },
  };
}
