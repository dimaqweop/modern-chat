/** @type {import('tailwindcss').Config} */
module.exports = {
  // Шляхи до всіх директорій з компонентами та екранами
  content: [
    "./src/app/**/*.{js,jsx,ts,tsx}",
    "./src/components/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#3B82F6", // Акцентний синій для повідомлень
        primaryDark: "#1D4ED8",
        secondary: "#1E293B", // Темний Slate для карток і бульбашок співрозмовника
        surface: "#0F172A", // Глибокий темний фон
        surfaceLight: "#334155", // Межі та розділювачі
        textMuted: "#94A3B8", // Приглушений текст
      },
    },
  },
  plugins: [],
};