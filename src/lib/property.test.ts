import { describe, expect, it } from "vitest";
import { PROPERTY_TYPES, propertyWord } from "./constants";

describe("property type", () => {
  it("offers exactly the owner's nine property types", () => {
    expect(PROPERTY_TYPES).toEqual(["Hotel", "Resort", "Homestay", "Glamping/Camp", "Clinic", "Restaurant", "Bar", "Cafe", "Other"]);
  });
  it("says 'property' instead of 'hotel' for non-hotels", () => {
    expect(propertyWord("Clinic")).toBe("property");
    expect(propertyWord("Restaurant")).toBe("property");
    expect(propertyWord("Bar")).toBe("property");
  });
  it("keeps 'hotel' for hotels, resorts and unknown types", () => {
    expect(propertyWord("Hotel")).toBe("hotel");
    expect(propertyWord("Resort")).toBe("hotel");
    expect(propertyWord(null)).toBe("hotel");
  });
});
