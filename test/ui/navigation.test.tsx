import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { DeviceEventEmitter } from "react-native";
import { AppServicesContext } from "../../src/app/AppServices";
import { ActiveProfileProvider } from "../../src/app/ActiveProfileProvider";
import { Navigation } from "../../src/app/navigation";
import { createProfile } from "../../src/features/profiles/profileRepository";
import { createWordHarness } from "../harness";

async function openApp(withProfile = true) {
  const h = await createWordHarness();
  if (withProfile) await createProfile(h.db, "A");
  const view = render(
    <AppServicesContext.Provider value={{ db: h.db }}>
      <ActiveProfileProvider>
        <Navigation />
      </ActiveProfileProvider>
    </AppServicesContext.Provider>,
  );
  await screen.findByText(
    `Активный профиль: ${withProfile ? "A" : "не выбран"}`,
  );
  return { ...h, unmount: view.unmount };
}

test("secondary_navigation_is_hidden_until_more_is_opened_and_closes_after_selection", async () => {
  const h = await openApp();
  try {
    expect(screen.queryByRole("button", { name: "Прогресс" })).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Ещё" }));
    fireEvent.press(screen.getByRole("button", { name: "Прогресс" }));
    await screen.findByText("XP: 0");
    expect(screen.queryByRole("button", { name: "Напоминания" })).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Словарь" }));
    await screen.findByRole("button", { name: "Добавить слово" });
  } finally {
    h.unmount();
    h.close();
  }
});

test("closing_more_preserves_the_current_training_question", async () => {
  const h = await openApp();
  try {
    fireEvent.press(screen.getByRole("button", { name: "Тренировка" }));
    await screen.findByRole("button", { name: "Открыть карточку" });
    const profile = (await h.db.first<{ id: string }>(
      "SELECT id FROM profiles",
    ))!;
    const before = (await h.sessions.resume(profile.id))!.currentQuestion;
    fireEvent.press(screen.getByRole("button", { name: "Ещё" }));
    fireEvent.press(screen.getByRole("button", { name: "Закрыть меню" }));
    expect((await h.sessions.resume(profile.id))!.currentQuestion).toEqual(
      before,
    );
    fireEvent.press(screen.getByRole("button", { name: "Ещё" }));
    fireEvent.press(screen.getByRole("button", { name: "Прогресс" }));
    await screen.findByText(/XP:/);
    expect((await h.sessions.resume(profile.id))!.currentQuestion).toBeNull();
  } finally {
    h.unmount();
    h.close();
  }
});

test("keyboard_hides_navigation_and_dismissal_restores_it_without_losing_input", async () => {
  const h = await openApp();
  try {
    fireEvent.press(screen.getByRole("button", { name: "Словарь" }));
    fireEvent.changeText(await screen.findByLabelText("Поиск слов"), "Buch");
    act(() => {
      DeviceEventEmitter.emit("keyboardDidShow", {
        endCoordinates: { height: 280 },
      });
    });
    expect(screen.queryByRole("button", { name: "Ещё" })).toBeNull();
    expect(screen.getByLabelText("Поиск слов").props.value).toBe("Buch");
    act(() => {
      DeviceEventEmitter.emit("keyboardDidHide", {});
    });
    expect(screen.getByRole("button", { name: "Ещё" })).toBeTruthy();
    expect(screen.getByLabelText("Поиск слов").props.value).toBe("Buch");
    await waitFor(() =>
      expect(screen.getByText("das Buch — книга")).toBeTruthy(),
    );
  } finally {
    h.unmount();
    h.close();
  }
});

test("more_keeps_restore_available_without_profile_and_blocks_profile_specific_sections", async () => {
  const h = await openApp(false);
  try {
    expect(screen.getByRole("button", { name: "Словарь" })).toBeDisabled();
    fireEvent.press(screen.getByRole("button", { name: "Ещё" }));
    expect(screen.getByRole("button", { name: "Повторение" })).toBeDisabled();
    fireEvent.press(screen.getByRole("button", { name: "Перенос данных" }));
    expect(
      screen.getByRole("button", { name: "Выбрать резервную копию" }),
    ).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Выбрать CSV" })).toBeDisabled();
  } finally {
    h.unmount();
    h.close();
  }
});
