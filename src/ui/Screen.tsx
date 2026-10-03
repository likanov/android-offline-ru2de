import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { theme } from "./theme";
export function Screen({ children }: React.PropsWithChildren) {
  return (
    <ScrollView
      testID="screen-scroll"
      contentContainerStyle={styles.content}
      style={styles.screen}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { padding: 24, paddingTop: 60, paddingBottom: 48, gap: 12 },
});
