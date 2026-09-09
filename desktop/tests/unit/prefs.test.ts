// Hermes 对话页本地偏好持久化单测
import { readLocalPref, writeLocalPref, normalizePersonaId, normalizeMemoryTarget, PERSONA_STORAGE_KEY } from "@/pages/HermesChat/prefs";

describe("Hermes 对话页本地偏好", () => {
  beforeEach(() => window.localStorage.clear());

  it("write/read roundtrip", () => {
    writeLocalPref(PERSONA_STORAGE_KEY, "zhongshu");
    expect(readLocalPref(PERSONA_STORAGE_KEY)).toBe("zhongshu");
  });

  it("缺失 key 返回空串", () => {
    expect(readLocalPref("missing")).toBe("");
  });

  it("normalizePersonaId 去空格、空回默认", () => {
    expect(normalizePersonaId("  zhongshu  ")).toBe("zhongshu");
    expect(normalizePersonaId("")).toBe("");
    expect(normalizePersonaId("   ")).toBe("");
  });

  it("normalizeMemoryTarget 仅 profile/memory", () => {
    expect(normalizeMemoryTarget("memory")).toBe("memory");
    expect(normalizeMemoryTarget("profile")).toBe("profile");
    expect(normalizeMemoryTarget("xxx")).toBe("profile");
    expect(normalizeMemoryTarget("")).toBe("profile");
  });
});
