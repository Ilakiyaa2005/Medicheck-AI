import { describe, it, expect } from "vitest";
import { isMedicineNameAllowed } from "../lib/medicineGuard";

describe("medicineGuard.js keyword validation tests", () => {
  it("allows genuine pharmaceuticals whose names contain bad-word substrings", () => {
    // "Carvedilol" contains "car"
    expect(isMedicineNameAllowed("Carvedilol").allowed).toBe(true);

    // "Carbamazepine" contains "car"
    expect(isMedicineNameAllowed("Carbamazepine").allowed).toBe(true);

    // "Calcium carbonate" contains "car"
    expect(isMedicineNameAllowed("Calcium carbonate").allowed).toBe(true);

    // "Levocarnitine" contains "car"
    expect(isMedicineNameAllowed("Levocarnitine").allowed).toBe(true);

    // Other real pharmaceutical names
    expect(isMedicineNameAllowed("Paracetamol 650").allowed).toBe(true);
    expect(isMedicineNameAllowed("Metformin Hydrochloride").allowed).toBe(true);
    expect(isMedicineNameAllowed("Amoxicillin and Clavulanate").allowed).toBe(true);
    expect(isMedicineNameAllowed("Pantoprazole 40mg").allowed).toBe(true);
  });

  it("rejects non-medicine words and objects", () => {
    expect(isMedicineNameAllowed("cat").allowed).toBe(false);
    expect(isMedicineNameAllowed("car").allowed).toBe(false);
    expect(isMedicineNameAllowed("tea").allowed).toBe(false);
    expect(isMedicineNameAllowed("green tea").allowed).toBe(false);
    expect(isMedicineNameAllowed("my fast car").allowed).toBe(false);
    expect(isMedicineNameAllowed("cute dog").allowed).toBe(false);
    expect(isMedicineNameAllowed("apple fruit").allowed).toBe(false);
    expect(isMedicineNameAllowed("snack biscuit").allowed).toBe(false);
  });

  it("rejects empty, whitespace, or invalid inputs", () => {
    expect(isMedicineNameAllowed("").allowed).toBe(false);
    expect(isMedicineNameAllowed("   ").allowed).toBe(false);
    expect(isMedicineNameAllowed(null).allowed).toBe(false);
    expect(isMedicineNameAllowed(undefined).allowed).toBe(false);
  });
});
