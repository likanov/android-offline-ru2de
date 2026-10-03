const common = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/test/harness.ts"],
};
module.exports = {
  projects: [
    {
      ...common,
      displayName: "sql",
      testMatch: ["<rootDir>/test/integration/**/*.test.ts"],
    },
    {
      ...common,
      displayName: "ui",
      testMatch: ["<rootDir>/test/ui/**/*.test.tsx"],
    },
  ],
};
