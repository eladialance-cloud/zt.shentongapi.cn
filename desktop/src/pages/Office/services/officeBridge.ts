/**
 * AI 办公室业务事件联动 (Spec upgrade-office-to-isometric-25d Task 6)
 *
 * 将聊天 / Agent / 系统事件映射为办公室员工行为。
 * 通过 window 接口 (__officeDispatch 等) 驱动 OfficeIsoCanvas,
 * 不直接依赖 React 组件实例, 实现业务层与渲染层解耦。
 *
 * 设计原则:
 *  - 所有 window 接口调用前判空 (w.__officeXxx?.(...)), 避免 Office 未挂载时报错
 *  - 所有事件处理函数同步派发, 不返回 Promise (内部 moveEmployee 异步执行不影响调用方)
 *  - 接入 chat 流程时, 调用方用 try/catch 包裹, 失败时 console.error 但不影响主流程
 *
 * 接入点 (SubTask 6.10):
 *  - 首选: 在 src/pages/Chat/index.tsx 的 handleSend 中, 通过 streamMessage 回调注入
 *    (onMessage / onToolCall / onCreditsCost / onComplete / onError)
 *  - 兜底: 提供 playDemoSequence() 在浏览器 console 手动触发, 用于演示验证
 *
 * 不使用 atob / btoa / eval。
 */

// ============================================================
// SubTask 6.1: 角色 → 员工 ID 映射 + 常量
// ============================================================

/**
 * 业务角色 → AI 员工 ID 映射 (对应 employees.ts 中 5 位 AI 员工)
 *
 * | 角色 key   | 员工 ID    | 名称     | 业务职责                       |
 * |------------|------------|----------|--------------------------------|
 * | manager    | business   | 商务AI   | 主管 (统筹派发, 深度工作时面向大屏) |
 * | writer     | content    | 内容AI   | 撰写员 (写回复内容)              |
 * | retriever  | delivery   | 交付AI   | 检索员 (去资料室检索)            |
 * | marketer   | service    | 客服AI   | 市场员 (去技能墙调用工具)        |
 * | reviewer   | finance    | 财务AI   | 审核员 (审核撰写员产出, VISITING 撰写员) |
 */
export const ROLE_TO_EMPLOYEE = {
  manager: 'business',    // 主管
  writer: 'content',      // 撰写员
  retriever: 'delivery',  // 检索员
  marketer: 'service',    // 市场员
  reviewer: 'finance',    // 审核员
} as const;

/** 业务角色 key 联合类型 (用于 onToolCall 等需要角色参数的场合) */
export type BusinessRole = keyof typeof ROLE_TO_EMPLOYEE;

/**
 * 大屏 zoneId — 技能墙 (skillWall) 即大屏所在区域。
 * 与 office-2d-config.ts 的 RESOURCE_TARGETS.skillWall 一致,
 * moveEmployeeToZone 会把员工移动到 { x: 1065, y: 155 }。
 */
export const BIG_SCREEN_ZONE = 'skillWall';

/** 资料室 zoneId (供 onAgentRetrieve 使用) */
export const LIBRARY_ZONE = 'library';

// ============================================================
// window 接口类型声明 (与 OfficeIsoCanvas.tsx 暴露的接口对齐)
// ============================================================

/**
 * OfficeIsoCanvas 通过 useEffect 暴露到 window 的接口集合。
 * 每个字段都是可选的 — Office 页面未挂载时这些字段均为 undefined,
 * 调用方必须用可选链 w.__officeXxx?.(...) 调用。
 */
