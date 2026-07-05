# 对齐首页与参考实现 Spec

## Why
当前 Landing Page 的品牌名仍为"深境 AI"，用户要求统一为"深瞳AI"。同时需要确认布局、内容及卡片透明度与 D:\AI Agent 参考实现完全一致。

## What Changes
- 将 header 品牌名从"深境 AI 控制中枢"改为"深瞳AI 控制中枢"
- 将 hero 标题从"深境 AI"改为"深瞳AI"
- 确认卡片透明度与参考一致（已匹配，无需修改）
- 确认布局结构、内容文案与参考一致（已匹配，无需修改）

## Impact
- Affected code: `src/pages/Landing/index.tsx`

## ADDED Requirements
### Requirement: 品牌名统一
首页所有出现的品牌名必须为"深瞳AI"，不得出现"深境 AI"或其他变体。

#### Scenario: 用户查看首页
- **WHEN** 用户打开 Landing Page
- **THEN** header 品牌区显示"深瞳AI 控制中枢"
- **AND** hero 区域大标题显示"深瞳AI"
