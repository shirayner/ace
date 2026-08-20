"""
文生图入口（dispatcher）— 按 config.yaml 的 mode 选择鉴权后端。

用法（三种，与原脚本一致）：
1. 单张（位置参数）：python text_to_image.py "prompt" -o out.png
2. 单张（文件读取）：python text_to_image.py --prompt-file prompt.txt -o out.png
3. 批量（JSON 配置）：python text_to_image.py --batch batch.json

推荐使用 --prompt-file 或 --batch 模式，避免 shell 特殊字符导致参数截断。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
鉴权后端由同目录 config.yaml 的 mode 字段切换，两种后端互相隔离：

  mode: peta    → backend_peta.py    公司网关换密钥，需 peta_ai_client 依赖
  mode: direct  → backend_direct.py  固定密钥直连，零第三方依赖（纯 urllib）

关键设计：dispatcher **按 mode 条件 import 对应后端**。选 direct 时永不 import
peta_ai_client，因此无法安装 peta 依赖的机器只要把 mode 切成 direct 即可工作。

配置优先级（高→低）：环境变量 TEXT_TO_IMAGE_* > config.yaml > 内置默认。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import sys

import _shared


def build_backend(cfg):
    """按 mode 条件 import 对应后端模块并构造 backend。"""
    mode = cfg["mode"]
    if mode == "peta":
        import backend_peta
        return backend_peta.build_backend(cfg)
    if mode == "direct":
        import backend_direct
        return backend_direct.build_backend(cfg)
    print(f"ERROR: 未知 mode='{mode}'，仅支持 peta 或 direct。请检查 config.yaml 或 TEXT_TO_IMAGE_MODE。")
    sys.exit(1)


if __name__ == "__main__":
    args = _shared.parse_args()
    cfg = _shared.load_config()
    backend = build_backend(cfg)
    print(f"[鉴权模式] {cfg['mode']}")
    _shared.execute(backend, args)
