import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { theme } from "./theme";
export function Button({
  title,
  testID,
  onPress,
  disabled = false,
  variant = "primary",
}: {
  title: string;
  testID?: string;
  onPress(): void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, styles[variant], disabled && styles.disabled]}
    >
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    justifyContent: "center",
    backgroundColor: theme.primary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    marginVertical: 4,
  },
  primary: { backgroundColor: theme.primary },
  secondary: { backgroundColor: theme.muted },
  ghost: { backgroundColor: "transparent", borderWidth: 1, borderColor: theme.muted },
  text: { color: "#fff", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.45 },
});
