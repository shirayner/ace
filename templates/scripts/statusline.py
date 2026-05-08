import sys, json, subprocess

try:
    d = json.load(sys.stdin)
except Exception:
    print('')
    sys.exit(0)

cwd = d.get('workspace', {}).get('current_dir', '')
model = d.get('model', {}).get('display_name', '')
used = d.get('context_window', {}).get('used_percentage')

parts = []
if model:
    parts.append(model)
if used is not None:
    parts.append(f'ctx:{round(used)}%')

try:
    branch = subprocess.check_output(
        ['git', '-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'],
        stderr=subprocess.DEVNULL, text=True
    ).strip()
    if branch:
        parts.append(branch)
except Exception:
    pass

if cwd:
    parts.append(cwd.rstrip('/').split('/')[-1])

print(' | '.join(parts))
