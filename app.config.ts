import { ConfigContext, ExpoConfig } from "expo/config";

const APP_NAME = "ModernChat";
const PACKAGE_NAME = "com.modernchat.app";
const SCHEME = "modernChat";

export default ({ config }: ConfigContext): ExpoConfig => {
  const environment =
    (process.env.APP_ENV as "development" | "preview" | "production") ||
    "development";

  console.log("⚙️  Поточне середовище збірки:", environment);
  console.log("📦 URL бази даних Convex:", process.env.EXPO_PUBLIC_CONVEX_URL);

  const isDev = environment === "development";

  return {
    ...config,
    name: isDev ? `${APP_NAME} Dev` : APP_NAME,
    slug: "modernChat",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: isDev ? `${SCHEME}-dev` : SCHEME,
    userInterfaceStyle: "automatic",

    ios: {
      icon: "./assets/expo.icon",
      bundleIdentifier: isDev ? `${PACKAGE_NAME}.dev` : PACKAGE_NAME,
      infoPlist: {
        NSCameraUsageDescription:
          "Додатку modernChat потрібен доступ до камери для запису круглих відеоповідомлень.",
        NSMicrophoneUsageDescription:
          "Додатку modernChat потрібен доступ до мікрофона для запису звуку у відеоповідомленнях.",
      },
    },

    android: {
      package: isDev ? `${PACKAGE_NAME}.dev` : PACKAGE_NAME,
      googleServicesFile: "./google-services.json", // 👈 Файл конфігурації Firebase
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
      permissions: [
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.VIBRATE",             // 👈 Дозвіл вібрації для пушів
        "android.permission.POST_NOTIFICATIONS",   // 👈 Системний дозвіл пушів Android 13+
      ],
    },

    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },

    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#208AEF",
          image: "./assets/images/splash-icon.png",
          imageWidth: 76,
        },
      ],
      "expo-secure-store",
      [
        "expo-audio",
        {
          microphonePermission:
            "Дозвольте Prostir доступ до мікрофона для запису голосових сповіщень до публікацій.",
          recordAudioAndroid: true,
        },
      ],
      [
        "expo-camera",
        {
          cameraPermission:
            "Додатку Prostir потрібен доступ до камери для запису відеокружечків.",
          microphonePermission:
            "Додатку Prostir потрібен доступ до мікрофона для запису звуку у відеокружечках.",
        },
      ],
      ["expo-video"],
      // 👇 Плагін конфігурації системних сповіщень Expo
      [
        "expo-notifications",
        {
          icon: "./assets/images/icon.png",
          color: "#2563EB",
          defaultChannel: "default",
        },
      ],
    ],

    extra: {
      ...config.extra,
      eas: {
        projectId: "13a5c22e-aa58-4998-9f80-2eee72777c2c",
      },
    },

    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  };
};
