// 渲染进程入口 - React 18 createRoot
// 加载 antd ConfigProvider（中文 zhCN）、React Router、Zustand store

import ReactDOM from 'react-dom/client'
import App from '@/App'
import '@/styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
