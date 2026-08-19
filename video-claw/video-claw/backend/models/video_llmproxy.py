"""
平台 llm-proxy 视频生成客户端（深瞳 AI 桌面端适配层）

调用平台中转（OpenAI 兼容异步任务制）：
    POST {base_url}/videos/generations        提交任务 -> {"id": <task_id>, "status": "pending"|"processing"}
    GET  {base_url}/videos/generations/{id}   轮询状态 -> {"status": "done"|"failed"|..., "resultUrls": [...], "error": "..."}

任务完成后下载 resultUrls[0] 到本地 save_path，返回远端视频 URL。
该通道已并入平台 llm-proxy -> media-generation 计费链路，用户无需任何第三方 API Key。
"""

import base64
import mimetypes
import os
import sys
import time

models_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(models_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import logging
from typing import Optional

import requests
from config import Config

logger = logging.getLogger(__name__)


class LlmProxyVideoClient:
    """
    平台中转视频生成客户端
    - api_key: 用户 llm-proxy 静态 Key（桌面端自动注入）
    - base_url: llm-proxy 网关地址，如 https://zt.shentongapi.cn/api/llm-proxy/v1
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 120.0,
    ) -> None:
        self.api_key = api_key or Config.LLMPROXY_API_KEY or ""
        self.base_url = (base_url or Config.LLMPROXY_BASE_URL or "").rstrip("/")
        self.timeout = timeout

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    @staticmethod
    def _unwrap(data: dict) -> dict:
        """解平台统一响应信封 {code,data,message,timestamp}，兼容无信封直连网关。"""
        if isinstance(data, dict) and "code" in data:
            if data.get("code") not in (0, "0", None):
                raise RuntimeError(f"llm-proxy 返回错误(code={data.get('code')}): {data.get('message') or str(data)[:300]}")
            inner = data.get("data")
            return inner if isinstance(inner, dict) else data
        return data

    def _encode_image(self, image_path: Optional[str]) -> Optional[str]:
        """本地图片 -> data URL（网关 media-generation 按需读取 image_url）。"""
        if not image_path or not os.path.exists(image_path):
            return None
        try:
            with open(image_path, "rb") as f:
                data = f.read()
            ext = os.path.splitext(image_path)[1].lstrip(".").lower() or "png"
            if ext not in ("png", "jpg", "jpeg", "webp"):
                ext = "png"
            return f"data:image/{ext};base64,{base64.b64encode(data).decode('utf-8')}"
        except Exception as exc:  # noqa: BLE001
            logger.warning("LlmProxyVideoClient: 图片编码失败 %s: %s", image_path, exc)
            return None

    def _submit(self, payload: dict) -> dict:
        if not self.api_key:
            raise RuntimeError("llm-proxy 未配置 api_key，请先在桌面端设置中完成登录")
        if not self.base_url:
            raise RuntimeError("llm-proxy 未配置 base_url")

        url = f"{self.base_url}/videos/generations"
        logger.info("LlmProxyVideoClient: 提交视频任务 model=%s", payload.get("model"))
        resp = requests.post(url, json=payload, headers=self._headers(), timeout=self.timeout)
        if resp.status_code >= 400:
            raise RuntimeError(
                f"llm-proxy 视频任务提交失败: HTTP {resp.status_code}: {resp.text[:300]}"
            )
        data = resp.json() or {}
        inner = self._unwrap(data)
        task_id = inner.get("id") or inner.get("task_id")
        if not task_id:
            raise RuntimeError(
                f"llm-proxy 视频任务响应缺少任务 ID: {str(data)[:300]}"
            )
        return {"task_id": str(task_id), "status": inner.get("status")}

    def _poll(self, task_id: str, poll_interval: float = 5.0, max_attempts: int = 240) -> dict:
        url = f"{self.base_url}/videos/generations/{task_id}"
        for attempt in range(1, max_attempts + 1):
            resp = requests.get(url, headers=self._headers(), timeout=self.timeout)
            if resp.status_code >= 400:
                raise RuntimeError(
                    f"llm-proxy 视频任务查询失败: HTTP {resp.status_code}: {resp.text[:300]}"
                )
            data = resp.json() or {}
            inner = self._unwrap(data)
            status = str(inner.get("status") or inner.get("task_status") or "").lower()
            if status in ("done", "succeeded", "completed", "success"):
                return inner
            if status in ("failed", "error", "cancelled", "canceled"):
                error = inner.get("error") or inner.get("message") or "任务失败"
                raise RuntimeError(f"llm-proxy 视频生成失败: {str(error)[:300]}")
            logger.info(
                "LlmProxyVideoClient: 任务 %s 状态=%s（%s/%s）",
                task_id,
                status or "pending",
                attempt,
                max_attempts,
            )
            time.sleep(poll_interval)
        raise RuntimeError(f"llm-proxy 视频生成超时（{max_attempts * poll_interval:.0f}s），任务 ID={task_id}")

    def _extract_video_url(self, data: dict) -> Optional[str]:
        data = self._unwrap(data)
        urls = data.get("resultUrls") or data.get("result_urls") or []
        if isinstance(urls, str):
            urls = [urls]
        if urls and isinstance(urls, list):
            for item in urls:
                if isinstance(item, str) and item:
                    return item
                if isinstance(item, dict):
                    url = item.get("url") or item.get("video_url")
                    if url:
                        return str(url)
        output = data.get("output")
        if isinstance(output, dict):
            url = output.get("video_url") or output.get("url")
            if url:
                return str(url)
        return None

    def generate_video(
        self,
        prompt: str,
        image_path: Optional[str] = None,
        input_images: Optional[list[str]] = None,
        save_path: str = "",
        model: str = "wan2.7-i2v",
        duration: int = 5,
        video_ratio: Optional[str] = None,
        resolution: Optional[str] = None,
        fps: Optional[int] = None,
        negative_prompt: Optional[str] = None,
        seed: Optional[int] = None,
    ) -> str:
        """
        提交视频生成任务 -> 轮询 -> 下载产物到本地。

        Returns:
            video_url: 远端视频 URL（llm-proxy 侧已计费）
        """
        payload: dict = {
            "model": model,
            "prompt": prompt,
            "duration": int(duration or 5),
        }
        if video_ratio:
            payload["size"] = str(video_ratio)
        if resolution:
            payload["resolution"] = str(resolution)
        if fps:
            payload["fps"] = int(fps)
        if negative_prompt:
            payload["negative_prompt"] = str(negative_prompt)
        if seed is not None:
            payload["seed"] = int(seed)
        encoded_inputs: list[str] = []
        for item in input_images or []:
            encoded = self._encode_image(item)
            if encoded and encoded not in encoded_inputs:
                encoded_inputs.append(encoded)
        if encoded_inputs:
            payload["inputImages"] = encoded_inputs
        else:
            image_data = self._encode_image(image_path)
            if image_data:
                payload["image_url"] = image_data

        submitted = self._submit(payload)
        task_id = submitted["task_id"]
        data = self._poll(task_id)

        video_url = self._extract_video_url(data)
        if not video_url:
            raise RuntimeError(f"llm-proxy 视频任务完成但未返回产物 URL: {str(data)[:300]}")

        if save_path:
            os.makedirs(os.path.dirname(os.path.abspath(save_path)), exist_ok=True)
            resp = requests.get(video_url, stream=True, timeout=self.timeout)
            if resp.status_code != 200:
                raise RuntimeError(f"llm-proxy 视频下载失败: HTTP {resp.status_code}")
            with open(save_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
            logger.info("LlmProxyVideoClient: 视频已保存: %s", save_path)

        logger.info("LlmProxyVideoClient: 视频生成成功: %s", video_url)
        return video_url


if __name__ == "__main__":
    # 命令行演示：python video_llmproxy.py --model wan2.7-i2v --prompt "..." [--image x.png] [--save out.mp4]
    import argparse

    parser = argparse.ArgumentParser(description="llm-proxy 视频生成客户端")
    parser.add_argument("--model", default="wan2.7-i2v")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--image", default=None)
    parser.add_argument("--save", default="")
    parser.add_argument("--duration", type=int, default=5)
    args = parser.parse_args()

    client = LlmProxyVideoClient()
    url = client.generate_video(
        prompt=args.prompt,
        image_path=args.image,
        save_path=args.save,
        model=args.model,
        duration=args.duration,
    )
    print(url)