export type WindowOffice = Window & {
  /** 派发员工状态变更 (StatusUpdateEvent) */
  __officeDispatch?: (e: { employeeId: string; status: string; reason?: string }) => void;
  /** 添加对话气泡 (类型见 ChatBubbleType) */
  __officeAddBubble?: (
    employeeId: string,
    type: string,
    content: string,
    emoji?: string,
    duration?: number,
  ) => void;
  /** 清空所有对话气泡 */
  __officeClearBubbles?: () => void;
  /** 移动员工到像素坐标 (A* 寻路, Promise 完成时表示到达) */
  __officeMoveEmployee?: (
    id: string,
    to: { x: number; y: number },
    speed?: number,
  ) => Promise<void>;
  /** Task 5: 让 visitor 拜访 target 工位 (VISITING 3.5s 后自动返回) */
  __officeVisitEmployee?: (visitorId: string, targetId: string) => boolean;
  /** Task 5: 让 visitor 返回自己工位 */
  __officeReturnToDesk?: (visitorId: string) => boolean;
  /** Task 5: 让员工返回自己工位 (与 returnToDesk 行为一致, 语义别名) */
  __officeMoveEmployeeToDesk?: (empId: string) => boolean;
  /** Task 5: 让员工移动到指定区域 (zoneId 取自 RESOURCE_TARGETS) */
  __officeMoveEmployeeToZone?: (empId: string, zoneId: string) => boolean;
  /** 重置所有员工到 IDLE */
  __officeResetAll?: () => void;
};

/**
 * 取 window 引用并断言为 WindowOffice。
 * 抽成 helper 避免每个事件处理函数重复 `window as WindowOffice`。
 */
function getWindowOffice(): WindowOffice {
  return window as WindowOffice;
}

/**
 * 安全执行: 包裹 try/catch, 失败时 console.error 但不抛出。
 * 用于 chat 流程中接入 bridge 时, 保证 bridge 异常不影响主流程。
 */
function safeRun(label: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.error(`[officeBridge] ${label} failed:`, err);
  }
}

// ============================================================
// SubTask 6.2: onChatMessageSent — 主管 IDLE → WORKING_DEEP
// ============================================================

/**
 * 用户发送聊天消息时调用。
 * - 主管 (商务AI) 从 IDLE 切换为 WORKING_DEEP (深度工作, 面向大屏分析需求)
 * - 主管弹出 "正在分析需求..." 思考气泡
 *
 * 接入点: Chat 页面 handleSend 入口处 (用户消息插入后, streamMessage 调用前)。
 */
export function onChatMessageSent(): void {
  safeRun('onChatMessageSent', () => {
    const w = getWindowOffice();
    // 主管切深度工作 (面向大屏统筹分析需求)
    w.__officeDispatch?.({
      employeeId: ROLE_TO_EMPLOYEE.manager,
      status: 'WORKING_DEEP',
      reason: '用户发送消息',
    });
    // 主管思考气泡 (2.5s)
    w.__officeAddBubble?.(
      ROLE_TO_EMPLOYEE.manager,
      'thinking',
      '正在分析需求...',
      '🤔',
      2500,
    );
  });
}

// ============================================================
// SubTask 6.3: onAgentRetrieve — 检索员移动到资料室
// ============================================================

/**
 * Agent 触发知识库 / RAG 检索时调用。
 * - 检索员 (交付AI) 移动到资料室 (library zone)
 * - 弹出 "去资料室检索相关资料" 文本气泡
 *
 * 接入点:
 *  - 在 Chat 页面 onToolCall 回调中, 根据工具名匹配检索类工具 (含 search/retrieve/kb/rag 关键字) 触发
 *  - 或在 streamMessage 收到检索类 SSE 事件时触发
 */
export function onAgentRetrieve(): void {
  safeRun('onAgentRetrieve', () => {
    const w = getWindowOffice();
    // 检索员移动到资料室 (到达后自动切 AT_RESOURCE)
    w.__officeMoveEmployeeToZone?.(ROLE_TO_EMPLOYEE.retriever, LIBRARY_ZONE);
    w.__officeAddBubble?.(
      ROLE_TO_EMPLOYEE.retriever,
      'text',
      '去资料室检索相关资料',
      '📚',
      3000,
    );
  });
}

// ============================================================
// SubTask 6.4: onToolCall — 市场员移动到技能墙
// ============================================================

