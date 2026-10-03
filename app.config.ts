import type { ExpoConfig } from "expo/config";
const config: ExpoConfig = {
  name: "Немецкие слова",
  slug: "german-vocabulary",
  version: "0.1.0",
  orientation: "portrait",
  android: { package: "com.personal.germanvocabulary" },
  plugins: [
    ["expo-sqlite", { customBuildFlags: "-DSQLITE_DEFAULT_FOREIGN_KEYS=1" }],
  ],
};
export default config;
