// Hermes 本地健康探测单测（mock global fetch）
import { checkHealth } from "@/services/hermes-local";

describe("checkHealth", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("api/health 返回 200 + ok:true → true", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, version: "0.20.5" }),
    }) as unknown as typeof fetch;
    await expect(checkHealth()).resolves.toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/health"),
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("api/health 返回 200 但 ok 非 true → false", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false }),
    }) as unknown as typeof fetch;
    await expect(checkHealth()).resolves.toBe(false);
  });

  it("api/health 返回非 200 → false", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: true }),
    }) as unknown as typeof fetch;
    await expect(checkHealth()).resolves.toBe(false);
  });

  it("fetch 抛错 → false", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    await expect(checkHealth()).resolves.toBe(false);
  });
});