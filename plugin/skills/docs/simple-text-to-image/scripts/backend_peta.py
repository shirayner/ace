"""
peta 后端 — 公司 peta AI 网关，用 peta_key_id + appid 换取临时密钥再请求。

依赖 peta_ai_client（如缺失见 README / SKILL.md 安装说明）。**仅当 config.yaml
mode=peta 时才会被 dispatcher import**，direct 机器不会触发这里的第三方依赖。
"""

import os
import sys


class PetaBackend:
    """基于 peta_ai_client.AIClient 的生图后端。"""

    def __init__(self, peta_key_id, appid, model):
        if not peta_key_id or not appid:
            print("ERROR: peta 模式需要 peta_key_id 和 appid。")
            print("请在 config.yaml 的 peta 段配置，或设置环境变量 "
                  "TEXT_TO_IMAGE_PETA_KEY_ID / TEXT_TO_IMAGE_APPID。")
            sys.exit(1)

        # Foundation 在 import peta_ai_client 时即读取 appid，故 PAAS_APP_APPID
        # 必须在 import 之前写入，否则 querykey 报 "Missing required fields: callerId"。
        os.environ["PAAS_APP_APPID"] = appid

        try:
            from peta_ai_client import AIClient
        except ImportError:
            print("ERROR: 缺少依赖 peta_ai_client。请先安装：")
            print("  uv pip install peta-ai-client --native-tls")
            print("若该机器无法安装，请改用 direct 模式（config.yaml 里 mode: direct）。")
            sys.exit(1)

        try:
            self._client = AIClient(peta_key_id=peta_key_id, tags={})
        except Exception as e:  # noqa: BLE001 — 换密钥失败直接终止，交由上层报告
            print(f"ERROR: peta 网关鉴权失败（peta_key_id 换密钥）：{e}")
            sys.exit(1)

        # AIClient.http 是 httpx.Client，base_url 已含 /llm/{peta_key_id}，
        # 生图走相对路径 "v1/images/generations"。
        self._http = self._client.http
        self.model = model

    def generate(self, data, timeout):
        response = self._http.post("v1/images/generations", json=data, timeout=timeout)
        if not response.is_success:
            raise RuntimeError(f"status={response.status_code}, body={response.text[:200]}")
        return response.json()

    def download(self, url, timeout):
        resp = self._http.get(url, timeout=timeout)
        resp.raise_for_status()
        return resp.content


def build_backend(cfg):
    """按配置构造 PetaBackend。"""
    p = cfg["peta"]
    return PetaBackend(peta_key_id=p["peta_key_id"], appid=p["appid"], model=cfg["model"])
