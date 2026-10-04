import React, { useCallback, useEffect, useState } from "react";
import { Text, TextInput, View, StyleSheet } from "react-native";
import { useAppServices } from "../../app/AppServices";
import { useActiveProfile } from "../../app/ActiveProfileProvider";
import {
  createProfile,
  listProfiles,
  renameProfile,
} from "./profileRepository";
import type { Profile } from "../../core/types";
import { Screen } from "../../ui/Screen";
import { Button } from "../../ui/Button";
import { theme } from "../../ui/theme";

function profileSlug(name: string): string {
  return (
    name
      .toLocaleLowerCase("ru-RU")
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "profile"
  );
}

export function ProfilesScreen() {
  const { db } = useAppServices();
  const { profile, select, reload } = useActiveProfile();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Profile | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const displayedProfiles = profile
    ? [
        ...profiles.filter((item) => item.id === profile.id),
        ...profiles.filter((item) => item.id !== profile.id),
      ]
    : profiles;
  const refresh = useCallback(async () => {
    setProfiles(await listProfiles(db));
  }, [db]);
  useEffect(() => {
    let mounted = true;
    void listProfiles(db)
      .then((saved) => {
        if (mounted) setProfiles(saved);
      })
      .catch(() => {
        if (mounted) setError("Не удалось загрузить профили");
      });
    return () => {
      mounted = false;
    };
  }, [db]);
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Не удалось сохранить профиль",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Text style={styles.heading}>Профили</Text>
      <Text style={styles.body}>
        Личный словарь и прогресс сохраняются на устройстве.
      </Text>
      <Text style={styles.active}>
        Активный профиль: {profile?.name ?? "не выбран"}
      </Text>
      <View style={styles.card}>
        <Text style={styles.name}>Новый профиль</Text>
        <TextInput
          testID="profile-new-name"
          style={styles.input}
          accessibilityLabel="Имя нового профиля"
          placeholder="Ваше имя"
          value={name}
          onChangeText={setName}
        />
        <Button
          testID="profile-create"
          title="Создать профиль"
          disabled={busy}
          onPress={() => {
            void perform(async () => {
              await createProfile(db, name);
              setName("");
            });
          }}
        />
      </View>
      {editing && (
        <View style={styles.card}>
          <TextInput
            testID="profile-edit-name"
            style={styles.input}
            accessibilityLabel="Новое имя профиля"
            value={editName}
            onChangeText={setEditName}
          />
          <Button
            testID="profile-save-name"
            title="Сохранить имя"
            disabled={busy}
            onPress={() => {
              void perform(async () => {
                await renameProfile(db, editing.id, editName);
                setEditing(null);
              });
            }}
          />
          <Button title="Отмена" onPress={() => setEditing(null)} />
        </View>
      )}
      {displayedProfiles.map((item) => (
        <View
          key={item.id}
          testID={`profile-card-${profileSlug(item.name)}`}
          style={styles.card}
        >
          <Text style={styles.name}>{item.name}</Text>
          <Button
            testID={`profile-rename-${profileSlug(item.name)}`}
            title={`Переименовать ${item.name}`}
            disabled={busy}
            onPress={() => {
              setEditing(item);
              setEditName(item.name);
            }}
          />
          <Button
            testID={`profile-select-${profileSlug(item.name)}`}
            title={`Выбрать ${item.name}`}
            disabled={busy}
            onPress={() => {
              void perform(() => select(item.id));
            }}
          />
          <Text style={styles.body}>
            {item.xp} XP · Стартовый словарь: 40 слов
          </Text>
        </View>
      ))}
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  heading: { fontSize: 30, fontWeight: "700", color: theme.foreground },
  body: { fontSize: 15, color: theme.muted },
  active: { fontSize: 18, fontWeight: "600", color: theme.foreground },
  name: { fontSize: 20, fontWeight: "600", color: theme.foreground },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, gap: 6 },
  input: {
    padding: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.muted,
    borderRadius: 10,
    fontSize: 18,
  },
  error: { color: theme.error },
});
