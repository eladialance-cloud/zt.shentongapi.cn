// 鏈湴鏈嶅姟绠＄悊鍣?- 绠＄悊 OpenClaw / N8N / MCP Gateway / Hermes Agent 鍥涗釜鏈湴鏈嶅姟杩涚▼
//
// 瀹炵幇璇存槑锛圱ask 16锛夛細
// - 涓変釜鏈嶅姟鍧囬€氳繃 child_process.spawn 鍚姩瀛愯繘绋?
// - 鍚姩鍛戒护鍙厤缃紙SERVICE_COMMANDS锛夛紝鎸夊€欓€夊懡浠や緷娆″皾璇?
// - 姣忕閲囨牱 CPU/鍐呭瓨锛圵indows: wmic / Linux: /proc/<pid>/stat锛?
// - 寮傚父閫€鍑鸿嚜鍔ㄩ噸鍚紙鏈€澶?5 娆★紝闂撮殧 5 绉掞級锛岃秴杩囧悗 emit 'service-error'
// - 鐘舵€佸彉鏇?emit 'status-changed'锛岀敱涓昏繘绋嬪叆鍙ｈ浆鍙戝埌娓叉煋杩涚▼

import { EventEmitter } from "node:events";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import type {
  ServiceName,
  ServiceStatus,
  ServiceInfo,
  ServiceEnvCheck,
  ServiceErrorPayload,
} from "../shared/types";
import { resolve, verifyAll } from "./runtime-resolver";

interface ServiceDef {
  displayName: string;
  port: number;
}

const SERVICE_DEFS: Record<ServiceName, ServiceDef> = {
  openclaw: { displayName: "OpenClaw", port: 51096 },
  n8n: { displayName: "N8N", port: 5678 },
  mcp: { displayName: "MCP Gateway", port: 3100 },
  hermes: { displayName: "Hermes Agent", port: 8642 },
};

/** N8N 瀛愯繘绋嬬幆澧冨彉閲?*/
const N8N_ENV: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  SYSTEMROOT: process.env.SYSTEMROOT,
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
  USERPROFILE: process.env.USERPROFILE,
  HOME: process.env.HOME,
  N8N_HOST: "127.0.0.1",
  N8N_PORT: "5678",
  N8N_PROTOCOL: "http",
  N8N_EDITOR_BASE_URL: "http://127.0.0.1:5678",
  N8N_DIAGNOSTICS_ENABLED: "false",
  GENERIC_TIMEZONE: "Asia/Shanghai",
};

/** MCP 瀛愯繘绋嬬幆澧冨彉閲?*/
const MCP_ENV: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  SYSTEMROOT: process.env.SYSTEMROOT,
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
  USERPROFILE: process.env.USERPROFILE,
  HOME: process.env.HOME,
  MCP_PORT: "3100",
  MCP_HOST: "127.0.0.1",
};

/** 鑷姩閲嶅惎閰嶇疆 */
const MAX_RESTART_RETRIES = 5;
const RESTART_INTERVAL_MS = 5000;
const MAX_LOG_LINES = 200;

/** 绔彛杩為€氭€ф娴?*/
function isPortListening(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    setTimeout(() => done(false), 1000);
  });
}

