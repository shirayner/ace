import json
import os
import tempfile

base = os.path.join(tempfile.gettempdir(), 'goal3', '.ace', 'tasks', 'archive',
                    '2026-08-13-pass-path', 'state.json')
s = json.load(open(base, encoding='utf-8'))
print(json.dumps({k: s.get(k) for k in ('status', 'completed_at', 'archived_at', 'accept')},
                 ensure_ascii=False, indent=2))
