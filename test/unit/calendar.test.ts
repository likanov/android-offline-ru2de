import { addDays, localDay } from "../../src/core/calendar";
import { AppError } from "../../src/core/errors";

// Catches elapsed-time arithmetic, month overflow and accepting impossible dates.
test.each([
  ["2026-10-24", 1, "2026-10-25"],
  ["2026-10-25", 1, "2026-10-26"],
  ["2026-03-28", 1, "2026-03-29"],
  ["2026-03-29", 1, "2026-03-30"],
  ["2028-02-28", 1, "2028-02-29"],
  ["2026-12-31", 1, "2027-01-01"],
  ["2026-03-01", -1, "2026-02-28"],
  ["0099-12-31", 1, "0100-01-01"],
])("adds calendar days %s + %i", (day, count, expected) => {
  expect(addDays(day, count)).toBe(expected);
});
test.each(["2026-02-29", "2026-04-31", "2026-13-01", "2026-1-01", "garbage"])(
  "rejects invalid day %s",
  (day) => {
    expect(() => addDays(day, 0)).toThrow(AppError);
    try {
      addDays(day, 0);
    } catch (error) {
      expect(error).toMatchObject({ code: "VALIDATION" });
    }
  },
);
test.each([0.5, NaN, Infinity])("rejects invalid offset %s", (count) => {
  expect(() => addDays("2026-10-03", count)).toThrow(AppError);
});
// Catches using UTC components instead of the caller's local date components.
test("localDay uses local calendar components", () => {
  expect(localDay(new Date(2026, 9, 3, 0, 15))).toBe("2026-10-03");
  expect(localDay(new Date(2026, 9, 3, 23, 45))).toBe("2026-10-03");
});
test("rejects invalid clock input", () => {
  expect(() => localDay(new Date(NaN))).toThrow(AppError);
});
