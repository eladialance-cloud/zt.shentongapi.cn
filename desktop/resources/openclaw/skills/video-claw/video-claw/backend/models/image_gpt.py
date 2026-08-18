import os
import sys

models_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(models_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import time
import uuid
import base64
import httpx
import logging
from openai import OpenAI
from config import Config
try:
    from models.image_processor import ImageProcessor
except ImportError:
    from image_processor import ImageProcessor

logger = logging.getLogger(__name__)


class ImageGPT:
    """
    OpenAI 图片生成客户端
    支持模型：
        - sora_image → Images API
        - gpt-image-2 → Responses API
    """
    def __init__(self,
                 api_key: str = None,
                 base_url: str = None,
                 proxy: str = None,
                 timeout: float = 300.0):
        """
        OpenAI 图片生成客户端
        :param api_key: API Key
        :param base_url: 自定义 Base URL
        :param proxy: 当前 provider 显式启用时使用的代理
        :param timeout: 超时时间
        """
        self.api_key = api_key or Config.OPENAI_API_KEY
        self.timeout = timeout
        
        kwargs = {"api_key": self.api_key, "timeout": self.timeout}
        
        self.base_url = base_url or Config.OPENAI_BASE_URL
        if proxy is None:
            proxy = Config.provider_proxy("openai")
        self.proxy = proxy
        if proxy:
            kwargs["http_client"] = httpx.Client(
                proxy=proxy,
                timeout=self.timeout,
            )
        if self.base_url:
            kwargs["base_url"] = self.base_url
            
        self.client = OpenAI(**kwargs)
        self.max_attempts = 10
        self.image_processor = ImageProcessor()

    def _encode_image_to_base64(self, image_path: str) -> str:
        """将本地图片转换为 Base64 编码"""
        if not image_path or not os.path.exists(image_path):
            return image_path
        
        try:
            with open(image_path, "rb") as f:
                img_data = base64.b64encode(f.read()).decode("utf-8")
            ext = os.path.splitext(image_path)[1].lower().replace(".", "")
            if ext not in ["png", "jpg", "jpeg", "webp"]:
                ext = "png"
            return f"data:image/{ext};base64,{img_data}"
        except Exception as e:
            logger.warning("Failed to encode image %s: %s", image_path, e)
            return image_path

    def _post_generation(self, payload):
        """POST {base}/images/generations，兼容平台统一响应信封 {code,data,message,timestamp}。"""
        url = self.base_url.rstrip("/") + "/images/generations"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        client_kwargs = {"timeout": self.timeout}
        if self.proxy:
            client_kwargs["proxy"] = self.proxy
        with httpx.Client(**client_kwargs) as client:
            resp = client.post(url, headers=headers, json=payload)
        text = resp.text or ""
        if resp.status_code >= 400:
            raise RuntimeError(f"图片接口 HTTP {resp.status_code}: {text[:300]}")

        try:
            body = resp.json()
        except Exception:
            body = None

        # 平台统一信封: {"code":0,"data":...,"message":"success","timestamp":...}
        # 兼容直连 OpenAI 式网关（无信封，data 直接是列表）两种形态
        if isinstance(body, dict) and "code" in body:
            if body.get("code") not in (0, "0", None):
                raise RuntimeError(f"图片生成失败(code={body.get('code')}): {body.get('message') or text[:300]}")
            inner = body.get("data")
        else:
            inner = body

        # inner 可能是 {"created":..., "data":[...]}，也可能是 [...]
        if isinstance(inner, dict) and isinstance(inner.get("data"), list):
            return inner["data"]
        if isinstance(inner, list):
            return inner
        raise RuntimeError(f"无法识别的图片响应: {text[:300]}")

    def generate_image(self, prompt, size="1024x1024", quality="high", model="gpt-image-2",
                       save_dir=None, image_urls=None):
        """Generate a single image, download it, and return the local file path.

        Args:
            prompt: 图片描述提示词
            size: 图片尺寸
            quality: 图片质量
            model: 模型名称 (sora_image / gpt-image-2 / llm-proxy 模型)
            save_dir: 保存目录（不传则返回 URL 或 base64）
            image_urls: 参考图片 URL 列表（仅 gpt-image-2 支持）
        """

        attempts = 0
        last_error = None

        # 处理参考图片
        extra_body = {}
        if image_urls and isinstance(image_urls, list) and len(image_urls) > 0:
            # 中转站通常支持通过 extra_body 传递 image_url 或 ref_image
            ref_images = [self._encode_image_to_base64(image_urls[i]) for i in range(min(len(image_urls), 6))]
            extra_body = {"image_url": ref_images}

        payload = {"model": model, "prompt": prompt, "size": size, "quality": quality, "n": 1}
        payload.update(extra_body)

        while attempts < self.max_attempts:
            try:
                items = self._post_generation(payload)

                if not items:
                    raise RuntimeError("API 返回数据为空")

                img = items[0]
                if not isinstance(img, dict):
                    # 兼容 OpenAI SDK 风格对象
                    if hasattr(img, 'b64_json'):
                        img = {'b64_json': img.b64_json}
                    elif hasattr(img, 'url'):
                        img = {'url': img.url}
                    else:
                        raise RuntimeError("未在响应中找到 url 或 b64_json")

                b64 = img.get('b64_json') or img.get('b64')
                url = img.get('url')

                # 1. 处理 Base64 格式 (中转站常用)
                if b64:
                    if save_dir:
                        os.makedirs(save_dir, exist_ok=True)
                        file_name = f"gpt_{int(time.time())}_{uuid.uuid4().hex[:6]}.png"
                        file_path = os.path.join(save_dir, file_name)
                        with open(file_path, "wb") as f:
                            f.write(base64.b64decode(b64))
                        return file_path
                    return b64

                # 2. 处理 URL 格式
                elif url:
                    if save_dir:
                        os.makedirs(save_dir, exist_ok=True)
                        file_name = f"gpt_{int(time.time())}_{uuid.uuid4().hex[:6]}.png"
                        file_path = os.path.join(save_dir, file_name)
                        if self.image_processor.download_image(url, file_path, proxies=Config.requests_proxies("openai")):
                            return file_path
                        return url

                raise RuntimeError("未在响应中找到 url 或 b64_json")
            except (httpx.HTTPError, TimeoutError, OSError) as e:
                # 网络类错误才重试；业务/解析错误直接抛出
                last_error = e
                attempts += 1
                if attempts >= self.max_attempts:
                    break
                logger.warning("OpenAI image generation failed; retrying in 10 seconds: %s", e)
                time.sleep(10)
        raise Exception(f"Max attempts reached, failed to generate image. Last error: {last_error}")

    def generate_images(self, prompt, count=4, size="1024x1024", quality="standard", model=None):
        """Generate multiple image URLs by calling Images API 'count' times."""
        urls = []
        for _ in range(count):
            url = self.generate_image(prompt=prompt, size=size, quality=quality, model=model)
            urls.append(url)
        return urls


if __name__ == "__main__":
    import sys
    import tempfile
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from config import Config

    MODELS = ["gpt-image-2"]
    save_dir = "code/result/image/test_avail"
    api_key = Config.OPENAI_API_KEY
    base_url = Config.OPENAI_BASE_URL
    if not api_key:
        print("✗ OPENAI_API_KEY 未设置，跳过")
        sys.exit(1)
    print("=== GPT 图片生成测试 ===")
    print(f"  API Key: {api_key[:6]}***")
    print(f"  Base URL: {base_url}")


    # 文生图
    print("\n=== GPT 文生图可用性测试 ===")
    img_prompt = "A cute orange cat lying on a sunny windowsill, watercolor style"
    img_path = ""
    client = ImageGPT(api_key=api_key, base_url=Config.OPENAI_BASE_URL, proxy=Config.provider_proxy("openai"))
    for model in MODELS:
        print(f"\nTesting model: {model}")
        print(f"Prompt: {img_prompt}")
        print(f"Image path: {img_path}")
        client.max_attempts = 1
        t0 = time.time()
        os.makedirs(save_dir, exist_ok=True)
        try:
            path = client.generate_image(prompt=img_prompt, size="1024x1024",
                                                model=model, save_dir=save_dir)
            elapsed = time.time() - t0
            print(f"✓ 生成成功 ({elapsed:.1f}s): {path}")
        except Exception as e:
            elapsed = time.time() - t0
            print(f"✗ 失败 ({elapsed:.1f}s): {e}")

    # 图生图
    print("\n=== GPT 图生图可用性测试 ===")
    img_prompt = "Turn this cat into a cute cartoon character with big eyes and a playful expression"
    img_path = "code/result/image/test_avail/test_input.jpg"
    for model in MODELS:
        print(f"\nTesting model: {model}")
        print(f"Prompt: {img_prompt}")
        print(f"Image path: {img_path}")
        client.max_attempts = 1
        t0 = time.time()
        os.makedirs(save_dir, exist_ok=True)
        try:
            path = client.generate_image(prompt=img_prompt, size="1024x1024",
                                                model=model, save_dir=save_dir, image_urls=[img_path])
            elapsed = time.time() - t0
            print(f"✓ 生成成功 ({elapsed:.1f}s): {path}")
        except Exception as e:
            elapsed = time.time() - t0
            print(f"✗ 失败 ({elapsed:.1f}s): {e}") 
