// Hermes gateway JSON-RPC 客户端单测（fake socket 注入）
import { createHermesGatewayHandle, normalizeGatewayNotification } from "@/services/hermes-gateway-client";

class FakeGatewaySocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  sent: string[] = [];
  private listeners: Record<string, Array<(ev: unknown) => void>> = {};
  addEventListener(type: string, cb: (ev: unknown) => void): void {
    (this.listeners[type] ||= []).push(cb);
  }
  removeEventListener(type: string, cb: (ev: unknown) => void): void {
    this.listeners[type] = (this.listeners[type] || []).filter((x) => x !== cb);
  }
  send(data: string): void { this.sent.push(data); }
  close(): void { this.readyState = 3; this.emit("close", {}); }
  emit(type: string, ev: unknown): void { (this.listeners[type] || []).forEach((cb) => cb(ev)); }
  open(): void { this.readyState = 1; this.emit("open", {}); }
  message(data: unknown): void { this.emit("message", { data: typeof data === "string" ? data : JSON.stringify(data) }); }
}

function makeHandle() {
  const socket = new FakeGatewaySocket();
  const gw = createHermesGatewayHandle({
    wsUrl: async () => ({ wsUrl: "ws://127.0.0.1:8642/api/ws?token=tok" }),
    socketFactory: (() => socket) as unknown as (url: string) => WebSocket,
  });
  return { socket, gw };
}

describe("normalizeGatewayNotification", () => {
  it("type 直传", () => {
    expect(normalizeGatewayNotification({ type: "message.delta", payload: { text: "hi" }, session_id: "s1" }))
      .toEqual({ type: "message.delta", payload: { text: "hi" }, session_id: "s1" });
  });
  it("method:'event' + params", () => {
    expect(normalizeGatewayNotification({ method: "event", params: { type: "tool.start", payload: {}, session_id: "s2" } }))
      .toEqual({ type: "tool.start", payload: {}, session_id: "s2" });
  });
  it("method 直传", () => {
    expect(normalizeGatewayNotification({ method: "clarify.request", params: { payload: {} } }))
      .toEqual({ type: "clarify.request", payload: {} });
  });
  it("非对象返回 null", () => {
    expect(normalizeGatewayNotification(null)).toBeNull();
    expect(normalizeGatewayNotification("x")).toBeNull();
  });
});

describe("createHermesGatewayHandle", () => {
  it("connect -> request 返回 result；onEvent 收到通知", async () => {
    const { socket, gw } = makeHandle();
    const events: Array<{ type: string }> = [];
    gw.onEvent((e) => events.push(e));

    const connP = gw.connect();
    await new Promise((r) => setTimeout(r, 0));
    socket.open();
    const conn = await connP;
    expect(conn.ok).toBe(true);
    expect(gw.connected).toBe(true);

    const reqP = gw.request("slash.exec", { command: "/web 查今天天气" });
    // 读取已发送的请求 id
    const sent = JSON.parse(socket.sent[socket.sent.length - 1]) as { id: number; method: string };
    expect(sent.method).toBe("slash.exec");
    socket.message({ jsonrpc: "2.0", id: sent.id, result: { result_text: "天气晴" } });
    const r = await reqP;
    expect(r.ok).toBe(true);
    expect((r.result as { result_text: string }).result_text).toBe("天气晴");

    socket.message({ type: "message.delta", payload: { text: "正在查" } });
    expect(events.some((e) => e.type === "message.delta")).toBe(true);
  });

  it("未连接时 request 返回 error", async () => {
    const { gw } = makeHandle();
    const r = await gw.request("slash.exec", {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/未连接/);
  });

  it("wsUrl 错误时 connect 返回 error", async () => {
    const gw = createHermesGatewayHandle({
      wsUrl: async () => ({ error: "token 缺失" }),
      socketFactory: (() => new FakeGatewaySocket()) as unknown as (url: string) => WebSocket,
    });
    const conn = await gw.connect();
    expect(conn.ok).toBe(false);
    expect(conn.error).toMatch(/token 缺失/);
  });
});
