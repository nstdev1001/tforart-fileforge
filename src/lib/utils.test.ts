import { describe, expect, it } from "vitest";

import { formatBytes } from "@/lib/utils";

describe("formatBytes", () => {
  it("formats zero and invalid values safely", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });

  it("selects a readable binary unit", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(12 * 1024 * 1024)).toBe("12 MB");
  });
});