/** 绛夊緟绔彛灏辩华锛堣疆璇級 */
async function waitForPort(
  port: number,
  timeoutMs = 30000,
  intervalMs = 1000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortListening(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

/** 杩涚▼鎸囨爣閲囨牱缁撴灉 */
interface ProcessMetrics {
  /** CPU 绱鏃堕棿锛堟绉掞紝user+kernel锛?*/
  cpuTimeMs: number;
  /** 鍐呭瓨鍗犵敤锛堝瓧鑺傦級 */
  memBytes: number;
}

/** 璇诲彇鍗曚釜杩涚▼鐨勭疮璁?CPU 鏃堕棿涓庡唴瀛橈紙璺ㄥ钩鍙帮紝best-effort锛?*/
function sampleProcess(pid: number): Promise<ProcessMetrics | null> {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      // wmic /format:list 杈撳嚭 Key=Value 褰㈠紡锛屾洿鏄撹В鏋?
      execFile("wmic", ["process", "where", `ProcessId=${pid}`, "get", "UserModeTime,KernelModeTime,WorkingSetSize", "/format:list"],
        { windowsHide: true, timeout: 2000 },
        (err, stdout) => {
          if (err || !stdout) return resolve(null);
          const map: Record<string, string> = {};
          for (const line of stdout.split(/\r?\n/)) {
            const idx = line.indexOf("=");
            if (idx > 0) {
              const key = line.slice(0, idx).trim();
              const val = line.slice(idx + 1).trim();
              if (key) map[key] = val;
            }
          }
          const user = Number(map.UserModeTime) || 0;
          const kernel = Number(map.KernelModeTime) || 0;
          const ws = Number(map.WorkingSetSize) || 0;
          // wmic 鏃堕棿鍗曚綅涓?100ns锛岃浆鎹负姣
          const cpuTimeMs = (user + kernel) / 10000;
          if (!cpuTimeMs && !ws) return resolve(null);
          resolve({ cpuTimeMs, memBytes: ws });
        },
      );
    } else {
      // Linux: /proc/<pid>/stat
      execFile("cat", [`/proc/${pid}/stat`], { timeout: 2000 }, (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const fields = stdout.trim().split(" ");
        // utime=14, stime=15, rss=24锛堜粠 0 寮€濮嬭鏁帮級
        const utime = parseInt(fields[13], 10) || 0;
        const stime = parseInt(fields[14], 10) || 0;
        const rss = parseInt(fields[23], 10) || 0;
        const clkTck = 100;
        const cpuTimeMs = ((utime + stime) / clkTck) * 1000;
        const memBytes = rss * 4096;
        resolve({ cpuTimeMs, memBytes });
      });
    }
  });
}

