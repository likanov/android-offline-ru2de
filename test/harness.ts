jest.mock("expo-crypto", () => ({
  randomUUID: () => jest.requireActual("crypto").randomUUID(),
}));
