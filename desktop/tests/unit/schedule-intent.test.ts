// 定时任务意图识别单测（schedule-intent.ts 纯函数）
import { detectScheduleIntent } from "@/pages/Chat/schedule-intent";

describe("detectScheduleIntent 定时任务意图识别", () => {
  it("每天 9 点 → daily 09:00", () => {
    const r = detectScheduleIntent("帮我每天9点生成早报");
    expect(r?.repeatType).toBe("daily");
    expect(r?.runTime).toBe("09:00");
  });

  it("每天 18:30 → daily 18:30", () => {
    const r = detectScheduleIntent("每天18点30分提醒我");
    expect(r?.repeatType).toBe("daily");
    expect(r?.runTime).toBe("18:30");
  });

  it("每周一 8 点 → weekly weekday=1", () => {
    const r = detectScheduleIntent("每周一8点发周报");
    expect(r?.repeatType).toBe("weekly");
    expect(r?.weekday).toBe(1);
    expect(r?.runTime).toBe("08:00");
  });

  it("每周日 → weekly weekday=7", () => {
    const r = detectScheduleIntent("每周日晚上做总结");
    expect(r?.repeatType).toBe("weekly");
    expect(r?.weekday).toBe(7);
  });

  it("定时 → once 默认明天 09:00", () => {
    const r = detectScheduleIntent("帮我生成一个定时任务，每天同步数据");
    expect(r?.repeatType).toBe("once");
    expect(r?.dueAt).toMatch(/T09:00$/);
  });

  it("普通闲聊不误判", () => {
    expect(detectScheduleIntent("你好，介绍一下产品")).toBeNull();
    expect(detectScheduleIntent("我每天都会锻炼身体")).toBeNull();
    expect(detectScheduleIntent("")).toBeNull();
  });

  it("非法时间兜底到 00-23", () => {
    const r = detectScheduleIntent("每天25点99分跑数据");
    expect(r?.repeatType).toBe("daily");
    expect(r?.runTime).toBe("23:59");
  });
});
