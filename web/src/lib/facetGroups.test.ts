import { describe, expect, it } from "vitest";

import { defaultOpen, FACET_OPEN_KEY, LONG_GROUP, readOpenState, writeOpenState } from "./facetGroups";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

const throwing = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("facet group open state", () => {
  it("opens the most-used groups and collapses the rest and long ones", () => {
    expect(defaultOpen("setting", 12)).toBe(true);
    expect(defaultOpen("people", 3)).toBe(true);
    expect(defaultOpen("detail", 5)).toBe(false);
    expect(defaultOpen("wardrobe", 5)).toBe(false);
    expect(defaultOpen("setting", LONG_GROUP + 1)).toBe(false);
  });

  it("remembers each group without forgetting the others", () => {
    const storage = memoryStorage();
    writeOpenState(storage, "setting", false);
    writeOpenState(storage, "detail", true);
    expect(readOpenState(storage)).toEqual({ setting: false, detail: true });
    writeOpenState(storage, "setting", true);
    expect(readOpenState(storage)).toEqual({ setting: true, detail: true });
  });

  it("ignores corrupt or foreign values", () => {
    expect(readOpenState(memoryStorage({ [FACET_OPEN_KEY]: "{not json" }))).toEqual({});
    expect(readOpenState(memoryStorage({ [FACET_OPEN_KEY]: "[true]" }))).toEqual({});
    expect(readOpenState(memoryStorage({ [FACET_OPEN_KEY]: '{"setting":"yes","lighting":false}' }))).toEqual({
      lighting: false,
    });
  });

  it("survives storage that is missing or throws", () => {
    expect(readOpenState(undefined)).toEqual({});
    expect(readOpenState(throwing)).toEqual({});
    expect(() => writeOpenState(throwing, "setting", true)).not.toThrow();
    expect(() => writeOpenState(undefined, "setting", true)).not.toThrow();
  });
});
