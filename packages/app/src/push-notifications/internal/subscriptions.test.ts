import { beforeEach, expect, it, vi } from "vitest";

const { appState, notifications } = vi.hoisted(() => ({
  appState: { currentState: "active" },
  notifications: {
    PermissionStatus: { GRANTED: "granted" },
    getPermissionsAsync: vi.fn(),
    requestPermissionsAsync: vi.fn(),
  },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
vi.mock("expo-constants", () => ({ default: {} }));
vi.mock("expo-notifications", () => notifications);
vi.mock("react-native", () => ({ AppState: appState, Platform: { OS: "android" } }));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  appState.currentState = "active";
  notifications.getPermissionsAsync.mockResolvedValue({
    status: "undetermined",
    canAskAgain: true,
  });
});

it("shares a single Android permission prompt between push registration and live tracking", async () => {
  const { ensurePushPermission } = await import("./subscriptions");
  notifications.requestPermissionsAsync.mockResolvedValue({ status: "granted" });

  const results = await Promise.all([
    ensurePushPermission(),
    ensurePushPermission({ requireActiveApp: true }),
  ]);

  expect(notifications.requestPermissionsAsync).toHaveBeenCalledOnce();
  expect(results).toEqual([true, true]);
});

it("opens the dialog only in the foreground for live tracking", async () => {
  const { ensurePushPermission } = await import("./subscriptions");
  notifications.requestPermissionsAsync.mockResolvedValue({ status: "granted" });
  appState.currentState = "background";

  expect(await ensurePushPermission({ requireActiveApp: true })).toBe(false);
  expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();

  appState.currentState = "active";
  expect(await ensurePushPermission({ requireActiveApp: true })).toBe(true);
  expect(notifications.requestPermissionsAsync).toHaveBeenCalledOnce();
});

it("respects a denial and recognizes a later grant in Android settings", async () => {
  const { ensurePushPermission } = await import("./subscriptions");
  notifications.requestPermissionsAsync.mockResolvedValue({ status: "denied" });

  expect(await ensurePushPermission({ requireActiveApp: true })).toBe(false);
  notifications.getPermissionsAsync.mockResolvedValue({ status: "denied", canAskAgain: true });
  expect(await ensurePushPermission({ requireActiveApp: true })).toBe(false);

  notifications.getPermissionsAsync.mockResolvedValue({ status: "granted", canAskAgain: true });
  appState.currentState = "background";
  expect(await ensurePushPermission({ requireActiveApp: true })).toBe(true);
  expect(notifications.requestPermissionsAsync).toHaveBeenCalledOnce();
});