export class ServiceManager extends EventEmitter {
  private services: Map<ServiceName, ServiceInfo> = new Map();
  /** 杩愯涓殑瀛愯繘绋?*/
  private processes: Map<ServiceName, ChildProcess> = new Map();
  /** 涓诲姩鍋滄鏍囪锛堥伩鍏嶈Е鍙戣嚜鍔ㄩ噸鍚級 */
  private intentionalStop: Set<ServiceName> = new Set();
  /** 鑷姩閲嶅惎宸查噸璇曟鏁?*/
  private restartCounts: Map<ServiceName, number> = new Map();
  /** stdout/stderr log buffer per service (capped at  lines) */
  private logBuffers: Map<ServiceName, string[]> = new Map();
  /** 涓婁竴娆?CPU 閲囨牱锛堢敤浜庡樊鍊艰绠?CPU%锛?*/
  private lastCpuSample: Map<ServiceName, { time: number; cpuMs: number }> =
    new Map();
  /** metrics 閲囨牱瀹氭椂鍣?*/
  private metricsTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    for (const [name, def] of Object.entries(SERVICE_DEFS)) {
      this.services.set(name as ServiceName, {
        name: name as ServiceName,
        displayName: def.displayName,
        status: "unknown",
        port: def.port,
      });
    }
    this.startMetricsSampler();
  }

  /** 鍚姩姣忕 metrics 閲囨牱 */
  private startMetricsSampler(): void {
    if (this.metricsTimer) return;
    this.metricsTimer = setInterval(() => {
      void this.sampleAllMetrics();
    }, 1000);
    // 涓嶉樆姝㈣繘绋嬮€€鍑?
    if (typeof this.metricsTimer.unref === "function") {
      this.metricsTimer.unref();
    }
  }

  /** 閲囨牱鎵€鏈夎繍琛屼腑鏈嶅姟鐨?CPU/鍐呭瓨 */
  private async sampleAllMetrics(): Promise<void> {
    for (const [name, child] of this.processes) {
      const pid = child.pid;
      if (!pid) continue;
      const info = this.services.get(name);
      if (!info || info.status !== "running") continue;
      try {
        const sample = await sampleProcess(pid);
        if (!sample) continue;
        const now = Date.now();
        const last = this.lastCpuSample.get(name);
        let cpuPercent: number | undefined;
        if (last) {
          const dt = now - last.time;
          const dCpu = sample.cpuTimeMs - last.cpuMs;
          if (dt > 0)
            cpuPercent = Math.max(0, Math.min(100, (dCpu / dt) * 100));
        }
        this.lastCpuSample.set(name, { time: now, cpuMs: sample.cpuTimeMs });
        info.cpuUsage = cpuPercent;
        info.memoryUsage =
          Math.round((sample.memBytes / 1024 / 1024) * 10) / 10;
      } catch {
        // 閲囨牱澶辫触蹇界暐
      }
    }
  }

  getAllStatus(): Record<ServiceName, ServiceStatus> {
    const result = {} as Record<ServiceName, ServiceStatus>;
    for (const [name, info] of this.services) {
      result[name] = info.status;
    }
    return result;
  }

  getStatus(name: ServiceName): ServiceStatus {
    return this.services.get(name)?.status ?? "unknown";
  }

  /** 妫€娴嬫湇鍔＄湡瀹炶繍琛岀姸鎬侊紙绔彛鏄惁鐩戝惉锛?*/
  async getServiceStatus(name: ServiceName): Promise<ServiceStatus> {
    const info = this.services.get(name);
    if (!info) return "unknown";
    const listening = await isPortListening(info.port);
    if (listening && info.status !== "running") {
      info.status = "running";
      this.emitStatus(name);
    } else if (!listening && info.status === "running") {
      info.status = this.processes.has(name) ? "unknown" : "stopped";
      this.emitStatus(name);
    }
    return info.status;
  }

  getInfo(name: ServiceName): ServiceInfo | undefined {
    return this.services.get(name);
  }

  getAllInfo(): ServiceInfo[] {
    return Array.from(this.services.values());
  }

  async start(name: ServiceName): Promise<boolean> {
    const info = this.services.get(name);
    if (!info) return false;

    // 宸插湪杩愯锛氱洿鎺ヨ繑鍥炴垚鍔?
    if (info.status === "running" && (await isPortListening(info.port))) {
      return true;
    }

    // 閲嶇疆閲嶈瘯璁℃暟
    this.restartCounts.delete(name);
    this.intentionalStop.delete(name);

    try {
      return await this.spawnService(name, info);
    } catch (err) {
      console.error(`[service-manager] start ${name} failed:`, err);
      info.status = "error";
      info.error = err instanceof Error ? err.message : String(err);
      this.emitStatus(name);
      return false;
    }
  }

  /** spawn 瀛愯繘绋嬪苟绛夊緟绔彛灏辩华 */
  private async spawnService(
    name: ServiceName,
    info: ServiceInfo,
  ): Promise<boolean> {
    // 濡傛灉绔彛宸茬粡鍦ㄧ洃鍚紙澶栭儴宸插惎鍔級锛岀洿鎺ョ疆涓?running
    if (await isPortListening(info.port)) {
      info.status = "running";
      info.startTime = new Date().toISOString();
      this.emitStatus(name);
      return true;
    }

    // Buffer to collect stderr output for error diagnostics
    let stderrBuf = "";
    
    const resolved = resolve(name);
    if (!resolved) {
      info.status = "error";
      info.error = "杩愯鏃舵湭瀹夎";
      this.emitStatus(name);
      return false;
    }

    // Hermes requires Python 3.11+ - use bundled Python if available
    if (name === "hermes") {
      const { spawnSync } = await import("node:child_process");
      const fs = await import("node:fs");
      const pathMod = await import("node:path");
      
      // Priority: bundled Python > system PATH
      let pythonCmd = "python";
      const hermesDir = resolved?.cmd ? pathMod.dirname(resolved.cmd) : "";
      const bundledPyPath = pathMod.join(hermesDir, "..", "python", "python.exe");
      if (fs.existsSync(bundledPyPath)) {
        pythonCmd = bundledPyPath;
      }
      
      const pythonCheck = spawnSync(pythonCmd, ["-c", "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)"], { timeout: 5000, windowsHide: true });
      if (pythonCheck.status !== 0) {
        const py3Check = spawnSync("python3", ["-c", "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)"], { timeout: 5000, windowsHide: true });
        if (py3Check.status !== 0) {
          info.status = "error";
          info.error = "Hermes Agent 闇€瑕?Python 3.11+銆傝杩愯 runtime\\hermes\\setup-python.bat 鑷姩瀹夎銆?;
          this.emitStatus(name);
          return false;
        }
        pythonCmd = "python3";
      }
      
      const pipCheck = spawnSync(pythonCmd, ["-c", "import importlib, sys; pkg = importlib.util.find_spec('hermes_cli') or importlib.util.find_spec('hermes_agent'); sys.exit(0 if pkg else 1)"], { timeout: 8000, windowsHide: true });
      if (pipCheck.status !== 0) {
        info.status = "error";
        info.error = "Hermes Python 鍖呮湭瀹夎銆傝杩愯 runtime\\hermes\\setup-python.bat 鑷姩瀹夎銆?;
        this.emitStatus(name);
        return false;
      }
    }

        // 鍚堝苟鐜鍙橀噺锛歂8N_ENV / MCP_ENV 浼樺厛浜?resolved.env
    const env =
      name === "n8n"
        ? { ...resolved.env, ...N8N_ENV }
        : name === "mcp"
          ? { ...resolved.env, ...MCP_ENV }
          : resolved.env;

    let child: ChildProcess;
    try {
      child = spawn(resolved.cmd, resolved.args, {
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        shell: process.platform === "win32",
      });
    } catch (err) {
      info.status = "error";
      info.error = `鍚姩 ${info.displayName} 澶辫触: ${err instanceof Error ? err.message : String(err)}`;
      this.emitStatus(name);
      return false;
    }

    // 鏍囪 starting
    info.status = "starting";
    info.error = undefined;
    this.emitStatus(name);

    child.stdout?.on("data", (out: Buffer) => {
      const stdoutLines = this.logBuffers.get(name) ?? [];
      stdoutLines.push(out.toString());
      if (stdoutLines.length > MAX_LOG_LINES) stdoutLines.shift();
      this.logBuffers.set(name, stdoutLines);
    });

    child.stderr?.on("data", (err: Buffer) => {
      const text = err.toString();
      stderrBuf += text;
      const stderrLines = this.logBuffers.get(name) ?? [];
      stderrLines.push(text);
      if (stderrLines.length > MAX_LOG_LINES) stderrLines.shift();
      this.logBuffers.set(name, stderrLines);
    });

    // spawn 閿欒锛堝鍛戒护涓嶅瓨鍦級
    child.once("error", (err) => {
      console.error(`[service-manager] ${name} spawn error:`, err);
      this.processes.delete(name);
      info.status = "error";
      info.error = `鍚姩澶辫触(cmd=${resolved.cmd}): ${err.message}`;
      info.pid = undefined;
      this.emitStatus(name);
    });

    // 瀛愯繘绋嬮€€鍑?
    child.once("exit", (code, signal) => {
      console.warn(
        `[service-manager] ${name} exited: code=${code} signal=${signal}`,
      );
      this.processes.delete(name);
      this.lastCpuSample.delete(name);
      const wasRunning =
        info.status === "running" || info.status === "starting";
      info.pid = undefined;
      info.cpuUsage = undefined;
      info.memoryUsage = undefined;

      // 涓诲姩鍋滄锛氫笉閲嶅惎
      if (this.intentionalStop.has(name)) {
        info.status = "stopped";
        this.emitStatus(name);
        return;
      }

      // 闈炰富鍔ㄩ€€鍑猴細鏍囪 error 骞跺皾璇曡嚜鍔ㄩ噸鍚?
      if (wasRunning) {
        info.status = "error";
        const stderrSnippet = stderrBuf ? stderrBuf.slice(-500).trim() : "";
        const detail = stderrSnippet ? ` | stderr: ${stderrSnippet}` : "";
        info.error = `杩涚▼寮傚父閫€鍑?(code=${code} signal=${signal})${detail}`;
        this.emitStatus(name);
        void this.tryAutoRestart(name);
      }
    });

    this.processes.set(name, child);
    info.pid = child.pid;

    // 绛夊緟绔彛灏辩华锛堟渶澶?30 绉掞級
    const ready = await waitForPort(info.port, 30000, 1000);
    if (ready && this.processes.has(name)) {
      info.status = "running";
      info.startTime = new Date().toISOString();
      this.restartCounts.delete(name);
      this.emitStatus(name);
      return true;
    }

    // 鏈氨缁細淇濈暀杩涚▼缁х画鍚姩锛屾爣璁颁负 starting锛堝墠绔彲缁х画杞锛?
    if (this.processes.has(name)) {
      info.status = "starting";
      this.emitStatus(name);
    }
    return false;
  }

  /** 鑷姩閲嶅惎锛堟渶澶?MAX_RESTART_RETRIES 娆★紝闂撮殧 RESTART_INTERVAL_MS锛?*/
  private async tryAutoRestart(name: ServiceName): Promise<void> {
    if (this.intentionalStop.has(name)) return;
    const count = (this.restartCounts.get(name) ?? 0) + 1;
    this.restartCounts.set(name, count);

    if (count > MAX_RESTART_RETRIES) {
      // 瓒呰繃閲嶈瘯涓婇檺锛氬仠姝㈤噸璇曪紝鎺ㄩ€?error 浜嬩欢
      const info = this.services.get(name);
      const payload: ServiceErrorPayload = {
        name,
        message:
          info?.error ||
          `${info?.displayName ?? name} 鑷姩閲嶅惎澶辫触锛屽凡瓒呰繃鏈€澶ч噸璇曟鏁?(${MAX_RESTART_RETRIES})`,
        retryCount: count - 1,
      };
      console.error(
        `[service-manager] ${name} auto-restart exhausted:`,
        payload.message,
      );
      this.emit("service-error", payload);
      return;
    }

    console.log(
      `[service-manager] ${name} auto-restart attempt ${count}/${MAX_RESTART_RETRIES} in ${RESTART_INTERVAL_MS}ms`,
    );
    await new Promise((resolve) => setTimeout(resolve, RESTART_INTERVAL_MS));
    if (this.intentionalStop.has(name)) return;

    const info = this.services.get(name);
    if (!info) return;
    info.status = "starting";
    info.error = undefined;
    this.emitStatus(name);
    try {
      await this.spawnService(name, info);
    } catch (err) {
      info.status = "error";
      info.error = err instanceof Error ? err.message : String(err);
      this.emitStatus(name);
      void this.tryAutoRestart(name);
    }
  }

  async stop(name: ServiceName): Promise<boolean> {
    const info = this.services.get(name);
    if (!info) return false;

    // 鏍囪涓诲姩鍋滄锛岄伩鍏嶈Е鍙戣嚜鍔ㄩ噸鍚?
    this.intentionalStop.add(name);
    this.restartCounts.delete(name);

    const child = this.processes.get(name);
    if (child) {
      try {
        child.removeAllListeners("exit");
        child.removeAllListeners("error");
        const exited = new Promise<boolean>((resolve) => {
          child.once("exit", () => resolve(true));
          setTimeout(() => {
            try {
              child.kill("SIGKILL");
            } catch {
              // ignore
            }
            resolve(true);
          }, 5000);
        });
        try {
          child.kill("SIGTERM");
        } catch {
          // ignore
        }
        await exited;
      } catch (err) {
        console.warn(`[service-manager] stop ${name} kill failed:`, err);
      } finally {
        this.processes.delete(name);
        this.lastCpuSample.delete(name);
      }
    }

    info.status = "stopped";
    info.pid = undefined;
    info.error = undefined;
    info.cpuUsage = undefined;
    info.memoryUsage = undefined;
    info.startTime = undefined;
    this.logBuffers.delete(name);
    this.emitStatus(name);
    return true;
  }

  async restart(name: ServiceName): Promise<boolean> {
    await this.stop(name);
    // 鐭殏绛夊緟绔彛閲婃斁
    await waitForPort(info.port, 5000, 200);
    this.intentionalStop.delete(name);
    return this.start(name);
  }


  /** Get captured log lines for a service */
  getLogs(name: ServiceName): string[] {
    return this.logBuffers.get(name) ?? [];
  }
  async checkEnvironment(): Promise<ServiceEnvCheck> {
    const result = await verifyAll();
    return { openclaw: result.openclaw, n8n: result.n8n, mcp: result.mcp, hermes: result.hermes };
  }

  async install(
    name: ServiceName,
    onProgress?: (percent: number) => void,
  ): Promise<boolean> {
    const info = this.services.get(name);
    if (!info) return false;
    try {
      const { download } = await import("./runtime-downloader");
      const ok = await download(name, (progress) => {
        onProgress?.(progress.percent);
      });
      if (!ok) {
        info.status = "error";
        info.error = "杩愯鏃朵笅杞藉け璐?;
        this.emitStatus(name);
        return false;
      }
      // 涓嬭浇鎴愬姛鍚庤嚜鍔ㄥ惎鍔?
      return await this.start(name);
    } catch (err) {
      info.status = "error";
      info.error = err instanceof Error ? err.message : String(err);
      this.emitStatus(name);
      return false;
    }
  }

  async startAll(): Promise<void> {
    await Promise.all([
      this.start("openclaw"),
      this.start("n8n"),
      this.start("mcp"),
      this.start("hermes"),
    ]);
  }

  async stopAll(): Promise<void> {
    await Promise.all([
      this.stop("openclaw"),
      this.stop("n8n"),
      this.stop("mcp"),
      this.stop("hermes"),
    ]);
  }

  /** 缁熶竴鍙戦€?status-changed 浜嬩欢 */
  private emitStatus(name: ServiceName): void {
    const info = this.services.get(name);
    if (!info) return;
    this.emit("status-changed", name, info.status, info);
  }
}