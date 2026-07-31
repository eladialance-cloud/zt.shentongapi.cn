import os
base = r'D:\二次开发\desktop'

# Fix Office2DPage.tsx: split type and value imports
path = os.path.join(base, r'src\pages\Office\Office2DPage.tsx')
with open(path, 'rb') as f:
    d = f.read()

old = b"import type { OfficeSettings, loadOfficeSettings, saveOfficeSettings, AIEmployee, OfficeLogEvent, TaskFlowEdge, DemoController, StatusUpdateEvent, ChatBubbleType, PixelPoint, DemoContext, AIEmployeeStatus, PerformanceMode } from './types';"
new = b"import type { OfficeSettings, AIEmployee, OfficeLogEvent, TaskFlowEdge, DemoController, StatusUpdateEvent, ChatBubbleType, PixelPoint, DemoContext, AIEmployeeStatus, PerformanceMode } from './types';\nimport { loadOfficeSettings, saveOfficeSettings } from './types';"
d = d.replace(old, new)

with open(path, 'wb') as f:
    f.write(d)
print('Fixed Office2DPage imports')

# Fix index.tsx executeTask import
path2 = os.path.join(base, r'src\pages\Office\index.tsx')
with open(path2, 'rb') as f:
    d2 = f.read()

# Change: import { executeTask } -> import executeTask
d2 = d2.replace(b'import { executeTask }', b'import executeTask')

with open(path2, 'wb') as f:
    f.write(d2)
print('Fixed executeTask import')

print('Done')
