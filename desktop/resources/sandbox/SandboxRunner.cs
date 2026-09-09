using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

// Restricted-token launcher for 深瞳AI 桌面端模块进程沙箱.
// Mirrors @deepseek-ai/dsh-sandbox-windows-acl semantics: WRITE_RESTRICTED token
// spawned via CreateProcessAsUserW (works WITHOUT elevation; CreateProcessWithTokenW
// fails with ERROR_PRIVILEGE_NOT_HELD=1314 for a normal user).
//
// Contract:
//   runner.exe --mode <read-only|workspace-write>
//              --workspace <abs dir>
//              [--writable <abs dir>]...      (workspace-write only; default = workspace)
//              [--temp <abs dir>]             (workspace-write only; sets TMP/TEMP)
//              -- <command> <args...>
//
// Fail-closed: any error prints "shentong-sandbox-run: <detail>" and exits 127.
// The wrapped child is NEVER spawned unrestricted.

class SandboxRunner {
  const uint TOKEN_QUERY = 0x0008;
  const uint TOKEN_DUPLICATE = 0x0002;
  const uint TOKEN_ADJUST_DEFAULT = 0x0080;
  const uint TOKEN_ASSIGN_PRIMARY = 0x0001;
  const uint WRITE_RESTRICTED = 0x10;
  const uint DISABLE_MAX_PRIVILEGE = 0x01;
  const uint LUA_TOKEN = 0x02;
  const uint SE_GROUP_LOGON_ID = 0xC0000000u;
  const int TokenGroups = 2;
  const int TokenDefaultDacl = 6;
  const uint SECURITY_MAX_SID_SIZE = 68;
  const int WinWorldSid = 1;
  const int SE_FILE_OBJECT = 1;
  const int DACL_SECURITY_INFORMATION = 0x4;
  const uint GRANT_ACCESS = 1;
  const uint SUB_CONTAINERS_AND_OBJECTS_INHERIT = 3;
  const uint FILE_ALL_ACCESS = 0x1F01FF;
  const uint HANDLE_FLAG_INHERIT = 1;
  const uint STD_INPUT_HANDLE = 0xFFFFFFF6u;
  const uint STD_OUTPUT_HANDLE = 0xFFFFFFF5u;
  const uint STD_ERROR_HANDLE = 0xFFFFFFF4u;
  const uint CREATE_SUSPENDED = 0x4;
  const uint CREATE_NO_WINDOW = 0x08000000;
  const int TRUSTEE_IS_SID = 0;
  const int TRUSTEE_IS_USER = 1;
  const int NO_MULTIPLE_TRUSTEE = 0;
  const int JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;
  const int JobObjectExtendedLimitInformation = 9;

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct STARTUPINFO {
    public int cb; public string lpReserved; public string lpDesktop; public string lpTitle;
    public int dwX; public int dwY; public int dwXSize; public int dwYSize;
    public int dwXCountChars; public int dwYCountChars; public int dwFillAttribute;
    public int dwFlags; public short wShowWindow; public short cbReserved2;
    public IntPtr lpReserved2; public IntPtr hStdInput; public IntPtr hStdOutput; public IntPtr hStdError;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct PROCESS_INFORMATION { public IntPtr hProcess; public IntPtr hThread; public int dwProcessId; public int dwThreadId; }
  [StructLayout(LayoutKind.Sequential)]
  struct SID_AND_ATTRIBUTES { public IntPtr Sid; public uint Attributes; }
  [StructLayout(LayoutKind.Sequential)]
  struct TRUSTEE { public IntPtr pMultipleTrustee; public int MultipleTrusteeOperation; public int TrusteeForm; public int TrusteeType; public IntPtr ptstrName; }
  [StructLayout(LayoutKind.Sequential)]
  struct EXPLICIT_ACCESS { public uint grfAccessPermissions; public uint grfAccessMode; public uint grfInheritance; public TRUSTEE Trustee; }

  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr GetStdHandle(uint n);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetHandleInformation(IntPtr h, uint mask, uint flags);
  [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr h, out uint code);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern IntPtr CreateJobObjectW(IntPtr a, string name);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int cls, IntPtr info, uint len);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr proc);
  [DllImport("kernel32.dll", SetLastError = true)] static extern uint ResumeThread(IntPtr t);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr proc, uint access, out IntPtr tok);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetTokenInformation(IntPtr tok, int cls, IntPtr info, uint len, out uint needed);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetTokenInformation(IntPtr tok, int cls, byte[] info, uint len, out uint needed);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool SetTokenInformation(IntPtr tok, int cls, byte[] info, uint len);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool CreateWellKnownSid(int type, IntPtr dom, byte[] sid, ref uint len);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool CopySid(uint len, IntPtr dest, IntPtr src);
  [DllImport("advapi32.dll", SetLastError = true)] static extern uint GetLengthSid(IntPtr sid);
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool ConvertStringSidToSidW(string s, out IntPtr sid);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool LocalFree(IntPtr h);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool CreateRestrictedToken(IntPtr existing, uint flags, uint dc, IntPtr s2d, uint dp, IntPtr p2d, uint rc, SID_AND_ATTRIBUTES[] s2r, out IntPtr newtok);
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool CreateProcessAsUserW(IntPtr hTok, string app, string cmd, IntPtr pa, IntPtr ta, bool inh, uint cf, IntPtr env, string cwd, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern int GetNamedSecurityInfoW(string path, int secObj, int secInfo, out IntPtr owner, out IntPtr group, out IntPtr dacl, out IntPtr sacl, out IntPtr sd);
  [DllImport("advapi32.dll", SetLastError = true)] static extern uint SetEntriesInAclW(uint count, EXPLICIT_ACCESS[] entries, IntPtr oldAcl, out IntPtr newAcl);
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern uint SetNamedSecurityInfoW(string path, int secObj, int secInfo, IntPtr owner, IntPtr group, IntPtr dacl, IntPtr sacl);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool SetEnvironmentVariableW(string name, string val);

  static void Fail(string msg) { Console.Error.WriteLine("shentong-sandbox-run: " + msg); Environment.Exit(127); }
  static string WinErr(string op, int code) { return op + " failed (Win32 " + code + ": " + new System.ComponentModel.Win32Exception(code).Message + ")"; }
  static int LastErr() { return Marshal.GetLastWin32Error(); }

  static string DeriveSid(string path) {
    var sha = System.Security.Cryptography.SHA256.Create();
    byte[] d = sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(path));
    uint a = (BitConverter.ToUInt32(d, 0) % (uint)((1 << 30) - 1)) + 1;
    uint b = (BitConverter.ToUInt32(d, 4) % (uint)((1 << 30) - 1)) + 1;
    return "S-1-4-" + a + "-" + b;
  }

  static IntPtr MakeWorldSid() {
    byte[] buf = new byte[SECURITY_MAX_SID_SIZE];
    uint len = SECURITY_MAX_SID_SIZE;
    if (!CreateWellKnownSid(WinWorldSid, IntPtr.Zero, buf, ref len)) Fail(WinErr("CreateWellKnownSid(World)", LastErr()));
    IntPtr p = Marshal.AllocHGlobal((int)len);
    Marshal.Copy(buf, 0, p, (int)len);
    return p;
  }

  static IntPtr MakeSid(string sddl) {
    IntPtr sid;
    if (!ConvertStringSidToSidW(sddl, out sid)) Fail(WinErr("ConvertStringSidToSidW(" + sddl + ")", LastErr()));
    return sid;
  }

  static IntPtr FindLogonSid(IntPtr token) {
    uint needed;
    GetTokenInformation(token, TokenGroups, IntPtr.Zero, 0, out needed);
    if (needed == 0) Fail("GetTokenInformation(TokenGroups) size query returned 0");
    byte[] buf = new byte[needed];
    if (!GetTokenInformation(token, TokenGroups, buf, (uint)buf.Length, out needed)) Fail(WinErr("GetTokenInformation(TokenGroups)", LastErr()));
    uint count = BitConverter.ToUInt32(buf, 0);
    for (uint i = 0; i < count; i++) {
      int off = 8 + (int)(i * 16);
      IntPtr sidPtr = (IntPtr)BitConverter.ToInt64(buf, off);
      uint attrs = BitConverter.ToUInt32(buf, off + 8);
      if ((attrs & SE_GROUP_LOGON_ID) == SE_GROUP_LOGON_ID && sidPtr != IntPtr.Zero) {
        uint len = GetLengthSid(sidPtr);
        if (len == 0) Fail("GetLengthSid(logon SID) returned 0");
        IntPtr copy = Marshal.AllocHGlobal((int)len);
        if (!CopySid(len, copy, sidPtr)) { Marshal.FreeHGlobal(copy); Fail(WinErr("CopySid(logon SID)", LastErr())); }
        return copy;
      }
    }
    Fail("no logon SID found among " + count + " token groups");
    return IntPtr.Zero;
  }

  static void GrantWrite(string path, IntPtr sid) {
    IntPtr owner, group, dacl, sacl, sd;
    int r = GetNamedSecurityInfoW(path, SE_FILE_OBJECT, DACL_SECURITY_INFORMATION, out owner, out group, out dacl, out sacl, out sd);
    if (r != 0) Fail("GetNamedSecurityInfoW(" + path + ") failed (Win32 " + r + ")");
    IntPtr newDacl;
    EXPLICIT_ACCESS[] entries = new EXPLICIT_ACCESS[1];
    TRUSTEE t = new TRUSTEE();
    t.pMultipleTrustee = IntPtr.Zero; t.MultipleTrusteeOperation = NO_MULTIPLE_TRUSTEE; t.TrusteeForm = TRUSTEE_IS_SID; t.TrusteeType = TRUSTEE_IS_USER; t.ptstrName = sid;
    entries[0].Trustee = t; entries[0].grfAccessPermissions = FILE_ALL_ACCESS; entries[0].grfAccessMode = GRANT_ACCESS; entries[0].grfInheritance = SUB_CONTAINERS_AND_OBJECTS_INHERIT;
    r = (int)SetEntriesInAclW(1, entries, dacl, out newDacl);
    if (r != 0) { LocalFree(sd); Fail("SetEntriesInAclW(" + path + ") failed (Win32 " + r + "): " + new System.ComponentModel.Win32Exception(r).Message); }
    r = (int)SetNamedSecurityInfoW(path, SE_FILE_OBJECT, DACL_SECURITY_INFORMATION, IntPtr.Zero, IntPtr.Zero, newDacl, IntPtr.Zero);
    if (r != 0) { LocalFree(newDacl); LocalFree(sd); Fail("SetNamedSecurityInfoW(" + path + ") failed (Win32 " + r + "): " + new System.ComponentModel.Win32Exception(r).Message); }
    LocalFree(newDacl); LocalFree(sd);
  }

  static void SetTokenDefaultDacl(IntPtr token, IntPtr sid) {
    uint needed;
    GetTokenInformation(token, TokenDefaultDacl, IntPtr.Zero, 0, out needed);
    byte[] buf = new byte[Math.Max(needed, 8)];
    if (needed > 0 && !GetTokenInformation(token, TokenDefaultDacl, buf, (uint)buf.Length, out needed)) Fail(WinErr("GetTokenInformation(TokenDefaultDacl)", LastErr()));
    IntPtr curDacl = needed > 0 ? (IntPtr)BitConverter.ToInt64(buf, 0) : IntPtr.Zero;
    if (curDacl == IntPtr.Zero) return;
    IntPtr newDacl;
    EXPLICIT_ACCESS[] entries = new EXPLICIT_ACCESS[1];
    TRUSTEE t = new TRUSTEE();
    t.pMultipleTrustee = IntPtr.Zero; t.MultipleTrusteeOperation = NO_MULTIPLE_TRUSTEE; t.TrusteeForm = TRUSTEE_IS_SID; t.TrusteeType = TRUSTEE_IS_USER; t.ptstrName = sid;
    entries[0].Trustee = t; entries[0].grfAccessPermissions = FILE_ALL_ACCESS; entries[0].grfAccessMode = GRANT_ACCESS; entries[0].grfInheritance = SUB_CONTAINERS_AND_OBJECTS_INHERIT;
    uint r = SetEntriesInAclW(1, entries, curDacl, out newDacl);
    if (r != 0) Fail("SetEntriesInAclW(default DACL) failed (Win32 " + r + ")");
    byte[] info = new byte[8];
    BitConverter.GetBytes((long)newDacl).CopyTo(info, 0);
    if (!SetTokenInformation(token, TokenDefaultDacl, info, 8)) { LocalFree(newDacl); Fail(WinErr("SetTokenInformation(TokenDefaultDacl)", LastErr())); }
    LocalFree(newDacl);
  }

  static void SetJobInfo(IntPtr job) {
    byte[] buf = new byte[144]; // JOBOBJECT_EXTENDED_LIMIT_INFORMATION (x64)
    BitConverter.GetBytes((uint)JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE).CopyTo(buf, 16); // LimitFlags offset 16
    GCHandle g = GCHandle.Alloc(buf, GCHandleType.Pinned);
    try {
      if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, g.AddrOfPinnedObject(), (uint)buf.Length)) Fail(WinErr("SetInformationJobObject", LastErr()));
    } finally { g.Free(); }
  }

  static string QuoteArg(string a) {
    if (a.Length == 0) return "\"\"";
    if (a.IndexOf(' ') < 0 && a.IndexOf('"') < 0) return a;
    System.Text.StringBuilder sb = new System.Text.StringBuilder();
    sb.Append('"');
    for (int i = 0; i < a.Length; i++) {
      int backslashes = 0;
      while (i < a.Length && a[i] == '\\') { backslashes++; i++; }
      if (i == a.Length) { for (int k = 0; k < backslashes * 2; k++) sb.Append('\\'); }
      else if (a[i] == '"') { for (int k = 0; k < backslashes * 2 + 1; k++) sb.Append('\\'); sb.Append('"'); }
      else { for (int k = 0; k < backslashes; k++) sb.Append('\\'); sb.Append(a[i]); }
    }
    sb.Append('"');
    return sb.ToString();
  }

  static string BuildCommandLine(string program, List<string> args) {
    System.Text.StringBuilder sb = new System.Text.StringBuilder();
    sb.Append(QuoteArg(program));
    foreach (string a in args) { sb.Append(' '); sb.Append(QuoteArg(a)); }
    return sb.ToString();
  }

  static void Main(string[] args) {
    try { Run(args); } catch (Exception ex) { Console.Error.WriteLine("shentong-sandbox-run: EX " + ex.GetType().FullName + ": " + ex.Message); Environment.Exit(127); }
  }

  static void Run(string[] args) {
    string mode = "", workspace = "", temp = "";
    List<string> writable = new List<string>();
    int idx = 0;
    while (idx < args.Length) {
      string a = args[idx];
      if (a == "--") { idx++; break; }
      if (a == "--mode") { if (idx + 1 >= args.Length) Fail("--mode requires a value"); mode = args[idx + 1]; idx += 2; }
      else if (a == "--workspace") { if (idx + 1 >= args.Length) Fail("--workspace requires a value"); workspace = args[idx + 1]; idx += 2; }
      else if (a == "--writable") { if (idx + 1 >= args.Length) Fail("--writable requires a value"); writable.Add(args[idx + 1]); idx += 2; }
      else if (a == "--temp") { if (idx + 1 >= args.Length) Fail("--temp requires a value"); temp = args[idx + 1]; idx += 2; }
      else Fail("unknown arg: " + a);
    }
    if (mode != "read-only" && mode != "workspace-write") Fail("unknown mode: " + mode);
    if (TrimQ(workspace).Length == 0) Fail("--workspace is required");
    if (idx >= args.Length) Fail("missing command after --");
    string command = args[idx];
    List<string> rest = new List<string>();
    for (int i = idx + 1; i < args.Length; i++) rest.Add(args[i]);

    if (!System.IO.Directory.Exists(workspace)) Fail("--workspace does not exist: " + workspace);
    foreach (string w in writable) if (!System.IO.Directory.Exists(w)) Fail("--writable does not exist: " + w);
    if (temp.Length > 0 && !System.IO.Directory.Exists(temp)) Fail("--temp does not exist: " + temp);

    IntPtr selfTok;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY | TOKEN_DUPLICATE | TOKEN_ADJUST_DEFAULT | TOKEN_ASSIGN_PRIMARY, out selfTok)) Fail(WinErr("OpenProcessToken", LastErr()));

    IntPtr logon = FindLogonSid(selfTok);
    IntPtr world = MakeWorldSid();

    List<IntPtr> writeSids = new List<IntPtr>();
    List<string> grantPaths = new List<string>();
    if (mode == "workspace-write") {
      if (writable.Count == 0) writable.Add(workspace);
      foreach (string w in writable) { IntPtr sid = MakeSid(DeriveSid(w)); writeSids.Add(sid); grantPaths.Add(w); }
    }

    List<IntPtr> restrict = new List<IntPtr>();
    restrict.Add(logon); restrict.Add(world);
    foreach (IntPtr sid in writeSids) restrict.Add(sid);

    SID_AND_ATTRIBUTES[] sids = new SID_AND_ATTRIBUTES[restrict.Count];
    for (int i = 0; i < restrict.Count; i++) { sids[i] = new SID_AND_ATTRIBUTES(); sids[i].Sid = restrict[i]; sids[i].Attributes = 0; }

    IntPtr restricted;
    if (!CreateRestrictedToken(selfTok, WRITE_RESTRICTED | DISABLE_MAX_PRIVILEGE | LUA_TOKEN, 0, IntPtr.Zero, 0, IntPtr.Zero, (uint)sids.Length, sids, out restricted)) Fail(WinErr("CreateRestrictedToken", LastErr()));

    if (mode == "workspace-write") {
      for (int i = 0; i < grantPaths.Count; i++) GrantWrite(grantPaths[i], writeSids[i]);
      foreach (IntPtr sid in writeSids) SetTokenDefaultDacl(restricted, sid);
      if (temp.Length > 0) {
        if (!SetEnvironmentVariableW("TMP", temp)) Fail(WinErr("SetEnvironmentVariableW TMP", LastErr()));
        if (!SetEnvironmentVariableW("TEMP", temp)) Fail(WinErr("SetEnvironmentVariableW TEMP", LastErr()));
      }
    }

    IntPtr job = CreateJobObjectW(IntPtr.Zero, null);
    if (job == IntPtr.Zero) Fail(WinErr("CreateJobObjectW", LastErr()));
    SetJobInfo(job);

    IntPtr hIn = GetStdHandle(STD_INPUT_HANDLE);
    IntPtr hOut = GetStdHandle(STD_OUTPUT_HANDLE);
    IntPtr hErr = GetStdHandle(STD_ERROR_HANDLE);
    bool inherited = hOut != IntPtr.Zero && hOut != (IntPtr)(-1) && hErr != IntPtr.Zero && hErr != (IntPtr)(-1);
    if (inherited) {
      SetHandleInformation(hOut, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT);
      SetHandleInformation(hErr, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT);
      if (hIn != IntPtr.Zero && hIn != (IntPtr)(-1)) SetHandleInformation(hIn, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT);
    }

    STARTUPINFO si = new STARTUPINFO();
    si.cb = Marshal.SizeOf(typeof(STARTUPINFO));
    if (inherited) { si.dwFlags = 0x100; si.hStdInput = hIn; si.hStdOutput = hOut; si.hStdError = hErr; }

    PROCESS_INFORMATION pi;
    string cmdline = BuildCommandLine(command, rest);
    bool ok = CreateProcessAsUserW(restricted, null, cmdline, IntPtr.Zero, IntPtr.Zero, inherited, CREATE_SUSPENDED | CREATE_NO_WINDOW, IntPtr.Zero, workspace, ref si, out pi);
    if (inherited) {
      SetHandleInformation(hOut, HANDLE_FLAG_INHERIT, 0); SetHandleInformation(hErr, HANDLE_FLAG_INHERIT, 0);
      if (hIn != IntPtr.Zero && hIn != (IntPtr)(-1)) SetHandleInformation(hIn, HANDLE_FLAG_INHERIT, 0);
    }
    if (!ok) { uint e = (uint)LastErr(); CloseHandle(job); Fail(WinErr("CreateProcessAsUserW", (int)e)); }

    if (pi.hProcess == IntPtr.Zero || pi.hThread == IntPtr.Zero) { CloseHandle(job); Fail("CreateProcessAsUserW returned null handles"); }

    if (!AssignProcessToJobObject(job, pi.hProcess)) { CloseHandle(pi.hThread); CloseHandle(pi.hProcess); CloseHandle(job); Fail(WinErr("AssignProcessToJobObject", LastErr())); }
    if (ResumeThread(pi.hThread) == unchecked((uint)-1)) { CloseHandle(pi.hThread); CloseHandle(pi.hProcess); CloseHandle(job); Fail(WinErr("ResumeThread", LastErr())); }
    CloseHandle(pi.hThread);

    WaitForSingleObject(pi.hProcess, 0xFFFFFFFF);
    uint exitCode;
    GetExitCodeProcess(pi.hProcess, out exitCode);
    CloseHandle(pi.hProcess);
    CloseHandle(job);
    Environment.ExitCode = (int)exitCode;
  }

  static string TrimQ(string s) { return (s ?? "").Trim(); }
}
