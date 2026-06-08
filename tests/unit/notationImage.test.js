import { describe, it, expect } from "vitest";
import { getNotationImagePath } from "../../src/utils/notationImage.js";

describe("getNotationImagePath", () => {
  it("normalises a lowercase 'lesson' prefix to 'Lesson' and keeps the rest of the id", () => {
    expect(getNotationImagePath("lesson1-a-b-c")).toBe(
      "Letter Note Notation/Lesson1-a-b-c.png"
    );
    expect(getNotationImagePath("lesson1-first-song")).toBe(
      "Letter Note Notation/Lesson1-first-song.png"
    );
    expect(getNotationImagePath("lesson2-uke-blues")).toBe(
      "Letter Note Notation/Lesson2-uke-blues.png"
    );
    expect(getNotationImagePath("lesson2-bleacher-rock")).toBe(
      "Letter Note Notation/Lesson2-bleacher-rock.png"
    );
  });

  it("keeps an already-correct 'Lesson' prefix as-is", () => {
    expect(getNotationImagePath("Lesson1-rockin-the-a-string")).toBe(
      "Letter Note Notation/Lesson1-rockin-the-a-string.png"
    );
    expect(getNotationImagePath("Lesson2-e-f-g")).toBe(
      "Letter Note Notation/Lesson2-e-f-g.png"
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