/**
 * Agent 调用 MCP / SKILL 工具时调用。
 * - 市场员 (客服AI) 移动到技能墙 (skillWall zone, 即大屏所在区域)
 * - 弹出 "调用工具: {toolName}" 图标气泡
 *
 * 接入点: Chat 页面 onToolCall 回调, 传入 toolCall.name。
 * 若工具名匹配检索类关键字 (search/retrieve/kb/rag), 应同时调用 onAgentRetrieve()。
 *
 * @param toolName 工具名 (来自 ToolCallInfo.name), 缺省时显示 "未知"
 */
export function onToolCall(toolName?: string): void {
  safeRun('onToolCall', () => {
    const w = getWindowOffice();
    // 市场员移动到技能墙 (到达后自动切 AT_RESOURCE)
    w.__officeMoveEmployeeToZone?.(ROLE_TO_EMPLOYEE.marketer, BIG_SCREEN_ZONE);
    w.__officeAddBubble?.(
      ROLE_TO_EMPLOYEE.marketer,
      'icon',
      `调用工具: ${toolName ?? '未知'}`,
      '🔧',
      2500,
    );
  });
}

// ============================================================
// SubTask 6.5: onReplyGenerated — 撰写员 WORKING_DEEP
// ============================================================

/**
 * 开始生成回复内容时调用 (流式首块到达)。
 * - 撰写员 (内容AI) 切换为 WORKING_DEEP (深度工作, 撰写回复正文)
 * - 弹出 "撰写回复中..." 思考气泡
 *
 * 接入点: Chat 页面 onMessage 回调, 第一次收到流式块时触发 (仅触发一次)。
 */
export function onReplyGenerated(): void {
  safeRun('onReplyGenerated', () => {
    const w = getWindowOffice();
    // 撰写员切深度工作 (撰写回复)
    w.__officeDispatch?.({
      employeeId: ROLE_TO_EMPLOYEE.writer,
      status: 'WORKING_DEEP',
      reason: '正在撰写回复',
    });
    w.__officeAddBubble?.(
      ROLE_TO_EMPLOYEE.writer,
      'thinking',
      '撰写回复中...',
      '✍️',
      2500,
    );
  });
}

// ============================================================
// SubTask 6.6: onReview — 审核员 VISITING 撰写员
// ============================================================

/**
 * 触发审核环节时调用 (回复生成完成后, 由主管派发审核)。
 * - 审核员 (财务AI) 拜访撰写员 (内容AI) 工位
 * - 调用 __officeVisitEmployee: 审核员 MOVING → 撰写员工位 → VISITING (3.5s) → 自动 returnToDesk
 * - 弹出 "我来审核一下" 文本气泡
 *
 * 接入点:
 *  - Chat 页面 onComplete 回调 (回复生成完毕后触发审核)
 *  - 或由后端 SSE 推送 review 事件时触发 (目前后端无此事件, 暂用 onComplete)
 */
export function onReview(): void {
  safeRun('onReview', () => {
    const w = getWindowOffice();
    // 审核员拜访撰写员工位 (内部 A* 寻路 + VISITING 状态机)
    w.__officeVisitEmployee?.(ROLE_TO_EMPLOYEE.reviewer, ROLE_TO_EMPLOYEE.writer);
    w.__officeAddBubble?.(
      ROLE_TO_EMPLOYEE.reviewer,
      'text',
      '我来审核一下',
      '👀',
      2500,
    );
  });
}

// ============================================================
// SubTask 6.7: onTaskComplete — 相关人员切 IDLE
// ============================================================

/**
 * 任务完成时调用 (流式结束 / 用户停止 / 审核通过)。
 * - 所有人回工位并切换为 IDLE
 * - 主管弹出 "任务完成" 情绪气泡 (✅)
 *
 * 接入点: Chat 页面 onComplete 回调 (在 onReview 之后触发, 或独立触发)。
 *
 * 注意: moveEmployeeToDesk 内部会先切 MOVING, 到达工位后自动切 IDLE/WORKING;
 *       这里同时 dispatch IDLE 以便员工立即在 UI 上显示空闲状态 (即使还在移动中)。
 *       若状态机不允许 (canTransition 失败), dispatch 会被 OfficeIsoCanvas 静默拒绝, 不影响 moveEmployeeToDesk。
 */
