import { describe, it, expect } from "vitest";
import { normalizar, coincide } from "./busqueda";

describe("normalizar", () => {
  it("pasa a minúsculas y quita tildes/diéresis", () => {
    expect(normalizar("Mojito Jäger")).toBe("mojito jager");
    expect(normalizar("DAIQUIRÍ")).toBe("daiquiri");
  });
});

describe("coincide", () => {
  it("encuentra por prefijo sin distinguir acentos ni mayúsculas", () => {
    expect(coincide("Mojito Jäger", "moji")).toBe(true);
    expect(coincide("Daiquirí", "daiq")).toBe(true);
    expect(coincide("Heineken", "cerveza")).toBe(false);
  });
});
