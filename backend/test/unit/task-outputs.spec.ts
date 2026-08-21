import { test } from "node:test";
import assert from "node:assert/strict";
import { CreateOutputItemDto } from "../../src/modules/task/dto/task.dto";

test("CreateOutputItemDto：合法产物字段", () => {
  const dto = new CreateOutputItemDto();
  dto.outputType = "image" as CreateOutputItemDto["outputType"];
  dto.fileUrl = "http://127.0.0.1:8000/code/result/image/a.png";
  assert.equal(dto.outputType, "image");
  assert.equal(dto.fileUrl, "http://127.0.0.1:8000/code/result/image/a.png");
});

test("CreateOutputItemDto：文本产物 content 透传", () => {
  const dto = new CreateOutputItemDto();
  dto.outputType = "text" as CreateOutputItemDto["outputType"];
  dto.content = "文案1";
  assert.equal(dto.content, "文案1");
});