export function onTaskComplete(): void {
  safeRun('onTaskComplete', () => {
    const w = getWindowOffice();
    // 所有人回工位切 IDLE
    for (const empId of Object.values(ROLE_TO_EMPLOYEE)) {
      w.__officeMoveEmployeeToDesk?.(empId);
      w.__officeDispatch?.({
        employeeId: empId,
        status: 'IDLE',
        reason: '任务完成',
      });
    }
    // 主管 "任务完成" 情绪气泡 (3s)
    w.__officeAddBubble?.(
      ROLE_TO_EMPLOYEE.manager,
      'emotion',
      '任务完成',
      '✅',
      3000,
    );
  });
}

// ============================================================
// SubTask 6.8: onCreditsDeducted — 所有人看大屏 + 主管气泡
// ============================================================

/**
 * 积分扣减时调用 (SSE credits 事件)。
 * - 所有员工移动到技能墙 (大屏所在区域) 看大屏
 * - 主管弹出 "积分 -X" 文本气泡
 *
 * 接入点: Chat 页面 onCreditsCost 回调, 传入 cost.amount。
 *
 * 注意: 所有人同时移动可能造成拥堵, A* 寻路有动态障碍物 (其他员工, 半径 16px 圆形) 会自动绕行。
 *       moveEmployeeToZone 到达后会切 AT_RESOURCE, 视觉上呈现 "都在大屏前查阅" 的效果。
 *
 * @param amount 扣减积分数 (来自 CreditsCostInfo.amount, 通常为正数)
 */
export function onCreditsDeducted(amount: number): void {
  safeRun('onCreditsDeducted', () => {
    const w = getWindowOffice();
    // 所有人移动到技能墙 (大屏所在区域)
    for (const empId of Object.values(ROLE_TO_EMPLOYEE)) {
      w.__officeMoveEmployeeToZone?.(empId, BIG_SCREEN_ZONE);
    }
    // 主管 "积分 -X" 文本气泡 (3.5s)
    w.__officeAddBubble?.(
      ROLE_TO_EMPLOYEE.manager,
      'text',
      `积分 -${amount}`,
      '💰',
      3500,
    );
  });
}

// ============================================================
// SubTask 6.9: onSystemError — 大屏闪烁红色 (降级为气泡提示)
// ============================================================

/**
 * 系统错误时调用 (SSE error 事件 / 网络异常 / Agent 执行失败)。
 * - 主管弹出 "系统错误: {message}" 情绪气泡 (⚠️, 5s)
 *
 * TODO(visual): 大屏红色闪烁需 OfficeIsoCanvas 支持自定义视觉状态
 *  (如 zoneLayer 的大屏 Graphics 暴露 tint/flicker 接口)。
 *  当前 OfficeIsoCanvas 未暴露此能力, 故降级为气泡提示。
 *  未来可实现后, 在此处增加:
 *    w.__officeFlickerScreen?.('red', 2000); // 假想接口
 *  并在 OfficeIsoCanvas.tsx 中实现大屏红色闪烁 (TWEEN tint 透明度 0.5s 周期, 持续 2s)。
 *
 * 接入点: Chat 页面 onError 回调, 传入 error.message。
 *
 * @param message 错误信息 (来自 Error.message), 缺省时显示 "未知"
 */
export function onSystemError(message?: string): void {
  safeRun('onSystemError', () => {
    const w = getWindowOffice();
    // 主管 "系统错误" 情绪气泡 (5s)
    w.__officeAddBubble?.(
      ROLE_TO_EMPLOYEE.manager,
      'emotion',
      `系统错误: ${message ?? '未知'}`,
      '⚠️',
      5000,
    );
    // TODO(visual): 大屏红色闪烁 — 待 OfficeIsoCanvas 支持自定义视觉状态后启用
    // w.__officeFlickerScreen?.('red', 2000);
  });
}

// ============================================================
// SubTask 6.10: 接入入口
// ============================================================

