"""
基础文生图公共逻辑 — 与鉴权后端无关。

本模块只依赖标准库 + PyYAML，**不 import 任何后端**（peta_ai_client / httpx），
因此在无法安装 peta 依赖的机器上也能被 direct 后端安全复用。

后端契约（backend 对象需实现）：
- backend.model                         模型名（str）
- backend.generate(data, timeout)       POST 生图，成功返回解析后的 JSON dict；
                                         失败抛异常（消息含 status/body）
- backend.download(url, timeout)        GET 图片字节（当返回为 url 格式时用）
"""

import os
import re
import sys
import base64
import time

_CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.yaml")
_ENV_PLACEHOLDER = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")


def _resolve_placeholders(value):
    """把字符串里的 ${ENV_VAR} 替换成环境变量值；无该变量则替换为空串。"""
    if not isinstance(value, str):
        return value
    return _ENV_PLACEHOLDER.sub(lambda m: os.getenv(m.group(1), ""), value).strip()


def load_config():
    """
    读取 config.yaml、展开 ${ENV_VAR} 占位，并叠加环境变量覆盖。

    返回归一化 dict：
      {"mode": str, "model": str,
       "peta": {"peta_key_id": str, "appid": str},
       "direct": {"base_url": str, "api_key": str}}

    优先级（高→低）：环境变量 TEXT_TO_IMAGE_* > config.yaml > 内置默认。
    """
    raw = {}
    if os.path.exists(_CONFIG_PATH):
        try:
            import yaml
        except ImportError:
            print("ERROR: 缺少依赖 PyYAML。请先安装：")
            print("  pip install pyyaml")
            sys.exit(1)
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            loaded = yaml.safe_load(f) or {}

        def walk(node):
            if isinstance(node, dict):
                return {k: walk(v) for k, v in node.items()}
            if isinstance(node, list):
                return [walk(v) for v in node]
            return _resolve_placeholders(node)

        raw = walk(loaded)

    peta = raw.get("peta") or {}
    direct = raw.get("direct") or {}

    mode = (os.getenv("TEXT_TO_IMAGE_MODE") or raw.get("mode") or "peta").strip().lower()
    model = (os.getenv("TEXT_TO_IMAGE_MODEL") or raw.get("model") or "gpt-image-2").strip()

    return {
        "mode": mode,
        "model": model,
        "peta": {
            "peta_key_id": (os.getenv("TEXT_TO_IMAGE_PETA_KEY_ID") or peta.get("peta_key_id") or "").strip(),
            "appid": (os.getenv("TEXT_TO_IMAGE_APPID") or peta.get("appid") or "").strip(),
        },
        "direct": {
            "base_url": (os.getenv("TEXT_TO_IMAGE_BASE_URL") or direct.get("base_url") or "").strip(),
            "api_key": (os.getenv("TEXT_TO_IMAGE_API_KEY") or direct.get("api_key") or "").strip(),
        },
    }


def generate_and_save(backend, prompt, output_path="output.png", size="1024x1024",
                      quality="auto", max_retries=3):
    """发送 prompt，带重试地把生成图片保存到本地。成功返回路径，失败返回 None。"""
    data = {
        "model": backend.model,
        "prompt": prompt,
        "n": 1,
        "size": size,
        "quality": quality,
    }

    print("正在生成图片...")
    print(f"  Prompt: {prompt[:100]}{'...' if len(prompt) > 100 else ''}")
    print(f"  Model: {backend.model}")
    print(f"  Size: {size}")
    print(f"  Quality: {quality}")
    print(f"  Output: {output_path}")

    for attempt in range(1, max_retries + 1):
        try:
            result = backend.generate(data, timeout=120)
            image_data = result.get("data", [])

            if not image_data:
                print(f"  [重试 {attempt}/{max_retries}] 返回成功但无图片数据")
                if attempt < max_retries:
                    time.sleep(2**attempt)
                continue

            # 解析图片（支持 b64_json 和 url 两种返回格式）
            item = image_data[0]
            if "b64_json" in item:
                image_bytes = base64.b64decode(item["b64_json"])
            elif "url" in item:
                image_bytes = backend.download(item["url"], timeout=60)
            else:
                print(f"  未知的响应格式: {list(item.keys())}")
                return None

            os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
            with open(output_path, "wb") as f:
                f.write(image_bytes)

            print(f"  图片已保存: {output_path}")
            return output_path

        except Exception as e:  # noqa: BLE001 — 各类网络/HTTP 异常统一重试
            print(f"  [重试 {attempt}/{max_retries}] 请求失败: {e}")

        if attempt < max_retries:
            wait = 2**attempt
            print(f"  等待 {wait}s 后重试...")
            time.sleep(wait)

    print(f"  生成失败，已重试 {max_retries} 次")
    return None


def parse_args():
    """解析命令行参数（peta / direct 两种模式共用）。"""
    import argparse

    parser = argparse.ArgumentParser(description="文生图工具（单张）")
    parser.add_argument("prompt", nargs="?", default=None, help="图片描述 prompt（位置参数，可选）")
    parser.add_argument("--prompt-file", "-pf", default=None, help="从文件读取 prompt（避免 shell 转义问题）")
    parser.add_argument("-o", "--output", default="output.png", help="输出文件路径")
    parser.add_argument("-s", "--size", default="1024x1024", help="图片尺寸")
    parser.add_argument("-q", "--quality", default="auto", help="图片质量")
    return parser.parse_args()


def execute(backend, args):
    """根据已解析的参数执行单张生成（构造好 backend 后调用）。"""
    prompt = None
    if args.prompt_file:
        with open(args.prompt_file, "r", encoding="utf-8") as f:
            prompt = f.read().strip()
    elif args.prompt:
        prompt = args.prompt

    if not prompt:
        print("ERROR: 必须提供 prompt（位置参数或 --prompt-file）")
        sys.exit(1)

    result = generate_and_save(
        backend,
        prompt=prompt,
        output_path=args.output,
        size=args.size,
        quality=args.quality,
    )

    if result:
        print(f"\n完成！图片位于: {result}")
    else:
        print("\n生成失败，请检查配置和网络。")
        sys.exit(1)
