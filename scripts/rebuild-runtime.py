import os, tarfile

BASE = r'D:\二次开发\desktop\runtime'
OUT = r'D:\二次开发\cdn'
SERVICES = {
    'openclaw': ('openclaw', '2026.7.1', 'openclaw-win-x64.tar.gz'),
    'n8n': ('n8n', '1.62.0', 'n8n-win-x64.tar.gz'),
    'mcp': ('mcp', '1.0.0', 'mcp-win-x64.tar.gz'),
    'hermes': ('hermes', '0.19.0', 'hermes-win-x64.tar.gz'),
}

def build(src, out):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if os.path.exists(out):
        os.remove(out)
    with tarfile.open(out, 'w:gz') as tf:
        for name in sorted(os.listdir(src)):
            tf.add(os.path.join(src, name), arcname=name, recursive=True)
    print('built', out, os.path.getsize(out))

for svc, (d, ver, fn) in SERVICES.items():
    build(os.path.join(BASE, d), os.path.join(OUT, svc, ver, fn))