/**
 * 判断工具名是否为检索类 (用于在 onToolCall 中同时触发 onAgentRetrieve)。
 * 匹配关键字: search / retrieve / kb / rag / knowledge / vector / embedding。
 * 大小写不敏感。
 *
 * 内部辅助函数, 也导出供 Chat 页面接入时复用。
 */
export function isRetrieveTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  return (
    lower.includes('search') ||
    lower.includes('retrieve') ||
    lower.includes('kb') ||
    lower.includes('rag') ||
    lower.includes('knowledge') ||
    lower.includes('vector') ||
    lower.includes('embedding')
  );
}

/**
 * 简单延时 (仅 playDemoSequence 使用)。
 * 不导出, 避免被业务代码依赖 (业务代码请用 scenarios/demo-helpers.ts 的 cancelableSleep)。
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 演示序列 — 按顺序触发全部 8 个业务事件, 用于验证 officeBridge 是否正常工作。
 *
 * 使用方法 (浏览器 Console):
 *   await import('/src/pages/Office/services/officeBridge.ts')
 *     .then(m => m.playDemoSequence());
 *
 * 或在 Office2DPage Demo 模式中调用 (后续可包装成 DemoController)。
 *
 * 注意:
 *  - 此函数不自动调用, 由开发者手动执行
 *  - 每个事件之间间隔 2~3 秒, 便于观察员工行为变化
 *  - 演示结束后所有员工切回 IDLE (onTaskComplete 已处理)
 *  - 若 Office 页面未挂载 (window.__officeXxx 为 undefined), 所有调用会被静默跳过, 不会报错
 *
 * @returns 演示日志数组, 每个元素为 [事件名, 触发时间戳]
 */
export async function playDemoSequence(): Promise<Array<[string, number]>> {
  const log: Array<[string, number]> = [];
  const mark = (name: string) => {
    log.push([name, Date.now()]);
    console.log(`[officeBridge:demo] ${name}`);
  };

  console.log('[officeBridge:demo] 开始播放演示序列 (8 个业务事件)...');

  // 1. 用户发送消息 → 主管深度工作
  mark('onChatMessageSent');
  onChatMessageSent();
  await sleep(2500);

  // 2. Agent 检索 → 检索员去资料室
  mark('onAgentRetrieve');
  onAgentRetrieve();
  await sleep(3000);

  // 3. 工具调用 → 市场员去技能墙
  mark('onToolCall');
  onToolCall('web_search');
  await sleep(2500);

  // 4. 回复生成 → 撰写员深度工作
  mark('onReplyGenerated');
  onReplyGenerated();
  await sleep(2500);

  // 5. 审核 → 审核员拜访撰写员
  mark('onReview');
  onReview();
  await sleep(3500);

  // 6. 积分扣减 → 所有人看大屏
  mark('onCreditsDeducted');
  onCreditsDeducted(5);
  await sleep(3500);

  // 7. 系统错误 → 大屏闪烁红色 (降级为气泡)
  mark('onSystemError');
  onSystemError('演示模拟的错误');
  await sleep(3000);

  // 8. 任务完成 → 所有人切 IDLE
  mark('onTaskComplete');
  onTaskComplete();

  console.log('[officeBridge:demo] 演示序列播放完毕, 共触发 8 个事件。');
  console.table(log);
  return log;
}

// ============================================================
// 导出汇总 (便于外部按需 import)
// ============================================================

/**
 * officeBridge 全部业务事件处理函数 (便于外部统一导入)。
 *
 * 示例:
 *   import { officeBridge } from '@/pages/Office/services/officeBridge';
 *   officeBridge.onChatMessageSent();
 */
export const officeBridge = {
  onChatMessageSent,
  onAgentRetrieve,
  onToolCall,
  onReplyGenerated,
  onReview,
  onTaskComplete,
  onCreditsDeducted,
  onSystemError,
  playDemoSequence,
  // 辅助
  isRetrieveTool,
  // 常量
  ROLE_TO_EMPLOYEE,
  BIG_SCREEN_ZONE,
  LIBRARY_ZONE,
} as const;

export default officeBridge;
