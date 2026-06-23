"""
文生图脚本 — 通过 OpenAI 兼容接口生成图片

支持三种调用模式：
1. 单张（位置参数）：python text_to_image.py "prompt" -o out.png
2. 单张（文件读取）：python text_to_image.py --prompt-file prompt.txt -o out.png
3. 批量（JSON 配置）：python text_to_image.py --batch batch.json

推荐使用 --prompt-file 或 --batch 模式，避免 shell 特殊字符导致参数截断。

从环境变量读取 TEXT_TO_IMAGE_BASE_URL / TEXT_TO_IMAGE_API_KEY / TEXT_TO_IMAGE_MODEL 配置。
"""

import os
import sys
import json
import base64
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests


# 从环境变量读取配置
BASE_URL = os.getenv("TEXT_TO_IMAGE_BASE_URL", "").rstrip("/")
API_KEY = os.getenv("TEXT_TO_IMAGE_API_KEY", "")
MODEL = os.getenv("TEXT_TO_IMAGE_MODEL", "gpt-image-2")

if not BASE_URL or not API_KEY:
    print("ERROR: 环境变量 TEXT_TO_IMAGE_BASE_URL 和 TEXT_TO_IMAGE_API_KEY 未配置。")
    print("请在 Claude Code settings.json 的 env 中配置，或设置系统环境变量。")
    sys.exit(1)

# 构建请求地址和 Headers
ENDPOINT = f"{BASE_URL}/v1/images/generations"
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}


def text_to_image(
    prompt: str,
    output_path: str = "output.png",
    size: str = "1024x1024",
    quality: str = "auto",
    max_retries: int = 3,
) -> str | None:
    """
    文生图：发送 prompt，保存生成的图片到本地。

    Args:
        prompt: 图片描述
        output_path: 输出文件路径
        size: 图片尺寸 (1024x1024, 1536x1024, 1024x1536)
        quality: 图片质量 (auto/low/medium/high)
        max_retries: 最大重试次数

    Returns:
        成功返回图片路径，失败返回 None
    """
    data = {
        "model": MODEL,
        "prompt": prompt,
        "n": 1,
        "size": size,
        "quality": quality,
    }

    print(f"正在生成图片...")
    print(f"  Prompt: {prompt[:100]}{'...' if len(prompt) > 100 else ''}")
    print(f"  Model: {MODEL}")
    print(f"  Size: {size}")
    print(f"  Quality: {quality}")
    print(f"  Output: {output_path}")

    for attempt in range(1, max_retries + 1):
        try:
            response = requests.post(
                url=ENDPOINT, headers=HEADERS, json=data, timeout=120
            )

            if response.ok:
                result = response.json()
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
                    img_resp = requests.get(item["url"], timeout=60)
                    img_resp.raise_for_status()
                    image_bytes = img_resp.content
                else:
                    print(f"  未知的响应格式: {list(item.keys())}")
                    return None

                # 保存图片
                os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
                with open(output_path, "wb") as f:
                    f.write(image_bytes)

                print(f"  图片已保存: {output_path}")
                return output_path

            else:
                print(
                    f"  [重试 {attempt}/{max_retries}] 请求失败: "
                    f"status={response.status_code}, body={response.text[:200]}"
                )

        except requests.exceptions.RequestException as e:
            print(f"  [重试 {attempt}/{max_retries}] 请求异常: {e}")

        if attempt < max_retries:
            wait = 2**attempt
            print(f"  等待 {wait}s 后重试...")
            time.sleep(wait)

    print(f"  生成失败，已重试 {max_retries} 次")
    return None


def run_batch(batch_file: str) -> None:
    """
    批量模式：从 JSON 文件读取任务列表，脚本内部并行执行。

    JSON 格式：
    [
      {"prompt": "...", "output": "./images/foo.png", "size": "1536x1024", "quality": "high"},
      {"prompt": "...", "output": "./images/bar.png", "size": "1024x1024", "quality": "auto"}
    ]

    也可以用 prompt_file 替代 prompt：
    [
      {"prompt_file": "./prompts/p1.txt", "output": "...", "size": "...", "quality": "..."}
    ]
    """
    with open(batch_file, "r", encoding="utf-8") as f:
        tasks = json.load(f)

    if not isinstance(tasks, list) or len(tasks) == 0:
        print("ERROR: batch 文件必须是非空 JSON 数组")
        sys.exit(1)

    print(f"批量模式：共 {len(tasks)} 个任务，并行执行中...\n")

    results = {}

    def execute_task(idx, task):
        # 获取 prompt
        prompt = task.get("prompt", "")
        if not prompt and "prompt_file" in task:
            pf = task["prompt_file"]
            with open(pf, "r", encoding="utf-8") as fp:
                prompt = fp.read().strip()
        if not prompt:
            return idx, None, "无 prompt"

        output = task.get("output", f"output_{idx}.png")
        size = task.get("size", "1024x1024")
        quality = task.get("quality", "auto")

        result = text_to_image(
            prompt=prompt,
            output_path=output,
            size=size,
            quality=quality,
        )
        return idx, result, None

    # 并行执行（线程池，IO 密集型任务适合线程）
    max_workers = min(len(tasks), 8)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(execute_task, i, task): i
            for i, task in enumerate(tasks)
        }

        for future in as_completed(futures):
            idx, result, error = future.result()
            results[idx] = {"success": result is not None, "path": result, "error": error}

    # 汇总报告
    print("\n" + "=" * 50)
    print("批量生成完成：")
    print("=" * 50)

    success_count = 0
    fail_count = 0
    for i in range(len(tasks)):
        r = results.get(i, {"success": False, "path": None, "error": "未执行"})
        status = "✓" if r["success"] else "✗"
        detail = r["path"] if r["success"] else r.get("error", "未知错误")
        print(f"  [{status}] 任务 {i + 1}: {detail}")
        if r["success"]:
            success_count += 1
        else:
            fail_count += 1

    print(f"\n成功: {success_count}/{len(tasks)}, 失败: {fail_count}/{len(tasks)}")

    if fail_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="文生图工具")
    parser.add_argument("prompt", nargs="?", default=None, help="图片描述 prompt（位置参数，可选）")
    parser.add_argument("--prompt-file", "-pf", default=None, help="从文件读取 prompt（避免 shell 转义问题）")
    parser.add_argument("--batch", "-b", default=None, help="批量模式：JSON 配置文件路径")
    parser.add_argument("-o", "--output", default="output.png", help="输出文件路径")
    parser.add_argument("-s", "--size", default="1024x1024", help="图片尺寸")
    parser.add_argument("-q", "--quality", default="auto", help="图片质量")

    args = parser.parse_args()

    # 模式 1：批量
    if args.batch:
        run_batch(args.batch)
        sys.exit(0)

    # 获取 prompt（优先 --prompt-file，其次位置参数）
    prompt = None
    if args.prompt_file:
        with open(args.prompt_file, "r", encoding="utf-8") as f:
            prompt = f.read().strip()
    elif args.prompt:
        prompt = args.prompt

    if not prompt:
        print("ERROR: 必须提供 prompt（位置参数或 --prompt-file）")
        parser.print_help()
        sys.exit(1)

    # 模式 2/3：单张生成
    result = text_to_image(
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
