import os

base = r'D:\二次开发\desktop'

# ---- Fix Office2DPage.tsx ----
path = os.path.join(base, r'src\pages\Office\Office2DPage.tsx')
with open(path, 'rb') as f:
    data = f.read()
lines = data.split(b'\n')

# Find last import
last_import = max(i for i, l in enumerate(lines) if l.startswith(b'import '))

# Add type imports
new_import = b"import type { OfficeSettings, loadOfficeSettings, saveOfficeSettings, AIEmployee, OfficeLogEvent, TaskFlowEdge, DemoController, StatusUpdateEvent, ChatBubbleType, PixelPoint, DemoContext, AIEmployeeStatus, PerformanceMode } from './types';"
lines.insert(last_import + 1, new_import)

with open(path, 'wb') as f:
    f.write(b'\n'.join(lines))
print('Fixed Office2DPage.tsx imports')

# ---- Fix office-config.ts: instanceMap ----
path2 = os.path.join(base, r'src\pages\Office\office-config.ts')
with open(path2, 'rb') as f:
    data2 = f.read()

# instanceMap is used but not declared - add declaration before use
# Find 'const agents: AgentInfo[] = []' and add instanceMap before it
old = b'  const agents: AgentInfo[] = []'
new = b'  const instanceMap = new Map<number, HermesInstance>()\n  for (const inst of instances) {\n    instanceMap.set(inst.id, inst)\n  }\n\n  const agents: AgentInfo[] = []'
if old in data2:
    data2 = data2.replace(old, new)
    print('Fixed office-config.ts instanceMap')
else:
    print('instanceMap fix: pattern not found')

with open(path2, 'wb') as f:
    f.write(data2)

# ---- Fix index.tsx: add missing state variables ----
path3 = os.path.join(base, r'src\pages\Office\index.tsx')
with open(path3, 'rb') as f:
    data3 = f.read()

# Add dispatchModalOpen state near other useState declarations
# Find: const [bulletins, setBulletins] = useState
old3 = b"const [bulletins, setBulletins] = useState<string[]>([]);"
new3 = b"const [bulletins, setBulletins] = useState<string[]>([]);\n  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);\n  const [dispatchAgentId, setDispatchAgentId] = useState<number>(0);\n  const [taskType, setTaskType] = useState<CallType>('skill_execute');\n  const [taskInput, setTaskInput] = useState('');"
if old3 in data3:
    data3 = data3.replace(old3, new3)
    print('Fixed index.tsx state variables')
else:
    print('index.tsx state: pattern not found')

# Add handleCloseDrawer function before first use
old4 = b'  /** \xe9\x8e\xb5\xe6\x92\xb3\xe7\xb4\x91\xe5\xa8\xb2\xe6\x83\xa7\xe5\xbd\x82\xe6\xb5\xa0\xe8\xaf\xb2\xe5\xa7\x9f\xe5\xaf\xae\xe5\x9c\xad\xe7\x8d\xa5 */'
new4 = b'  const handleCloseDrawer = useCallback(() => {\n    setSelectedAgent(null);\n    setDrawerOpen(false);\n  }, []);\n\n' + old4
if old4 in data3:
    data3 = data3.replace(old4, new4)
    print('Added handleCloseDrawer')
else:
    print('handleCloseDrawer: pattern not found')

with open(path3, 'wb') as f:
    f.write(data3)

print('Done')
