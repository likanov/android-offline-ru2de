import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { openTestDb } from "../sqlite";
import { migrate } from "../../src/core/migrations";
import {
  createProfile,
  getActiveProfile,
} from "../../src/features/profiles/profileRepository";
import { AppServicesContext } from "../../src/app/AppServices";
import { ActiveProfileProvider } from "../../src/app/ActiveProfileProvider";
import { ProfilesScreen } from "../../src/features/profiles/ProfilesScreen";

function collectTestIds(node: unknown, result: string[] = []): string[] {
  if (!node || typeof node !== "object") return result;
  if (Array.isArray(node)) {
    for (const child of node) collectTestIds(child, result);
    return result;
  }
  const typed = node as { props?: { testID?: string }; children?: unknown[] };
  if (typed.props?.testID) result.push(typed.props.testID);
  if (typed.children) collectTestIds(typed.children, result);
  return result;
}
test("selects_a_profile_and_displays_the_saved_choice", async () => {
  const { db, close } = openTestDb();
  await migrate(db);
  const first = await createProfile(db, "Антон");
  await createProfile(db, "Мария");
  render(
    <AppServicesContext.Provider value={{ db }}>
      <ActiveProfileProvider>
        <ProfilesScreen />
      </ActiveProfileProvider>
    </AppServicesContext.Provider>,
  );
  fireEvent.press(await screen.findByRole("button", { name: "Выбрать Антон" }));
  await waitFor(() =>
    expect(screen.getByText("Активный профиль: Антон")).toBeTruthy(),
  );
  expect(await getActiveProfile(db)).toMatchObject({ id: first.id });
  close();
});
test("creates_and_renames_a_profile_from_the_screen", async () => {
  const { db, close } = openTestDb();
  await migrate(db);
  render(
    <AppServicesContext.Provider value={{ db }}>
      <ActiveProfileProvider>
        <ProfilesScreen />
      </ActiveProfileProvider>
    </AppServicesContext.Provider>,
  );
  fireEvent.changeText(
    await screen.findByLabelText("Имя нового профиля"),
    "  Антон ",
  );
  fireEvent.press(screen.getByRole("button", { name: "Создать профиль" }));
  await screen.findByText("Активный профиль: Антон");
  fireEvent.press(screen.getByRole("button", { name: "Переименовать Антон" }));
  fireEvent.changeText(screen.getByLabelText("Новое имя профиля"), "Антон 2");
  fireEvent.press(screen.getByRole("button", { name: "Сохранить имя" }));
  await screen.findByText("Активный профиль: Антон 2");
  expect(await getActiveProfile(db)).toMatchObject({ name: "Антон 2" });
  close();
});

test("new_profile_form_stays_before_restored_profile_list_with_stable_targets", async () => {
  const { db, close } = openTestDb();
  await migrate(db);
  for (const name of ["Регрессия UI", "Регрессия — 20 UI", "Регрессия — переучивание"]) {
    await createProfile(db, name);
  }
  const view = render(
    <AppServicesContext.Provider value={{ db }}>
      <ActiveProfileProvider>
        <ProfilesScreen />
      </ActiveProfileProvider>
    </AppServicesContext.Provider>,
  );
  await screen.findByTestId("profile-new-name");
  await screen.findByTestId("profile-create");
  await screen.findByTestId("profile-rename-регрессия-ui");
  const ids = collectTestIds(view.toJSON());
  expect(ids.indexOf("profile-new-name")).toBeLessThan(
    ids.indexOf("profile-rename-регрессия-ui"),
  );
  close();
});
