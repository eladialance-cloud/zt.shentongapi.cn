# 文件编码损坏修复报告

**日期**: 2026-07-30  
**操作人**: QClaw Agent  
**项目路径**: `D:\二次开发\desktop`

## 问题概述

项目中大量 TypeScript/TSX 文件因 PowerShell 处理 git 输出时编码转换错误，导致中文注释和字符串变为乱码（CJK 扩展区字符），prettier 无法格式化，tsc 编译报语法错误。

## 根本原因

1. **Git 存储编码**: 所有文件在 Git 中以 UTF-8（无 BOM）存储，中文内容完好
2. **PowerShell 破坏**: 使用 `git cat-file -p` 或 PowerShell 管道 `| Out-File` 读取时，PowerShell 将 UTF-8 字节当作 ASCII/UTF-16 处理，导致数据截断和乱码
3. **影响范围**: 不仅是最初发现的 27 个文件，还有 electron 目录下 7 个文件、scripts 目录 1 个文件、根目录 2 个文件，共 **37 个文件**

## 修复方法

**关键发现**: 使用 `cmd /c "git show <commit>:<path> > tmpfile"` 重定向（绕过 PowerShell 编码转换），再用 .NET `System.Text.Encoding.UTF8` 读取并写入 UTF-8 无 BOM 格式。

### 恢复的文件列表（37 个）

#### src/ 目录（31 个）
1. `src/api/http-client.ts` (258行)
2. `src/api/opc-api.ts` (113行)
3. `src/api/chat-api.ts` (287行)
4. `src/api/admin-auth-api.ts` (247行)
5. `src/api/admin-user-api.ts` (157行)
6. `src/api/knowledge-api.ts` (175行)
7. `src/api/sync-service.ts` (345行)
8. `src/api/workflow-api.ts` (72行)
9. `src/api/hermes-api.ts` (139行)
10. `src/store/auth.ts` (192行)
11. `src/store/admin-auth.ts` (90行)
12. `src/types/admin-user.ts` (157行)
13. `src/types/knowledge.ts` (58行)
14. `src/components/MainLayout/index.tsx` (23行)
15. `src/components/MainLayout/TopBar.tsx` (140行)
16. `src/pages/AgentMarket/index.tsx` (348行)
17. `src/pages/Chat/components/MessageList.tsx` (134行)
18. `src/pages/Chat/components/ToolCallBadge.tsx` (116行)
19. `src/pages/Credits/index.tsx` (169行)
20. `src/pages/Hermes/Detail.tsx` (529行)
21. `src/pages/Hermes/SkillMarket.tsx` (251行)
22. `src/pages/Knowledge/index.tsx` (235行)
23. `src/pages/Plugin/index.tsx` (272行)
24. `src/pages/Workflow/Detail.tsx` (371行)
25. `src/pages/Workflow/Editor.tsx` (312行)
26. `src/pages/Workflow/index.tsx` (221行)
27. `src/pages/Login/index.tsx` (211行)
28. `src/pages/ServiceManager/index.tsx` (313行)
29. `src/router/index.tsx` (221行)
30. `src/env.d.ts` (19行)
31. `src/main.tsx` (9行)

#### electron/ 目录（8 个）
32. `electron/main/index.ts` (256行)
33. `electron/main/runtime-resolver.ts` (247行)
34. `electron/main/service-manager.ts` (515行)
35. `electron/main/windows/main-window.ts` (67行)
36. `electron/main/fix-path.ts` (BOM 移除)
37. `electron/main/runtime-downloader.ts` (446行)
38. `electron/preload/index.ts` (126行)
39. `electron/shared/types.ts` (250行)

#### 根目录和 scripts/（3 个）
40. `electron.vite.config.ts` (54行)
41. `jest.config.ts` (20行)
42. `scripts/generate-latest-yml.ts` (163行)

## 验证结果

- ✅ **全项目乱码扫描**: 0 个乱码文件
- ✅ **Prettier 格式化**: 全部 42 个文件成功，零错误
- ✅ **TypeScript 语法错误**: 全部消除
- ⚠️ **TS 类型错误**: 剩余的类型不匹配（如 `hermes` 不在 `ServiceName` 类型中）属于架构设计问题，非编码损坏

## 教训

> **PowerShell 的 `git cat-file -p` / `git show` 管道输出会破坏 UTF-8 中文内容。**  
> 正确做法：使用 `cmd /c "git show <commit>:<path> > file"` 重定向，或用 .NET API 直接读取字节数组。
> 在 Windows 环境处理 Git 内容时，务必避开 PowerShell 的字符串编码层。
