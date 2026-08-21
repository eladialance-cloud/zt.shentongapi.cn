import { isVideoClawTool } from "@/utils/video-claw-tool";

describe("isVideoClawTool（收窄版）", () => {
  it("明确的视频/图片工具名 → true", () => {
    expect(isVideoClawTool("video-claw")).toBe(true);
    expect(isVideoClawTool("st-claw-controller")).toBe(true);
    expect(isVideoClawTool("generate_video")).toBe(true);
  });
  it("含 task 的普通工具不再误判（修复 video|claw|pipeline|task 过宽）", () => {
    expect(isVideoClawTool("create_team_task")).toBe(false);
    expect(isVideoClawTool("list_tasks")).toBe(false);
  });
  it("hermes-agent / n8n-run-workflow 不触发 ST-Claw", () => {
    expect(isVideoClawTool("hermes-agent")).toBe(false);
    expect(isVideoClawTool("n8n-run-workflow")).toBe(false);
  });
});
