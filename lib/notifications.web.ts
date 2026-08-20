export const requestNotificationPermission = async (): Promise<boolean> => false;

export const scheduleDailyReminder = async (_hour: number, _minute: number): Promise<void> => {};

export const cancelDailyReminder = async (): Promise<void> => {};

export const getDailyReminderStatus = async (): Promise<boolean> => false;

export const getDailyReminderTime = async (): Promise<{ hour: number; minute: number } | null> => null;
