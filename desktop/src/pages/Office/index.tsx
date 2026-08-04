/**
 * Office — AI办公室主页面 (v3.0 基于参考项目)
 */

import OfficeIntegrated from './pixi-office/OfficeIntegrated'

export default function Office() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f1f5f9' }}>
      <OfficeIntegrated />
    </div>
  )
}
