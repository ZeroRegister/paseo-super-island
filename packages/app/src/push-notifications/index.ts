import type {
  EnsurePushPermissionOptions,
  RevokePushNotificationsInput,
  StartPushNotificationsInput,
} from "./internal/types";

export async function ensurePushPermission(
  _options?: EnsurePushPermissionOptions,
): Promise<boolean> {
  return false;
}

export function startPushNotifications(_input: StartPushNotificationsInput): () => void {
  return () => undefined;
}

export async function revokePushNotifications(_input: RevokePushNotificationsInput): Promise<void> {
  // Push notifications are native-only.
}
