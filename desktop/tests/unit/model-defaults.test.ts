import { resolveModelDefaults } from "../../electron/main/model-defaults";

const PICKED = {
  llmModel: "auto-chat",
  vlmModel: "auto-vlm",
  imageT2iModel: "auto-image",
  imageIt2iModel: "auto-image",
  videoFirstFrameModel: "auto-video",
  videoStartEndModel: "auto-video",
  videoReferenceModel: "auto-video",
};

describe("resolveModelDefaults", () => {
  it("完整配置 → 五类默认全部映射", () => {
    const r = resolveModelDefaults(
      { chat: "c1", vision: "v1", image: "i1", video: "vd1", tts: "t1" },
      PICKED
    );
    expect(r).not.toBeNull();
    expect(r!.hermes.llmModel).toBe("c1");
    expect(r!.videoClaw).toEqual({
      llmModel: "c1",
      vlmModel: "v1",
      imageT2iModel: "i1",
      imageIt2iModel: "i1",
      videoFirstFrameModel: "vd1",
      videoStartEndModel: "vd1",
      videoReferenceModel: "vd1",
    });
    expect(r!.orchestrate).toMatchObject({ chat: "c1", vision: "v1", image: "i1", video: "vd1", tts: "t1" });
  });

  it("部分配置 → 缺失分类回退自动挑选值", () => {
    const r = resolveModelDefaults({ chat: "c1" }, PICKED);
    expect(r).not.toBeNull();
    expect(r!.hermes.llmModel).toBe("c1");
    expect(r!.videoClaw.vlmModel).toBe("c1"); // vision 缺省回退 chat
    expect(r!.videoClaw.imageT2iModel).toBe("auto-image");
    expect(r!.videoClaw.videoFirstFrameModel).toBe("auto-video");
    expect(r!.orchestrate.vision).toBeUndefined();
  });

  it("空字符串/空白 → 视作未配置", () => {
    const r = resolveModelDefaults({ chat: "  ", image: "" }, PICKED);
    expect(r).toBeNull();
  });

  it("user 为 null/undefined → null（不重写配置）", () => {
    expect(resolveModelDefaults(null, PICKED)).toBeNull();
    expect(resolveModelDefaults(undefined, PICKED)).toBeNull();
    expect(resolveModelDefaults({}, PICKED)).toBeNull();
  });

  it("trim 归一化：带空格模型 id 去空白", () => {
    const r = resolveModelDefaults({ chat: "  qwen3.8-max  ", video: "wan2.7-i2v" }, PICKED);
    expect(r!.hermes.llmModel).toBe("qwen3.8-max");
    expect(r!.videoClaw.videoReferenceModel).toBe("wan2.7-i2v");
  });
});
