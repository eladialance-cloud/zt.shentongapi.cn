# 调整首页卡片透明度 Spec

## Why
用户要求将 Landing Page 卡片透明度从当前的 88%/70% 改为 30%，使粒子背景更加通透可见。同时确认只保留 9 段式 SaaS 方案，删除旧方案。

## What Changes
- 将所有卡片背景透明度从 `rgba(9, 21, 36, 0.88)` / `rgba(7, 17, 30, 0.7)` 改为 `rgba(9, 21, 36, 0.3)` / `rgba(7, 17, 30, 0.3)`
- 涉及所有使用卡片样式的区域：Hero、核心功能、数据展示、使用场景、客户案例、定价、FAQ、CTA、页脚
- 删除旧的 spec 文档（`landing-page-and-brand`、`align-landing-with-reference`）

## Impact
- Affected code: `src/pages/Landing/styles.module.css`

## MODIFIED Requirements
### Requirement: 卡片透明度
所有 Landing Page 卡片背景透明度统一为 30%（alpha=0.3），保留 backdrop-filter: blur(18px) 毛玻璃效果。

#### Scenario: 用户查看首页卡片
- **WHEN** 用户浏览 Landing Page 各区块
- **THEN** 卡片背景半透明（30% 不透明度）
- **AND** 粒子背景透过卡片可见
- **AND** 卡片文字保持清晰可读
