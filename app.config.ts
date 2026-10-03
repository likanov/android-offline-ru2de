import type { ExpoConfig } from "expo/config";
const config: ExpoConfig = {
  name: "Немецкий словарь",
  slug: "german-vocabulary",
  version: "0.1.0",
  orientation: "portrait",
  android: { package: "com.personal.germanvocabulary", blockedPermissions: ["android.permission.SCHEDULE_EXACT_ALARM", "android.permission.USE_EXACT_ALARM"] },
  plugins: [
    ["expo-audio", { microphonePermission: false, recordAudioAndroid: false }],
    "expo-asset",
    "expo-notifications",
    "./plugins/withOfflineAndroid",
    ["llama.rn", { enableOpenCLAndHexagon: false }],
    "expo-document-picker",
    ["expo-sqlite", { customBuildFlags: "-DSQLITE_DEFAULT_FOREIGN_KEYS=1" }],
  ],
};
export default config;
