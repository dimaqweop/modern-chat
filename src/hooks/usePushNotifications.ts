// hooks/usePushNotifications.ts
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";

/**
 * Налаштування поведінки сповіщень, коли додаток активний (Foreground).
 * Показуємо банер, граємо звук та додаємо вібрацію.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Хук для реєстрації Push-сповіщень та обробки переходів у чат (Deep Linking)
 */
export function usePushNotifications() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const savePushToken = useMutation(api.users.savePushToken);
  const router = useRouter();

  // Обробка сповіщення при холодному старті додатку (якщо додаток був повністю закритий)
  const lastNotificationResponse = Notifications.useLastNotificationResponse();

  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  /**
   * Маршрутизація (Deep Linking) за даними зі сповіщення
   */
  const handleNotificationNavigation = (data: any) => {
    if (!data) return;

    console.log("🧭 Навігація за пуш-сповіщенням:", data);

    const targetRoomId = data.roomId || data.chatRoomId;

    if (targetRoomId) {
      // Перехід до відповідної кімнати чату
      router.push(`/(app)/chat/${targetRoomId}` as any);
    } else {
      // Якщо кімнати немає — повертаємося на головний список кімнат
      router.push("/(app)" as any);
    }
  };

  // Ефект 1: Обробка переходу при "холодному старті"
  useEffect(() => {
    if (
      lastNotificationResponse &&
      lastNotificationResponse.actionIdentifier ===
        Notifications.DEFAULT_ACTION_IDENTIFIER
    ) {
      const data = lastNotificationResponse.notification.request.content.data;
      handleNotificationNavigation(data);
    }
  }, [lastNotificationResponse]);

  // Ефект 2: Отримання токена та підписка на події сповіщень
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    // Отримуємо токен та зберігаємо його в базі Convex
    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        console.log("📲 Збереження Expo Push Token:", token);
        savePushToken({ pushToken: token }).catch((err) => {
          console.error("❌ Помилка збереження pushToken у Convex:", err);
        });
      }
    });

    // Слухач сповіщень, коли додаток відкрито на передньому плані (Foreground)
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log("🔔 Отримано сповіщення у Foreground:", notification.request.content);
      });

    // Слухач натискання користувача на сповіщення (Background / Notification Bar)
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        handleNotificationNavigation(data);
      });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [isAuthenticated, isLoading]);
}

/**
 * Налаштування Android Notification Channel та отримання Push-токена
 */
async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Налаштування каналу для Android
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Повідомлення чату",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2563EB",
      sound: "default",
    });
  }

  // Перевіряємо поточний статус дозволів
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Якщо дозволу ще немає — запитуємо у користувача
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.warn("⚠️ Користувач відхилив запит на дозвіл для сповіщень");
    return null;
  }

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) {
      console.warn("⚠️ Project ID не знайдено в app.config.ts / app.json (extra.eas.projectId)");
    }

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    return tokenData.data;
  } catch (error) {
    console.error("❌ Помилка отримання Expo Push Token:", error);
    return null;
  }
}
