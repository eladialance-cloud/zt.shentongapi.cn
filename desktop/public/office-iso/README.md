# Office 等距 2.5D 素材清单

本目录存放桌面端 Office 等距 2.5D 场景所需的全部素材资源，供 PixiJS 8.x 渲染层使用。

## 素材获取方式

- 优先采用免费等距素材包（如 [Kenney.nl Isometric](https://kenney.nl/assets?q=isometric)、[OpenGameArt](https://opengameart.org/) 等公开 CC0 资源）
- 缺失素材由 AI 生成工具补齐（保持统一视角与色调）
- 全部素材格式：**PNG 透明背景**
- 推荐尺寸：基于 128×128 像素的等距瓦片网格（2:1 比例），家具/人物按需放大
- 命名规范：使用小写英文 + 连字符，例如 `tile-wood-floor.png`、`desk-with-monitor.png`

## 目录结构建议

```
iso/
├── tiles/         # 地块瓦片（可平铺）
├── walls/         # 墙壁
├── furniture/     # 家具
├── characters/    # 人物精灵图
│   ├── ai-employee-01/
│   ├── ai-employee-02/
│   └── ...
└── decorations/   # 装饰物
```

## 素材清单

### 1. 地块瓦片（tiles/）

每种瓦片需可无缝平铺，输出尺寸 128×64（等距 2:1 比例）。

| 文件名                  | 说明                       | 数量 |
| ----------------------- | -------------------------- | ---- |
| `tile-wood-floor.png`   | 木地板，可平铺             | 1    |
| `tile-carpet.png`       | 地毯，可平铺               | 1    |

### 2. 墙壁（walls/）

| 文件名                     | 说明                       | 数量 |
| -------------------------- | -------------------------- | ---- |
| `wall-iso-exterior.png`    | 等距外墙（含转角/边段）    | 1    |
| `wall-glass-partition.png` | 玻璃隔间（含门，可拼接）   | 1    |

### 3. 家具（furniture/）

| 文件名                    | 说明                       | 数量 |
| ------------------------- | -------------------------- | ---- |
| `desk-with-monitor.png`   | 办公桌（含显示器）         | 1    |
| `meeting-table.png`       | 会议桌                     | 1    |
| `chair.png`               | 椅子（4 方向视图）         | 1    |
| `plant.png`               | 植物（盆栽）               | 1    |
| `reception-desk.png`      | 前台                       | 1    |
| `large-screen.png`        | 大屏（展示用）             | 1    |

### 4. 人物精灵图（characters/）

6 位 AI 员工，每人独立目录，每个精灵图建议尺寸 64×64，按 8 方向 × 4 状态拼合为雪碧图（sprite sheet）。

**8 方向**：N、NE、E、SE、S、SW、W、NW

**4 状态**：
- `idle`（待机，2~4 帧循环）
- `working`（办公，2~4 帧循环）
- `walking`（行走，4~6 帧循环）
- `meeting`（开会，2~4 帧循环）

| 目录名            | 说明                  | 精灵图数量 |
| ----------------- | --------------------- | ---------- |
| `ai-employee-01/` | AI 员工 1（8 方向 × 4 状态） | 32 张（或 1 张 sprite sheet） |
| `ai-employee-02/` | AI 员工 2             | 同上       |
| `ai-employee-03/` | AI 员工 3             | 同上       |
| `ai-employee-04/` | AI 员工 4             | 同上       |
| `ai-employee-05/` | AI 员工 5             | 同上       |
| `ai-employee-06/` | AI 员工 6             | 同上       |

**精灵图命名规范**：`<state>-<direction>-<frame>.png`，例如 `walking-ne-03.png`。
若使用雪碧图，请同步提供 `manifest.json`（每行帧坐标 / 尺寸 / 锚点）。

### 5. 装饰（decorations/）

| 文件名             | 说明                | 数量 |
| ------------------ | ------------------- | ---- |
| `bookshelf.png`    | 书架                | 1    |
| `screen-divider.png` | 屏风              | 1    |
| `lounge-sofa.png`  | 休息区沙发          | 1    |

## 注意事项

1. 所有素材须保持 **等距投影角度一致**（推荐 30° 顶角，2:1 像素比）。
2. 透明背景 PNG，避免锯齿可提供 1px 描边或抗锯齿版本。
3. 人物精灵图建议提供 JSON 清单（帧名 → 矩形坐标），便于 PixiJS `Spritesheet` 加载。
4. 若素材来自第三方，请在此处补充 LICENSE 与来源链接。

## LICENSE

待补充（依据最终素材来源确定）。
