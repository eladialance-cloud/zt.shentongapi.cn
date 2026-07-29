import sys; sys.stdout.reconfigure(encoding='utf-8')
import os

src_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src')
for fp in [os.path.join(src_dir, 'api', 'chat-api.ts'), os.path.join(src_dir, 'api', 'opc-api.ts')]:
    with open(fp, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Search for 椤 character
    idx = content.find('椤')
    if idx >= 0:
        start = max(0, idx - 20)
        end = min(len(content), idx + 20)
        snippet = content[start:end]
        print(f'File: {fp}')
        print(f'Context: [{snippet}]')
        # Show chars around
        for i in range(max(0, idx-5), min(len(content), idx+10)):
            c = content[i]
            print(f'  [{i}] {c} = U+{ord(c):04X}')
    else:
        print(f'No 椤 found in {fp}')
