import { describe, it, expect } from "vitest";
import { formatTime } from "../../src/utils/formatTime.js";

describe("formatTime", () => {
  it("returns 00:00 for 0 seconds", () => {
    expect(formatTime(0)).toBe("00:00");
  });

  it("formats 65 seconds as 01:05", () => {
    expect(formatTime(65)).toBe("01:05");
  });

  it("formats 3600 seconds as 60:00", () => {
    expect(formatTime(3600)).toBe("60:00");
  });

  it("returns 00:00 for negative input", () => {
    expect(formatTime(-1)).toBe("00:00");
  });

  it("returns 00:00 for NaN", () => {
    expect(formatTime(NaN)).toBe("00:00");
  });

  it("returns 00:00 for Infinity", () => {
    expect(formatTime(Infinity)).toBe("00:00");
  });

  it("pads single-digit minutes and seconds", () => {
    expect(formatTime(61)).toBe("01:01");
  });

  it("truncates decimal seconds (does not round)", () => {
    expect(formatTime(61.9)).toBe("01:01");
  });

  it("formats exactly 59 seconds", () => {
    expect(formatTime(59)).toBe("00:59");
  });
});
