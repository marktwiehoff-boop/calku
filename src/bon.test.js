import { describe, it, expect } from "vitest";
import { BON_BREITE } from "./bon.js";

describe("bon", () => {
  it("kennt die Bonbreite", () => {
    expect(BON_BREITE).toBe(42);
  });
});
