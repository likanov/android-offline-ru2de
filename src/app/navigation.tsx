import React, { useState } from "react";
import { View } from "react-native";
import { ProfilesScreen } from "../features/profiles/ProfilesScreen";
import { ModelSetupScreen } from "../features/assistant/ModelSetupScreen";
import { Button } from "../ui/Button";
export function Navigation() {
  const [model, setModel] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      {model ? <ModelSetupScreen /> : <ProfilesScreen />}
      <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
        <Button
          title={model ? "Профили" : "Локальная модель"}
          onPress={() => setModel(!model)}
        />
      </View>
    </View>
  );
}
