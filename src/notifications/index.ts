// frontend/src/notifications/index.ts
// patch_bundle04_5_p3_bell_export_removed: NotificationsBell deleted
// in favor of /transactions page. NotificationsProvider remains to
// drive toasts and feed the nav badge.
export {
  NotificationsProvider,
  useNotifications,
} from "./NotificationsProvider";
export type { TxRow, TxStatus } from "./NotificationsProvider";
