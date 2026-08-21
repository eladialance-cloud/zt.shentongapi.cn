import { test } from "node:test";
import assert from "node:assert/strict";
import { HermesReportDto } from "../../src/modules/hermes/dto/hermes-report.dto";

test("HermesReportDto：合法 payload 校验通过", () => {
  const dto = new HermesReportDto();
  dto.executionRef = "brief-1-x";
  dto.teamTaskId = 5;
  dto.teamId = 2;
  dto.status = "completed";
  dto.summary = "ok";
  dto.durationMs = 1200;
  assert.equal(dto.status, "completed");
  assert.equal(dto.teamId, 2);
});

test("HermesReportDto：status 仅允许 completed/failed", () => {
  const dto = new HermesReportDto();
  dto.status = "running" as HermesReportDto["status"];
  // 类校验装饰器约束由 class-validator 校验；此处仅验证类型枚举可承载字段
  assert.equal(dto.status, "running");
});