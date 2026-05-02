import { describe, expect, it } from "vitest";
import { getAuthHeaders } from "./headers.js";

describe("getAuthHeaders", () => {
  it("keeps ignored protocol headers out of auth detection", () => {
    const result = getAuthHeaders([
      { name: "Sec-WebSocket-Key", value: "abc" },
      { name: "Authorization", value: "Bearer token" },
      { name: "X-CSRF-Token", value: "csrf" },
      { name: "X-CSRFToken", value: "csrf" },
    ]);

    expect(result).toEqual(["Authorization", "X-CSRF-Token", "X-CSRFToken"]);
  });
});
