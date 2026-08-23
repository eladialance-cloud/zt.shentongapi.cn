// CSS 模块桩：jest 渲染组件时把 *.module.css 解析为空对象
export default new Proxy({}, { get: () => "" });
