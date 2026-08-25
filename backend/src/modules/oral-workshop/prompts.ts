/**
 * 口播工坊提示词库（M2 核心资产）
 *
 * 来源：轻语IP 复刻评估（12 类核心模板）——结构参考、措辞按通用 prompt 工程重写（脱敏）。
 * 版权声明：模板为功能性提示词工程，非代码抄袭；交付前建议法务复核。
 * 结构：每条含 id / name / template / params[]，v1.1 支持管理后台可编辑。
 * 占位符约定：{paramName} 由 llm.ts 渲染时替换；纯 JSON 输出模板已含解析约束。
 */

export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  /** 模板用到的占位符参数名 */
  params: string[];
}

export const ORAL_WORKSHOP_PROMPTS: PromptTemplate[] = [
  {
    "id": "topic_generation",
    "name": "选题生成主模板",
    "params": [
      "keywords",
      "persona",
      "count",
      "excludedTopics"
    ],
    "template": "你是短视频爆款选题策划专家，擅长为个人IP设计真人出镜口播短视频选题。\n用户输入：\n关键词：{keywords}\n【我的人设】：{persona}\n要求：\n1. 选题必须适合口播，不要做成图文、剧情或泛泛的知识科普\n2. 选题要利于打造个人IP，能体现观点、经验、专业度、真实经历或方法论\n3. 每个选题都要符合爆款逻辑，例如痛点、反常识、避坑、误区、清单、对比、故事、争议观点\n4. 标题要像短视频标题，不要像文章标题\n5. 不要使用绝对化、夸大承诺、违规引导表达\n6. 如果提供了【我的人设】，请优先围绕该人设的身份、经验、表达风格和内容边界设计选题\n7. 只返回 JSON，不要返回 Markdown\n8. topics 数组必须刚好返回 {count} 条\n9. 不要返回开头钩子或 hook 字段，开头钩子会在生成文案时再设计\n10. JSON 必须能被 JSON.parse 直接解析，不要尾逗号，不要注释，不要在 JSON 前后添加任何解释\n【排除选题】：{excludedTopics}\n（若排除选题非空，请提供差异化的全新选题）"
  },
  {
    "id": "keyword_topics",
    "name": "关键词选题（带机会分析）",
    "params": [
      "keywords",
      "persona",
      "count",
      "excludedTopics"
    ],
    "template": "你是短视频选题策划专家。请基于关键词为个人IP设计口播选题，并做内容机会分析。\nJSON 格式：\n{\n  \"keyword_analysis\": \"这个关键词适合做个人IP的内容机会分析，100字以内\",\n  \"topics\": [\n    {\n      \"title\": \"选题标题\",\n      \"hook\": \"开头3秒口播钩子\",\n      \"persona_angle\": \"这个选题如何强化个人IP\",\n      \"viral_logic\": \"爆款逻辑\"\n    }\n  ]\n}\n关键词：{keywords}\n【我的人设】：{persona}\n要求：\n1. topics 数组必须刚好返回 {count} 条\n2. 标题要像短视频标题，避免绝对化、夸大承诺、违规引导表达\n3. 只返回 JSON，不要 Markdown，不要尾逗号，不要注释\n4. JSON 必须能被 JSON.parse 直接解析\n5. 若提供了【排除选题】，请换一批全新视角的选题\n【排除选题】：{excludedTopics}"
  },
  {
    "id": "style_analysis",
    "name": "对标账号风格分析",
    "params": [
      "referenceContent",
      "excludedTopics"
    ],
    "template": "请分析以下对标账号/内容的选题风格，并基于分析结果生成新的口播选题。\n对标内容：\n{referenceContent}\n\n根据以上信息进行创作，并以纯 JSON 格式返回结果。\n1. 不要包含 markdown 格式标记\n2. JSON 结构如下：\n{\n  \"style_analysis\": \"这里是作者选题风格分析内容（要求详细，200字左右）\",\n  \"topics\": [\"选题标题1\", \"选题标题2\", \"选题标题3\", \"选题标题4\", \"选题标题5\"]\n}\n3. 选题标题要纯净，不要包含《》、【】、\"\"等符号，不要包含话题标签\n4. 选题要符合短视频爆款创作的逻辑，符合抖音热门选题逻辑\n5. 如果提供了【排除选题】，请务必提供差异化的新选题\n【排除选题】：{excludedTopics}"
  },
  {
    "id": "rewrite_master",
    "name": "改写主模板（信息保全）",
    "params": [
      "script",
      "persona",
      "style"
    ],
    "template": "你是专业的短视频口播文案改写专家。请把以下文案改写为适合真人口播的版本。\n原文案：\n{script}\n\n【我的人设】：{persona}\n【改写风格】：{style}\n\n要求：\n1. 改写后文案与原文信息量保持一致，重要细节不能丢失\n2. 具体叙述具体行为，每一个具体动作都不能跳过；可从不同角度切入叙述，确保内容完整，可以使用同义字替换、重组结构\n3. 语言口语化，有短视频节奏，适合真人直接照着拍\n4. 不要夸大承诺，不使用绝对化、违规或高风险表达\n5. 篇幅控制在260字左右\n请直接输出改写后的文案内容，不要包含任何解释或额外信息"
  },
  {
    "id": "script_creation",
    "name": "口播文案创作（选题→文案）",
    "params": [
      "topic",
      "reference",
      "persona"
    ],
    "template": "你是一个专业的短视频口播文案创作者。请根据以下选题创作一篇适合真人出镜的口播短视频文案。\n选题：{topic}\n【参考范文（请严格模仿以下文案的语感、节奏和结构）】：{reference}\n【我的人设】：{persona}\n创作要求：\n1. 基于选题标题设计一个爆款开头钩子，开头3秒必须抓人，直接戳痛点或抛出反常识观点\n2. 中段要有个人IP表达，体现经验、观点、专业判断或方法论\n3. 语言口语化，有短视频节奏，适合真人直接照着拍\n4. 不要夸大承诺，不使用绝对化、违规或高风险表达\n5. 如果提供了【我的人设】，请优先贴合该人设的身份、经历和表达风格\n6. 篇幅控制在260字左右\n请直接输出文案内容，不要包含任何解释或额外信息"
  },
  {
    "id": "generic_rewrite",
    "name": "通用改写",
    "params": [
      "script"
    ],
    "template": "请帮我改写以下文案，使其更加吸引人、生动有趣，保持原意的同时提升表达效果：\n原文案：{script}\n请直接输出改写后的文案内容，不要包含任何解释或额外信息。"
  },
  {
    "id": "title_publish",
    "name": "标题+发布描述",
    "params": [
      "script",
      "platform"
    ],
    "template": "请基于以下文案生成一个吸引人的视频标题与适配短视频平台的发布描述。\n平台：{platform}\n视频文案：{script}\n主标题：4-8 个字，强钩子，适合画面大标题\n副标题：4-8 个字，补充信息、悬念、收益点\n标题要短促，适合视频顶部单行展示\n不要使用书名号、引号、句号，不要解释\n发布描述需包含话题标签建议（3-5 个），口语化、有网感。\n请直接输出，不要解释。"
  },
  {
    "id": "double_line_title",
    "name": "双行标题",
    "params": [
      "script"
    ],
    "template": "请根据视频文案生成画面上方的双行标题。\n要求：\n主标题：4-8 个字，强钩子，适合画面大标题\n副标题：4-8 个字，补充信息、悬念、收益点\n标题要短促，适合视频顶部单行展示\n不要使用书名号、引号、句号，不要解释\n视频文案：{script}\n请直接输出两行标题。"
  },
  {
    "id": "cover_title",
    "name": "封面标题（主标题+副标题）",
    "params": [
      "script"
    ],
    "template": "你是短视频封面标题设计专家。请根据视频文案生成适合封面展示的主标题和副标题。\n要求：\n1. 主标题 4-8 个字，强钩子，适合画面大标题，通俗有力\n2. 副标题 4-8 个字，补充信息、悬念、收益点\n3. 不要使用书名号、引号、句号，不要出现错别字\n4. 只返回 JSON，不要 Markdown：\n{\n  \"h1\": \"主标题\",\n  \"h2\": \"副标题\"\n}\n5. JSON 必须能被 JSON.parse 直接解析\n视频文案：\n{script}"
  },
  {
    "id": "title_shorten",
    "name": "精简标题",
    "params": [
      "content"
    ],
    "template": "请为以下内容生成一个吸引人的标题，要求简洁有力，能够吸引用户点击，标题字数控制在12字以内，描述控制在50字以内：\n{content}\n请直接输出，不要解释。"
  },
  {
    "id": "persona",
    "name": "人设描述",
    "params": [
      "draft"
    ],
    "template": "请完善并输出以下人设描述，包括：身份、行业经验、擅长领域、表达风格、内容边界等。最多500字。\n草稿：{draft}"
  },
  {
    "id": "legal_review",
    "name": "法务审核",
    "params": [
      "script"
    ],
    "template": "你是短视频合规审核专家。请审核以下口播文案是否存在违规风险，并给出修改建议。\n文案：\n{script}\n\n检查项：\n1. 绝对化用语（最/第一/国家级等）\n2. 夸大承诺、虚假宣传\n3. 医疗健康类敏感宣称\n4. 金融投资类误导\n5. 诱导关注/交易等违规引导\n6. 侵权风险（他人商标/肖像/版权）\n\n输出 JSON：\n{\n  \"risk_level\": \"low|medium|high\",\n  \"issues\": [{ \"type\": \"检查项名称\", \"quote\": \"原文片段\", \"suggestion\": \"修改建议\" }],\n  \"safe_script\": \"合规改写后的完整文案（如无风险则与原文一致）\"\n}\n只返回 JSON，不要 Markdown。"
  },
  {
    "id": "bilingual_subtitle",
    "name": "双语字幕翻译",
    "params": [
      "script"
    ],
    "template": "你是短视频字幕翻译专家。请将以下中文口播文案翻译为适合短视频双语字幕的「中英逐行对照」。\n要求：\n1. 按语义切分为若干行，每行中文不超过 20 个字，适合字幕单行展示\n2. 每行给出对应的英文翻译，口语化、自然，适合短视频观众快速阅读\n3. 英文行长度不超过 60 个字符\n4. 不要省略内容，不要增删观点\n5. 只返回 JSON，不要 Markdown：\n{\n  \"lines\": [\n    { \"zh\": \"中文一行\", \"en\": \"English line\" }\n  ]\n}\n6. JSON 必须能被 JSON.parse 直接解析，不要尾逗号，不要注释\n口播文案：\n{script}"
  },
  {
    "id": "bilingual_subtitle_lang",
    "name": "双语字幕翻译（指定目标语言）",
    "params": [
      "script",
      "targetLangName"
    ],
    "template": "你是短视频字幕翻译专家。请将以下中文口播文案翻译为目标语言「{targetLangName}」，输出适合短视频双语字幕的逐行对照。\n要求：\n1. 按语义切分为若干行，每行中文不超过 20 个字，适合字幕单行展示\n2. 每行给出对应的{targetLangName}翻译，口语化、自然，适合短视频观众快速阅读\n3. {targetLangName}行长度不超过 80 个字符\n4. 不要省略内容，不要增删观点\n5. 只返回 JSON，不要 Markdown：\n{\n  \"lines\": [\n    { \"zh\": \"中文一行\", \"translated\": \"{targetLangName}一行\" }\n  ]\n}\n6. JSON 必须能被 JSON.parse 直接解析，不要尾逗号，不要注释\n口播文案：\n{script}"
  },
  {
    "id": "product_copy",
    "name": "产品文案",
    "params": [
      "productInfo",
      "persona"
    ],
    "template": "以下是用户的产品信息，根据要求创作一篇吸引人的短视频口播文案：\n产品名称/信息：{productInfo}\n【我的人设】：{persona}\n要求：\n1. 语言生动有趣，富有感染力，开头要能吸引人，直接戳痛点或抛出反常识观点\n2. 突出产品卖点和优惠信息\n3. 符合指定的人设风格（如有）\n4. 不要夸大承诺，不使用绝对化、违规或高风险表达\n请直接输出文案内容，不要包含任何解释或额外信息。"
  }
]

/** 按 id 获取提示词模板 */
export function getPromptTemplate(id: string): PromptTemplate | undefined {
  return ORAL_WORKSHOP_PROMPTS.find((p) => p.id === id);
}

/** 渲染模板：把 {param} 替换为参数值；缺失参数原样保留（便于调试） */
export function renderPrompt(id: string, values: Record<string, string>): string {
  const tpl = getPromptTemplate(id);
  if (!tpl) throw new Error(`未知提示词模板: ${id}`);
  return tpl.template.replace(/\{(\w+)\}/g, (match, key: string) =>
    values[key] !== undefined ? values[key] : match,
  );
}
