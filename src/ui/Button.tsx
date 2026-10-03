import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { theme } from "./theme";
export function Button({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress(): void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: {
    backgroundColor: theme.primary,
    padding: 14,
    borderRadius: 12,
    marginVertical: 4,
  },
  text: { color: "#fff", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.45 },
});
