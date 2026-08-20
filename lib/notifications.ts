import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

if (Platform.OS !== 'web') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (e) {
    // silently ignore — expo-notifications may not be fully available in Expo Go
  }
}

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'web') return false;
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === 'granted';
  } catch {
    return false;
  }
};

export const scheduleDailyReminder = async (hour: number, minute: number): Promise<void> => {
  if (Platform.OS === 'web') return;
  try {
    await cancelDailyReminder();
    await Notifications.scheduleNotificationAsync({
      identifier: "daily-reminder",
      content: {
        title: "Eating out today? 🥗",
        body: "Check DiabEats before you order — your blood sugar will thank you.",
        data: { url: "/(tabs)/index" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      } as Notifications.DailyTriggerInput,
    });
  } catch {
    // silently ignore scheduling failures in Expo Go
  }
};

export const cancelDailyReminder = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync("daily-reminder");
  } catch {}
};

export const getDailyReminderStatus = async (): Promise<boolean> => {
  if (Platform.OS === 'web') return false;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.some((n) => n.identifier === "daily-reminder");
  } catch {
    return false;
  }
};

export const getDailyReminderTime = async (): Promise<{ hour: number; minute: number } | null> => {
  if (Platform.OS === 'web') return null;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const reminder = scheduled.find((n) => n.identifier === "daily-reminder");
    if (reminder?.trigger) {
      const trigger = reminder.trigger as Notifications.DailyTriggerInput & { hour?: number; minute?: number };
      if (trigger.hour !== undefined && trigger.minute !== undefined) {
        return { hour: trigger.hour, minute: trigger.minute };
      }
    }
  } catch {}
  return null;
};
