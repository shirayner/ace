"""
direct 后端 — 固定密钥直连 OpenAI 兼容网关。

**零第三方依赖**，只用标准库 urllib，因此在无法安装 peta_ai_client / httpx 的
机器上也能工作。当 config.yaml mode=direct 时由 dispatcher import。

对应的 HTTP 调用等价于：
  POST {base_url}/v1/images/generations
  Authorization: Bearer {api_key}
  Content-Type: application/json
  {"model": ..., "prompt": ..., "size": ..., "n": 1, "quality": ...}
"""

import sys
import json
import urllib.request
import urllib.error


class DirectBackend:
    """固定密钥 + base_url 直连的生图后端（纯 urllib）。"""

    def __init__(self, base_url, api_key, model):
        if not base_url or not api_key:
            print("ERROR: direct 模式需要 base_url 和 api_key。")
            print("请在 config.yaml 的 direct 段配置，或设置环境变量 "
                  "TEXT_TO_IMAGE_BASE_URL / TEXT_TO_IMAGE_API_KEY。")
            sys.exit(1)
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self.model = model

    def generate(self, data, timeout):
        url = f"{self._base_url}/v1/images/generations"
        body = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._api_key}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")[:200]
            raise RuntimeError(f"status={e.code}, body={detail}") from e

    def download(self, url, timeout):
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.read()


def build_backend(cfg):
    """按配置构造 DirectBackend。"""
    d = cfg["direct"]
    return DirectBackend(base_url=d["base_url"], api_key=d["api_key"], model=cfg["model"])
