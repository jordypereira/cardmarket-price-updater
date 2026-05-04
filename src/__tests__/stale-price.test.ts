import { describe, expect, it } from "vitest";
import { shouldShowAcceptButton } from "../content/accept-visibility";

describe("shouldShowAcceptButton", () => {
  it("shows Accept when value is fresh and different", () => {
    expect(shouldShowAcceptButton(true, false)).toBe(true);
  });

  it("hides Accept when value is fresh but unchanged", () => {
    expect(shouldShowAcceptButton(true, true)).toBe(false);
  });

  it("hides Accept when value is stale even if different (regression)", () => {
    expect(shouldShowAcceptButton(false, false)).toBe(false);
  });

  it("hides Accept when value is stale and unchanged", () => {
    expect(shouldShowAcceptButton(false, true)).toBe(false);
  });
});
