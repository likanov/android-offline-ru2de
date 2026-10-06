import React, { useEffect, useState } from "react";
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { theme } from "../ui/theme";

export type NavigationDestination =
  | "today"
  | "dictionary"
  | "training"
  | "profiles"
  | "progress"
  | "reviews"
  | "topics"
  | "difficult"
  | "reminders"
  | "transfer"
  | "model";
const primary = [
  { screen: "today", label: "Сегодня", accessibilityLabel: "Сегодня", icon: "⌂" },
  { screen: "dictionary", label: "Словарь", accessibilityLabel: "Словарь", icon: "▤" },
  { screen: "training", label: "Учёба", accessibilityLabel: "Тренировка", icon: "▷" },
] as const;
const secondary = [
  { screen: "profiles", label: "Профили", requiresProfile: false },
  { screen: "progress", label: "Прогресс", requiresProfile: true },
  { screen: "reviews", label: "Повторение", requiresProfile: true },
  { screen: "topics", label: "Наборы", requiresProfile: true },
  { screen: "difficult", label: "Трудные", requiresProfile: true },
  { screen: "reminders", label: "Напоминания", requiresProfile: true },
  { screen: "transfer", label: "Перенос данных", requiresProfile: false },
  { screen: "model", label: "Локальная модель", requiresProfile: false },
] as const;

export function NavigationMenu({
  active,
  hasProfile,
  onNavigate,
}: {
  active: NavigationDestination;
  hasProfile: boolean;
  onNavigate(destination: NavigationDestination): void;
}) {
  const [open, setOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  function select(destination: NavigationDestination) {
    setOpen(false);
    onNavigate(destination);
  }
  return (
    <>
      {!keyboardVisible && (
        <View
          testID="navigation-bar"
          style={styles.bar}
          accessibilityElementsHidden={open}
          importantForAccessibility={open ? "no-hide-descendants" : "auto"}
        >
          {primary.map((item) => (
            <Pressable
              key={item.screen}
              testID={`nav-${item.screen}`}
              accessibilityRole="button"
              accessibilityLabel={item.accessibilityLabel}
              accessibilityState={{
                selected: active === item.screen,
                disabled: !hasProfile,
              }}
              disabled={!hasProfile}
              onPress={() => select(item.screen)}
              style={[
                styles.tab,
                active === item.screen && styles.selectedTab,
                !hasProfile && styles.disabled,
              ]}
            >
              <Text
                accessible={false}
                style={[
                  styles.icon,
                  active === item.screen && styles.selectedText,
                ]}
              >
                {item.icon}
              </Text>
              <Text
                accessible={false}
                style={[
                  styles.label,
                  active === item.screen && styles.selectedText,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            testID="nav-more"
            accessibilityRole="button"
            accessibilityLabel="Ещё"
            accessibilityState={{
              expanded: open,
              selected: secondary.some((item) => item.screen === active),
            }}
            onPress={() => setOpen(true)}
            style={[
              styles.tab,
              secondary.some((item) => item.screen === active) &&
                styles.selectedTab,
            ]}
          >
            <Text accessible={false} style={styles.icon}>
              ⋯
            </Text>
            <Text
              accessible={false}
              style={styles.label}
            >
              Ещё
            </Text>
          </Pressable>
        </View>
      )}
      {open && (
        <Modal
          transparent
          animationType="slide"
          visible
          onRequestClose={() => setOpen(false)}
        >
          <View style={styles.modal}>
            <Pressable
              testID="menu-backdrop"
              accessibilityRole="button"
              accessibilityLabel="Закрыть меню вне панели"
              onPress={() => setOpen(false)}
              style={styles.backdrop}
            />
            <View
              testID="more-menu"
              accessibilityViewIsModal
              style={styles.sheet}
            >
              <View style={styles.header}>
                <Text accessibilityRole="header" style={styles.heading}>
                  Ещё
                </Text>
                <Pressable
                  testID="menu-close"
                  accessibilityRole="button"
                  accessibilityLabel="Закрыть меню"
                  onPress={() => setOpen(false)}
                  style={styles.close}
                >
                  <Text style={styles.closeText}>×</Text>
                </Pressable>
              </View>
              <ScrollView
                testID="more-menu-scroll"
                style={styles.menuScroll}
                contentContainerStyle={styles.menuContent}
                keyboardShouldPersistTaps="handled"
              >
                {secondary.map((item) => (
                  <Pressable
                    key={item.screen}
                    testID={`nav-${item.screen}`}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{
                      selected: active === item.screen,
                      disabled: item.requiresProfile && !hasProfile,
                    }}
                    disabled={item.requiresProfile && !hasProfile}
                    onPress={() => select(item.screen)}
                    style={[
                      styles.menuItem,
                      active === item.screen && styles.selectedTab,
                      item.requiresProfile && !hasProfile && styles.disabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.menuLabel,
                        active === item.screen && styles.selectedText,
                      ]}
                    >
                      {item.label}
                    </Text>
                    <Text accessible={false} style={styles.chevron}>
                      ›
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: "#dce3df",
    backgroundColor: "#fff",
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    paddingVertical: 4,
    borderRadius: 12,
  },
  icon: { fontSize: 24, lineHeight: 26, color: theme.muted },
  label: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    color: theme.muted,
  },
  selectedTab: { backgroundColor: "#e2f0eb" },
  selectedText: { color: theme.primary },
  disabled: { opacity: 0.45 },
  modal: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#00000066",
  },
  sheet: {
    maxHeight: "72%",
    paddingTop: 8,
    paddingBottom: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: theme.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  heading: { fontSize: 22, fontWeight: "700", color: theme.foreground },
  close: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: { fontSize: 30, color: theme.muted },
  menuScroll: { flexShrink: 1 },
  menuContent: { paddingHorizontal: 12, paddingBottom: 8 },
  menuItem: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuLabel: { flex: 1, fontSize: 17, color: theme.foreground },
  chevron: { fontSize: 22, color: theme.muted },
});
