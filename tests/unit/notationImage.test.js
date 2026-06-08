import { describe, it, expect } from "vitest";
import { getNotationImagePath } from "../../src/utils/notationImage.js";

describe("getNotationImagePath", () => {
  it("builds a lowercase path from the (already-lowercase) lesson song id", () => {
    expect(getNotationImagePath("lesson1-a-b-c")).toBe(
      "Letter Note Notation/lesson1-a-b-c.png"
    );
    expect(getNotationImagePath("lesson1-first-song")).toBe(
      "Letter Note Notation/lesson1-first-song.png"
    );
    expect(getNotationImagePath("lesson2-uke-blues")).toBe(
      "Letter Note Notation/lesson2-uke-blues.png"
    );
    expect(getNotationImagePath("lesson2-bleacher-rock")).toBe(
      "Letter Note Notation/lesson2-bleacher-rock.png"
    );
  });

  it("normalises a mixed-case 'Lesson' prefix to all-lowercase", () => {
    expect(getNotationImagePath("Lesson1-rockin-the-a-string")).toBe(
      "Letter Note Notation/lesson1-rockin-the-a-string.png"
    );
    expect(getNotationImagePath("Lesson2-e-f-g")).toBe(
      "Letter Note Notation/lesson2-e-f-g.png"
    );
  });

  it("returns null for ids that don't start with 'lesson' (regular songs with real lyrics)", () => {
    expect(getNotationImagePath("lenka-the-show")).toBeNull();
    expect(getNotationImagePath("pink-sweats-at-my-worst")).toBeNull();
    expect(getNotationImagePath("happy-birthday")).toBeNull();
  });

  it("returns null for empty / non-string / nullish input", () => {
    expect(getNotationImagePath("")).toBeNull();
    expect(getNotationImagePath(null)).toBeNull();
    expect(getNotationImagePath(undefined)).toBeNull();
    expect(getNotationImagePath(123)).toBeNull();
  });
});
