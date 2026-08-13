"""Central model registry.

All backend model metadata is registered in this file, including provider,
model type, concurrency, pricing, and API capability tags.
"""

import os
import sys

models_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(models_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from copy import deepcopy
import time
from typing import Any, Optional

MODEL_CONFIG: dict[str, Any] = {'models': {
            'qwen3.8-max': {'name': 'Qwen 3.8 Max (平台中转)',
                            'provider': 'llmproxy',
                            'family': 'qwen',
                            'type': ['llm', 'vlm'],
                            'concurrency': 10,
                            'price_per_1k_input_token': 0,
                            'price_per_1k_output_token': 0,
                            'capabilities': {'ability_type': 'vision_language',
                                             'ability_types': ['text_generation', 'vision_language'],
                                             'adapter_ability_types': ['text_generation', 'vision_language'],
                                             'input_modalities': ['text', 'image'],
                                             'adapter_input_modalities': ['text', 'image'],
                                             'api_contract_verified': True}},
            'qwen-image-3.0': {'name': 'Qwen Image 3.0 (平台中转)',
                              'provider': 'llmproxy',
                              'family': 'qwen',
                              'type': ['t2i', 'i2i'],
                              'concurrency': 5,
                              'price_per_image': 0,
                              'capabilities': {'ability_type': 'image_generation',
                                               'ability_types': ['text_to_image', 'image_to_image'],
                                               'adapter_ability_types': ['text_to_image', 'image_to_image'],
                                               'input_modalities': ['text', 'image'],
                                               'adapter_input_modalities': ['text', 'image'],
                                               'api_contract_verified': True}},
            'deepseek-chat': {'name': 'DeepSeek Chat',
                              'provider': 'deepseek',
                              'type': ['llm'],
                              'concurrency': 10,
                              'price_per_1k_input_token': 0.002,
                              'price_per_1k_output_token': 0.008},
            'deepseek-reasoner': {'name': 'DeepSeek Reasoner',
                                  'provider': 'deepseek',
                                  'type': ['llm'],
                                  'concurrency': 10,
                                  'price_per_1k_input_token': 0.004,
                                  'price_per_1k_output_token': 0.016},
            'deepseek-v4-flash': {'name': 'DeepSeek V4 Flash',
                                  'provider': 'deepseek',
                                  'type': ['llm'],
                                  'concurrency': 10,
                                  'price_per_1k_input_token': 0.001,
                                  'price_per_1k_output_token': 0.004},
            'deepseek-v4-pro': {'name': 'DeepSeek V4 Pro',
                                'provider': 'deepseek',
                                'type': ['llm'],
                                'concurrency': 10,
                                'price_per_1k_input_token': 0.002,
                                'price_per_1k_output_token': 0.008},
            'gpt-4o': {'name': 'GPT-4o',
                       'provider': 'openai',
                       'type': ['llm'],
                       'concurrency': 10,
                       'price_per_1k_input_token': 0.018,
                       'price_per_1k_output_token': 0.072},
            'gpt-5': {'name': 'GPT-5',
                      'provider': 'openai',
                      'type': ['llm'],
                      'concurrency': 10,
                      'price_per_1k_input_token': 0.02,
                      'price_per_1k_output_token': 0.1},
            'gpt-5.4': {'name': 'GPT-5.4',
                        'provider': 'openai',
                        'type': ['llm', 'vlm'],
                        'concurrency': 10,
                        'price_per_1k_input_token': 0.03,
                        'price_per_1k_output_token': 0.12},
            'qwen3.7-max': {'name': 'Qwen 3.7 Max',
                            'provider': 'dashscope',
                            'family': 'qwen',
                            'type': ['llm'],
                            'concurrency': 10,
                            'price_per_1k_input_token': 0.006,
                            'price_per_1k_output_token': 0.024},
            'qwen3.7-plus': {'name': 'Qwen 3.7 Plus',
                             'provider': 'dashscope',
                             'family': 'qwen',
                             'type': ['vlm'],
                             'concurrency': 10,
                             'price_per_1k_input_token': 0.0008,
                             'price_per_1k_output_token': 0.002},
            'qwen3.5-plus': {'name': 'Qwen 3.5 Plus',
                             'provider': 'dashscope',
                             'family': 'qwen',
                             'type': ['vlm'],
                             'concurrency': 10,
                             'price_per_1k_input_token': 0.0008,
                             'price_per_1k_output_token': 0.002},
            'qwen3.6-max-preview': {'name': 'Qwen 3.6 Max Preview',
                                    'provider': 'dashscope',
                                    'family': 'qwen',
                                    'type': ['llm'],
                                    'concurrency': 10,
                                    'price_per_1k_input_token': 0.006,
                                    'price_per_1k_output_token': 0.024},
            'qwen3-max': {'name': 'Qwen 3 Max',
                          'provider': 'dashscope',
                          'family': 'qwen',
                          'type': ['llm'],
                          'concurrency': 10,
                          'price_per_1k_input_token': 0.006,
                          'price_per_1k_output_token': 0.024},
            'deepseek-v3.2': {'name': 'DeepSeek V3.2 (DashScope)',
                              'provider': 'dashscope',
                              'family': 'deepseek',
                              'type': ['llm'],
                              'concurrency': 10,
                              'price_per_1k_input_token': 0.002,
                              'price_per_1k_output_token': 0.008},
            'qwen3.6-plus': {'name': 'Qwen 3.6 Plus',
                             'provider': 'dashscope',
                             'family': 'qwen',
                             'type': ['vlm'],
                             'concurrency': 10,
                             'price_per_1k_input_token': 0.0008,
                             'price_per_1k_output_token': 0.002},
            'qwen3.6-flash': {'name': 'Qwen 3.6 Flash',
                              'provider': 'dashscope',
                              'family': 'qwen',
                              'type': ['vlm'],
                              'concurrency': 10,
                              'price_per_1k_input_token': 0.0001,
                              'price_per_1k_output_token': 0.0001},
            'kimi-k2.6': {'name': 'Kimi K2.6',
                          'provider': 'dashscope',
                          'family': 'kimi',
                          'type': ['llm', 'vlm'],
                          'concurrency': 10,
                          'price_per_1k_input_token': 0.001,
                          'price_per_1k_output_token': 0.003},
            'gemini-2.5-flash': {'name': 'Gemini 2.5 Flash',
                                 'provider': 'gemini',
                                 'type': ['llm'],
                                 'concurrency': 10,
                                 'price_per_1k_input_token': 0.002,
                                 'price_per_1k_output_token': 0.01},
            'gemini-2.0-flash': {'name': 'Gemini 2.0 Flash',
                                 'provider': 'gemini',
                                 'type': ['llm', 'vlm'],
                                 'concurrency': 10,
                                 'price_per_1k_input_token': 0.002,
                                 'price_per_1k_output_token': 0.01},
            'gemini-2.5-flash-image': {'name': 'Gemini 2.5 Flash Image',
                                       'provider': 'gemini',
                                       'type': ['vlm'],
                                       'concurrency': 10,
                                       'price_per_1k_input_token': 0.002,
                                       'price_per_1k_output_token': 0.01},
            'wan2.7-image': {'name': 'Wan 2.7 Image',
                             'provider': 'dashscope',
                             'family': 'wan',
                             'type': ['t2i', 'i2i'],
                             'concurrency': 5,
                             'price_per_image': 0.2,
                             'capabilities': {'ability_type': 'image_generation',
                                              'ability_types': ['text_to_image', 'image_to_image', 'reference_image'],
                                              'adapter_ability_types': ['text_to_image',
                                                                        'image_to_image',
                                                                        'reference_image'],
                                              'input_modalities': ['text', 'image'],
                                              'adapter_input_modalities': ['text', 'image'],
                                              'api_contract_verified': True,
                                              'resolutions': ['720P', '1080P', '2K', '4K'],
                                              'ratios': ['16:9', '9:16', '1:1', '4:3', '3:4']}},
            'wan2.7-image-pro': {'name': 'Wan 2.7 Image Pro',
                                 'provider': 'dashscope',
                                 'family': 'wan',
                                 'type': ['t2i', 'i2i'],
                                 'concurrency': 5,
                                 'price_per_image': 0.4,
                                 'capabilities': {'ability_type': 'image_generation',
                                                  'ability_types': ['text_to_image',
                                                                    'image_to_image',
                                                                    'reference_image',
                                                                    'high_quality'],
                                                  'adapter_ability_types': ['text_to_image',
                                                                            'image_to_image',
                                                                            'reference_image'],
                                                  'input_modalities': ['text', 'image'],
                                                  'adapter_input_modalities': ['text', 'image'],
                                                  'api_contract_verified': True,
                                                  'resolutions': ['720P', '1080P', '2K', '4K'],
                                                  'ratios': ['16:9', '9:16', '1:1', '4:3', '3:4']}},
            'wan2.6-t2i': {'name': 'Wan 2.6 T2I',
                           'provider': 'dashscope',
                           'family': 'wan',
                           'type': ['t2i'],
                           'concurrency': 5,
                           'price_per_image': 0.2,
                           'capabilities': {'ability_type': 'image_generation',
                                            'ability_types': ['text_to_image'],
                                            'adapter_ability_types': ['text_to_image'],
                                            'input_modalities': ['text'],
                                            'adapter_input_modalities': ['text'],
                                            'api_contract_verified': True,
                                            'resolutions': ['720P', '1080P', '2K', '4K'],
                                            'ratios': ['16:9', '9:16', '1:1', '4:3', '3:4']}},
            'doubao-seedream-5-0-260128': {'name': 'Seedream 5.0',
                                           'provider': 'ark',
                                           'family': 'seedream',
                                           'type': ['t2i', 'i2i'],
                                           'concurrency': 10,
                                           'price_per_image': 0.22,
                                           'capabilities': {'ability_type': 'image_generation',
                                                            'ability_types': ['text_to_image',
                                                                              'image_to_image',
                                                                              'reference_image',
                                                                              'high_quality'],
                                                            'adapter_ability_types': ['text_to_image',
                                                                                      'image_to_image',
                                                                                      'reference_image'],
                                                            'input_modalities': ['text', 'image'],
                                                            'adapter_input_modalities': ['text', 'image'],
                                                            'api_contract_verified': True,
                                                            'resolutions': ['720P', '1080P', '2K', '4K'],
                                                            'ratios': ['16:9', '9:16', '1:1', '4:3', '3:4']}},
            'doubao-seedream-4-5-251128': {'name': 'Seedream 4.5',
                                           'provider': 'ark',
                                           'family': 'seedream',
                                           'type': ['t2i', 'i2i'],
                                           'concurrency': 10,
                                           'price_per_image': 0.25,
                                           'capabilities': {'ability_type': 'image_generation',
                                                            'ability_types': ['text_to_image',
                                                                              'image_to_image',
                                                                              'reference_image'],
                                                            'adapter_ability_types': ['text_to_image',
                                                                                      'image_to_image',
                                                                                      'reference_image'],
                                                            'input_modalities': ['text', 'image'],
                                                            'adapter_input_modalities': ['text', 'image'],
                                                            'api_contract_verified': True,
                                                            'resolutions': ['720P', '1080P', '2K', '4K'],
                                                            'ratios': ['16:9', '9:16', '1:1', '4:3', '3:4']}},
            'doubao-seedream-4-0-250828': {'name': 'Seedream 4.0',
                                           'provider': 'ark',
                                           'family': 'seedream',
                                           'type': ['t2i', 'i2i'],
                                           'concurrency': 10,
                                           'price_per_image': 0.2,
                                           'capabilities': {'ability_type': 'image_generation',
                                                            'ability_types': ['text_to_image',
                                                                              'image_to_image',
                                                                              'reference_image'],
                                                            'adapter_ability_types': ['text_to_image',
                                                                                      'image_to_image',
                                                                                      'reference_image'],
                                                            'input_modalities': ['text', 'image'],
                                                            'adapter_input_modalities': ['text', 'image'],
                                                            'api_contract_verified': True,
                                                            'resolutions': ['720P', '1080P', '2K', '4K'],
                                                            'ratios': ['16:9', '9:16', '1:1', '4:3', '3:4']}},
            'sora_image': {'name': 'Sora Image',
                           'provider': 'openai',
                           'type': ['t2i'],
                           'concurrency': 3,
                           'price_per_image': 1.45,
                           'capabilities': {'ability_type': 'image_generation',
                                            'ability_types': ['text_to_image'],
                                            'adapter_ability_types': ['text_to_image'],
                                            'input_modalities': ['text'],
                                            'adapter_input_modalities': ['text'],
                                            'api_contract_verified': True}},
            'gpt-image-2': {'name': 'GPT Image 2',
                            'provider': 'openai',
                            'type': ['t2i', 'i2i'],
                            'concurrency': 3,
                            'price_per_image': 1.09,
                            'capabilities': {'ability_type': 'image_generation',
                                             'ability_types': ['text_to_image', 'image_to_image', 'reference_image'],
                                             'adapter_ability_types': ['text_to_image',
                                                                       'image_to_image',
                                                                       'reference_image'],
                                             'input_modalities': ['text', 'image'],
                                             'adapter_input_modalities': ['text', 'image'],
                                             'api_contract_verified': True}},
            'wan2.6-i2v-flash': {'name': 'Wan 2.6 I2V Flash',
                                 'provider': 'dashscope',
                                 'family': 'wan',
                                 'type': ['video'],
                                 'concurrency': 5,
                                 'price_per_second': 0.6,
                                 'capabilities': {'ability_type': 'image_to_video',
                                                  'ability_types': ['first_frame_i2v',
                                                                    'audio_driven_i2v',
                                                                    'multi_shot',
                                                                    'fast_generation'],
                                                  'adapter_ability_types': ['first_frame_i2v'],
                                                  'input_modalities': ['text', 'image', 'audio'],
                                                  'adapter_input_modalities': ['text', 'image'],
                                                  'duration': {'min': 2, 'max': 15, 'integer': True, 'verified': True},
                                                  'resolutions': ['720P', '1080P'],
                                                  'ratios': ['16:9', '9:16', '1:1', '4:3', '3:4'],
                                                  'api_contract_verified': True}},
            'wan2.7-i2v': {'name': 'Wan 2.7 I2V',
                           'provider': 'dashscope',
                           'family': 'wan',
                           'type': ['video'],
                           'concurrency': 5,
                           'price_per_second': 0.8,
                           'capabilities': {'ability_type': 'image_to_video',
                                            'ability_types': ['first_frame_i2v',
                                                              'start_end_frame_i2v',
                                                              'video_continuation',
                                                              'audio_driven_i2v',
                                                              'multi_shot'],
                                            'adapter_ability_types': ['first_frame_i2v',
                                                                      'start_end_frame_i2v',
                                                                      'audio_driven_i2v'],
                                            'input_modalities': ['text', 'image', 'audio', 'video'],
                                            'adapter_input_modalities': ['text', 'image'],
                                            'duration': {'min': 2, 'max': 15, 'integer': True, 'verified': True},
                                            'resolutions': ['720P', '1080P'],
                                            'ratios': ['16:9', '9:16', '1:1', '4:3', '3:4'],
                                            'api_contract_verified': True}},
            'happyhorse-1.0-i2v': {'name': 'Happy Horse 1.0 I2V',
                                   'provider': 'dashscope',
                                   'family': 'happyhorse',
                                   'type': ['video'],
                                   'concurrency': 5,
                                   'price_per_second': 1.0,
                                   'capabilities': {'ability_type': 'image_to_video',
                                                    'ability_types': ['first_frame_i2v', 'native_audio'],
                                                    'adapter_ability_types': ['first_frame_i2v', 'native_audio'],
                                                    'input_modalities': ['text', 'image'],
                                                    'adapter_input_modalities': ['text', 'image'],
                                                    'duration': {'min': 3,
                                                                 'max': 15,
                                                                 'integer': True,
                                                                 'verified': True},
                                                    'resolutions': ['720P', '1080P'],
                                                    'api_contract_verified': True}},
            'happyhorse-1.1-i2v': {'name': 'Happy Horse 1.1 I2V',
                                   'provider': 'dashscope',
                                   'family': 'happyhorse',
                                   'type': ['video'],
                                   'concurrency': 5,
                                   'price_per_second': 1.0,
                                   'capabilities': {'ability_type': 'image_to_video',
                                                    'ability_types': ['first_frame_i2v', 'native_audio'],
                                                    'adapter_ability_types': ['first_frame_i2v', 'native_audio'],
                                                    'input_modalities': ['text', 'image'],
                                                    'adapter_input_modalities': ['text', 'image'],
                                                    'duration': {'min': 3,
                                                                 'max': 15,
                                                                 'integer': True,
                                                                 'verified': True},
                                                    'resolutions': ['720P', '1080P'],
                                                    'api_contract_verified': True}},
            'kling-v3': {'name': 'Kling V3',
                         'provider': 'kling',
                         'type': ['video'],
                         'concurrency': 10,
                         'price_per_second': 1.0,
                         'capabilities': {'ability_type': 'image_to_video',
                                          'ability_types': ['text_to_video',
                                                            'image_to_video',
                                                            'start_end_frame_i2v',
                                                            'native_audio',
                                                            'multi_shot',
                                                            'element_reference'],
                                          'adapter_ability_types': ['first_frame_i2v', 'native_audio'],
                                          'input_modalities': ['text', 'image'],
                                          'adapter_input_modalities': ['text', 'image'],
                                          'duration': {'min': 3, 'max': 15, 'integer': True, 'verified': True},
                                          'resolutions': ['720P', '1080P'],
                                          'api_contract_verified': True}},
            'kling-v2-6': {'name': 'Kling V2.6',
                           'provider': 'kling',
                           'type': ['video'],
                           'concurrency': 10,
                           'price_per_second': 0.5,
                           'capabilities': {'ability_type': 'image_to_video',
                                            'ability_types': ['text_to_video',
                                                              'image_to_video',
                                                              'start_end_frame_i2v',
                                                              'native_audio'],
                                            'adapter_ability_types': ['first_frame_i2v', 'native_audio'],
                                            'input_modalities': ['text', 'image'],
                                            'adapter_input_modalities': ['text', 'image'],
                                            'api_contract_verified': True}},
            'kling-v2-5-turbo': {'name': 'Kling V2.5 Turbo',
                                 'provider': 'kling',
                                 'type': ['video'],
                                 'concurrency': 10,
                                 'price_per_second': 0.3,
                                 'capabilities': {'ability_type': 'image_to_video',
                                                  'ability_types': ['image_to_video'],
                                                  'adapter_ability_types': ['first_frame_i2v', 'native_audio'],
                                                  'input_modalities': ['text', 'image'],
                                                  'adapter_input_modalities': ['text', 'image'],
                                                  'api_contract_verified': True}},
            'doubao-seedance-2-0-260128': {'name': 'Seedance 2.0',
                                           'provider': 'ark',
                                           'family': 'seedance',
                                           'type': ['video'],
                                           'concurrency': 10,
                                           'price_per_second': 0.5,
                                           'capabilities': {'ability_type': 'image_to_video',
                                                            'ability_types': ['text_to_video', 'image_to_video'],
                                                            'adapter_ability_types': ['first_frame_i2v',
                                                                                      'native_audio'],
                                                            'input_modalities': ['text', 'image'],
                                                            'adapter_input_modalities': ['text', 'image'],
                                                            'duration': {'min': 2,
                                                                         'max': 12,
                                                                         'integer': True,
                                                                         'verified': True},
                                                            'resolutions': ['720p', '1080p'],
                                                            'ratios': ['16:9',
                                                                       '4:3',
                                                                       '1:1',
                                                                       '3:4',
                                                                       '9:16',
                                                                       '21:9',
                                                                       'adaptive'],
                                                            'api_contract_verified': True}},
            'doubao-seedance-2-0-fast-260128': {'name': 'Seedance 2.0 Fast',
                                                'provider': 'ark',
                                                'family': 'seedance',
                                                'type': ['video'],
                                                'concurrency': 10,
                                                'price_per_second': 0.3,
                                                'capabilities': {'ability_type': 'image_to_video',
                                                                 'ability_types': ['text_to_video',
                                                                                   'image_to_video',
                                                                                   'fast_generation'],
                                                                 'adapter_ability_types': ['first_frame_i2v',
                                                                                           'native_audio'],
                                                                 'input_modalities': ['text', 'image'],
                                                                 'adapter_input_modalities': ['text', 'image'],
                                                                 'duration': {'min': 2,
                                                                              'max': 12,
                                                                              'integer': True,
                                                                              'verified': True},
                                                                 'resolutions': ['720p', '1080p'],
                                                                 'ratios': ['16:9',
                                                                            '4:3',
                                                                            '1:1',
                                                                            '3:4',
                                                                            '9:16',
                                                                            '21:9',
                                                                            'adaptive'],
                                                                 'api_contract_verified': True}},
            'doubao-seedance-2-0-mini-260615': {'name': 'Seedance 2.0 Mini',
                                                'provider': 'ark',
                                                'family': 'seedance',
                                                'type': ['video'],
                                                'concurrency': 10,
                                                'price_per_second': 0.2,
                                                'capabilities': {'ability_type': 'image_to_video',
                                                                 'ability_types': ['text_to_video',
                                                                                   'image_to_video',
                                                                                   'fast_generation'],
                                                                 'adapter_ability_types': ['first_frame_i2v',
                                                                                           'native_audio'],
                                                                 'input_modalities': ['text', 'image'],
                                                                 'adapter_input_modalities': ['text', 'image'],
                                                                 'duration': {'min': 2,
                                                                              'max': 12,
                                                                              'integer': True,
                                                                              'verified': True},
                                                                 'resolutions': ['720p', '1080p'],
                                                                 'ratios': ['16:9',
                                                                            '4:3',
                                                                            '1:1',
                                                                            '3:4',
                                                                            '9:16',
                                                                            '21:9',
                                                                            'adaptive'],
                                                                 'api_contract_verified': True}},
            'wan2.7-r2v': {'name': 'Wan 2.7 R2V',
                           'provider': 'dashscope',
                           'family': 'wan',
                           'type': ['video'],
                           'concurrency': 5,
                           'price_per_second': 0.8,
                           'capabilities': {'ability_type': 'reference_to_video',
                                            'ability_types': ['reference_to_video',
                                                              'digital_human',
                                                              'multi_character',
                                                              'native_audio',
                                                              'voice_reference',
                                                              'multi_shot'],
                                            'adapter_ability_types': ['reference_to_video',
                                                                      'digital_human',
                                                                      'voice_reference'],
                                            'input_modalities': ['text', 'image', 'audio', 'video'],
                                            'adapter_input_modalities': ['text', 'image', 'audio'],
                                            'duration': {'min': 2, 'max': 10, 'integer': True, 'verified': True},
                                            'resolutions': ['720P', '1080P'],
                                            'ratios': ['16:9', '9:16', '1:1', '4:3', '3:4'],
                                            'api_contract_verified': True}},
            'wan2.7-videoedit': {'name': 'Wan 2.7 Video Edit',
                                 'provider': 'dashscope',
                                 'family': 'wan',
                                 'type': ['video'],
                                 'concurrency': 5,
                                 'price_per_second': 0.8,
                                 'capabilities': {'ability_type': 'video_editing',
                                                  'ability_types': ['video_editing',
                                                                    'action_transfer',
                                                                    'instruction_editing',
                                                                    'video_transfer'],
                                                  'adapter_ability_types': ['action_transfer', 'video_editing'],
                                                  'input_modalities': ['text', 'image', 'video'],
                                                  'adapter_input_modalities': ['text', 'image', 'video'],
                                                  'duration': {'min': 2, 'max': 10, 'integer': True, 'verified': True},
                                                  'resolutions': ['720P', '1080P'],
                                                  'ratios': ['16:9', '9:16', '1:1', '4:3', '3:4'],
                                                  'api_contract_verified': True}},
            'happyhorse-1.0-r2v': {'name': 'Happy Horse 1.0 R2V',
                                   'provider': 'dashscope',
                                   'family': 'happyhorse',
                                   'type': ['video'],
                                   'concurrency': 5,
                                   'price_per_second': 1.0,
                                   'capabilities': {'ability_type': 'reference_to_video',
                                                    'ability_types': ['reference_to_video',
                                                                      'digital_human',
                                                                      'multi_character',
                                                                      'native_audio',
                                                                      'multi_shot'],
                                                    'adapter_ability_types': ['reference_to_video', 'digital_human'],
                                                    'input_modalities': ['text', 'image'],
                                                    'adapter_input_modalities': ['text', 'image'],
                                                    'duration': {'min': 3,
                                                                 'max': 15,
                                                                 'integer': True,
                                                                 'verified': True},
                                                    'resolutions': ['720P', '1080P'],
                                                    'ratios': ['16:9', '9:16', '3:4', '4:3', '1:1'],
                                                    'api_contract_verified': True}},
            'happyhorse-1.1-r2v': {'name': 'Happy Horse 1.1 R2V',
                                   'provider': 'dashscope',
                                   'family': 'happyhorse',
                                   'type': ['video'],
                                   'concurrency': 5,
                                   'price_per_second': 1.0,
                                   'capabilities': {'ability_type': 'reference_to_video',
                                                    'ability_types': ['reference_to_video',
                                                                      'digital_human',
                                                                      'multi_character',
                                                                      'native_audio',
                                                                      'multi_shot'],
                                                    'adapter_ability_types': ['reference_to_video', 'digital_human'],
                                                    'input_modalities': ['text', 'image'],
                                                    'adapter_input_modalities': ['text', 'image'],
                                                    'duration': {'min': 3,
                                                                 'max': 15,
                                                                 'integer': True,
                                                                 'verified': True},
                                                    'resolutions': ['720P', '1080P'],
                                                    'ratios': ['16:9', '9:16', '3:4', '4:3', '1:1'],
                                                    'api_contract_verified': True}},
            'happyhorse-1.0-video-edit': {'name': 'Happy Horse 1.0 Video Edit',
                                          'provider': 'dashscope',
                                          'family': 'happyhorse',
                                          'type': ['video'],
                                          'concurrency': 5,
                                          'price_per_second': 1.0,
                                          'capabilities': {'ability_type': 'video_editing',
                                                           'ability_types': ['video_editing',
                                                                             'action_transfer',
                                                                             'instruction_editing',
                                                                             'native_audio'],
                                                           'adapter_ability_types': ['action_transfer',
                                                                                     'video_editing'],
                                                           'input_modalities': ['text', 'image', 'video'],
                                                           'adapter_input_modalities': ['text', 'image', 'video'],
                                                           'duration': {'min': 3,
                                                                        'max': 15,
                                                                        'integer': True,
                                                                        'verified': True},
                                                           'resolutions': ['720P', '1080P'],
                                                           'api_contract_verified': True}},
            'seedance-1-0-pro': {'name': 'Seedance 1.0 Pro',
                                 'provider': 'ark',
                                 'family': 'seedance',
                                 'type': ['video'],
                                 'concurrency': 10,
                                 'price_per_second': 0.5,
                                 'capabilities': {'ability_type': 'image_to_video',
                                                  'ability_types': [],
                                                  'adapter_ability_types': ['first_frame_i2v'],
                                                  'api_contract_verified': False}},
            'seedance-1-0-lite': {'name': 'Seedance 1.0 Lite',
                                  'provider': 'ark',
                                  'family': 'seedance',
                                  'type': ['video'],
                                  'concurrency': 10,
                                  'price_per_second': 0.3,
                                  'capabilities': {'ability_type': 'image_to_video',
                                                   'ability_types': [],
                                                   'adapter_ability_types': ['first_frame_i2v'],
                                                   'api_contract_verified': False}}}}


def load_model_config() -> dict[str, Any]:
    return _merged_model_config()


# ==================== 平台 llm-proxy 模型动态注册 ====================
# 可选模型 = 管理后台 models 表（isActive）通过 llm-proxy /v1/models 下发；
# 后台没有上架的模型不会出现在桌面端「修改配置」里。

_PLATFORM_CACHE: dict[str, Any] = {"ts": 0.0, "models": None}
_PLATFORM_TTL = 60.0

_PLATFORM_TYPE_MAP: dict[str, list[str]] = {
    "chat": ["llm", "vlm"],
    "reasoning": ["llm"],
    "vision": ["llm", "vlm"],
    "image": ["t2i", "i2i"],
    "image_edit": ["t2i", "i2i"],
    "image_generation": ["t2i", "i2i"],
    "video": ["video"],
    "t2v": ["video"],
    "i2v": ["video"],
    "r2v": ["video"],
}


def _platform_capabilities(types: list[str]) -> dict[str, Any]:
    """为平台模型生成能力标签（按 video-claw 能力体系映射）。"""
    base = {"api_contract_verified": True}
    if "video" in types:
        return {
            **base,
            "ability_type": "image_to_video",
            "ability_types": ["image_to_video"],
            "adapter_ability_types": ["first_frame_i2v", "start_end_frame_i2v", "reference_to_video"],
            "input_modalities": ["text", "image"],
            "adapter_input_modalities": ["text", "image"],
            "duration": {"min": 3, "max": 15, "integer": True, "verified": True},
        }
    if "t2i" in types or "i2i" in types or "image" in types:
        return {
            **base,
            "ability_type": "image_generation",
            "ability_types": ["text_to_image", "image_to_image"],
            "adapter_ability_types": ["text_to_image", "image_to_image"],
            "input_modalities": ["text", "image"],
            "adapter_input_modalities": ["text", "image"],
        }
    if "vlm" in types:
        return {
            **base,
            "ability_type": "vision_language",
            "ability_types": ["vision_language", "image_understanding"],
            "adapter_ability_types": ["vision_language", "image_understanding"],
            "input_modalities": ["text", "image"],
            "adapter_input_modalities": ["text", "image"],
        }
    return {
        **base,
        "ability_type": "text_generation",
        "ability_types": ["text_generation"],
        "adapter_ability_types": ["text_generation"],
        "input_modalities": ["text"],
        "adapter_input_modalities": ["text"],
    }


def fetch_platform_models() -> Optional[list[dict[str, Any]]]:
    """从平台 llm-proxy /v1/models 拉取后台启用的模型列表（失败返回 None）。"""
    from config import Config  # 延迟导入避免循环

    now = time.time()
    if now - _PLATFORM_CACHE["ts"] < _PLATFORM_TTL:
        return _PLATFORM_CACHE["models"]
    _PLATFORM_CACHE["ts"] = now
    if not Config.LLMPROXY_BASE_URL or not Config.LLMPROXY_API_KEY:
        _PLATFORM_CACHE["models"] = None
        return None
    try:
        import requests
        resp = requests.get(
            Config.LLMPROXY_BASE_URL.rstrip("/") + "/models",
            headers={"Authorization": "Bearer " + Config.LLMPROXY_API_KEY},
            timeout=8,
        )
        if resp.status_code != 200:
            _PLATFORM_CACHE["models"] = None
            return None
        data = resp.json() or {}
        models = data.get("data") or data.get("models") or []
        _PLATFORM_CACHE["models"] = [m for m in models if isinstance(m, dict) and m.get("id")]
        return _PLATFORM_CACHE["models"]
    except Exception:
        _PLATFORM_CACHE["models"] = None
        return None


def _provider_visible(provider: str) -> bool:
    """provider 是否对用户可见：llmproxy 恒可见；第三方仅当显式开启且已配置 Key。"""
    from config import Config
    if provider == "llmproxy":
        return bool(Config.LLMPROXY_BASE_URL)
    if not getattr(Config, "SHOW_THIRD_PARTY_MODELS", False):
        return False
    key_map = {
        "openai": Config.OPENAI_API_KEY,
        "deepseek": Config.DEEPSEEK_API_KEY,
        "gemini": Config.GEMINI_API_KEY,
        "dashscope": Config.DASHSCOPE_API_KEY,
        "ark": Config.ARK_API_KEY,
        "kling": Config.KLING_API_KEY,
    }
    return bool(key_map.get(provider))


def _merged_model_config() -> dict[str, Any]:
    """合并配置：平台 llm-proxy 启用模型（优先）+ 可见的静态模型（降级）。"""
    models = dict(MODEL_CONFIG.get("models", {}))
    platform = fetch_platform_models()
    if platform is not None:
        # 平台拉取成功：以平台为准，后台没有的 llmproxy 静态条目不再显示
        models = {mid: meta for mid, meta in models.items() if meta.get("provider") != "llmproxy"}
        for item in platform:
            mid = str(item.get("id") or "")
            if not mid or mid == "deep-shentong":
                continue
            mtype = str(item.get("type") or "chat").lower()
            types = _PLATFORM_TYPE_MAP.get(mtype)
            if not types:
                continue
            models[mid] = {
                "name": item.get("name") or mid,
                "provider": "llmproxy",
                "family": "platform",
                "type": types,
                "concurrency": 3,
                "price_per_image": 0,
                "api_contract_verified": True,
                "capabilities": _platform_capabilities(types),
            }
    # 失败降级：保留静态表（含 llmproxy 默认条目），保证功能可用
    return {"models": {mid: meta for mid, meta in models.items() if _provider_visible(meta.get("provider", ""))}}


def get_model_config(model: str) -> dict[str, Any]:
    """Get metadata for one model, with a loose fallback for provider aliases."""
    models = _merged_model_config().get("models", {})
    if model in models:
        return models[model]

    model_lower = model.lower()
    for key, value in models.items():
        if key in model_lower or model_lower in key:
            return value

    return {
        "name": model,
        "provider": "unknown",
        "type": [],
        "concurrency": 3,
    }


def get_max_concurrency(model: str, enable_concurrency: bool = False) -> int:
    if not enable_concurrency:
        return 1
    return int(get_model_config(model).get("concurrency", 3))


def get_models_by_type(model_type: str) -> list[dict[str, Any]]:
    result = []
    for model_id, metadata in _merged_model_config().get("models", {}).items():
        if model_type in (metadata.get("type") or []):
            result.append({"id": model_id, **metadata})
    return result


def model_type_capabilities(model_type: str, metadata: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """Return normalized capability metadata for non-media model selectors."""
    metadata = metadata or {}
    if metadata.get("capabilities"):
        return deepcopy(metadata["capabilities"])
    if model_type == "llm":
        return {
            "ability_type": "text_generation",
            "ability_types": ["text_generation"],
            "adapter_ability_types": ["text_generation"],
            "input_modalities": ["text"],
            "adapter_input_modalities": ["text"],
            "api_contract_verified": bool(metadata.get("api_contract_verified", False)),
        }
    if model_type == "vlm":
        return {
            "ability_type": "vision_language",
            "ability_types": ["vision_language", "image_understanding"],
            "adapter_ability_types": ["vision_language", "image_understanding"],
            "input_modalities": ["text", "image"],
            "adapter_input_modalities": ["text", "image"],
            "api_contract_verified": bool(metadata.get("api_contract_verified", False)),
        }
    return media_capabilities(metadata.get("provider", ""), metadata.get("id", ""), "video" if model_type == "video" else "image")


def model_records(media_type: Optional[str] = None) -> list[dict[str, Any]]:
    records = []
    for model_id, metadata in _merged_model_config().get("models", {}).items():
        resolved_media_type = _resolve_media_type(metadata.get("type") or [])
        if media_type and resolved_media_type != media_type:
            continue
        if resolved_media_type not in {"image", "video"}:
            continue
        records.append(_workflow_info(model_id, metadata, resolved_media_type))
    return records


def list_api_models(
    media_type: Optional[str] = None,
    required_adapter_abilities: Optional[list[str]] = None,
    verified_only: bool = False,
) -> list[dict[str, Any]]:
    records = model_records(media_type=media_type)
    required = set(required_adapter_abilities or [])
    if verified_only:
        records = [record for record in records if record.get("api_contract_verified", True)]
    if required:
        records = [record for record in records if required.intersection(model_ability_tags(record))]
    return records


def parse_api_model(model: str, media_type: str) -> tuple[str, str]:
    if model and model.startswith("api/"):
        _, provider, model_id = model.split("/", 2)
        return provider, model_id

    metadata = _merged_model_config().get("models", {}).get(model)
    if metadata and _resolve_media_type(metadata.get("type") or []) == media_type:
        return metadata.get("provider", ""), model
    return "", model


def media_capabilities(provider: str, model: str, media_type: str) -> dict[str, Any]:
    metadata = _merged_model_config().get("models", {}).get(model, {})
    capabilities = metadata.get("capabilities")
    if capabilities:
        return deepcopy(capabilities)
    if media_type == "image":
        return {
            "ability_type": "image_generation",
            "ability_types": ["text_to_image"],
            "adapter_ability_types": ["text_to_image"],
            "input_modalities": ["text"],
            "adapter_input_modalities": ["text"],
            "api_contract_verified": False,
        }
    return {
        "ability_type": "image_to_video",
        "ability_types": [],
        "adapter_ability_types": ["first_frame_i2v"],
        "input_modalities": ["text", "image"],
        "adapter_input_modalities": ["text", "image"],
        "api_contract_verified": False,
        "duration": {"min": 3, "max": 15, "integer": True, "verified": False},
    }


def video_capabilities(provider: str, model: str) -> dict[str, Any]:
    return media_capabilities(provider, model, "video")


def image_capabilities(provider: str, model: str) -> dict[str, Any]:
    return media_capabilities(provider, model, "image")


def model_ability_tags(record: dict[str, Any]) -> set[str]:
    tags = set(record.get("adapter_ability_types") or [])
    tags.update(record.get("ability_types") or [])
    if record.get("ability_type"):
        tags.add(record["ability_type"])
    tags.update(record.get("type") or [])
    return tags


def _workflow_info(model_id: str, metadata: dict[str, Any], media_type: str) -> dict[str, Any]:
    provider = metadata.get("provider", "")
    capabilities = media_capabilities(provider, model_id, media_type)
    return {
        "key": f"api/{provider}/{model_id}",
        "name": model_id,
        "display_name": f"{metadata.get('name') or model_id} - API {provider.title()}",
        "source": "api",
        "provider": provider,
        "family": metadata.get("family"),
        "model": model_id,
        "media_type": media_type,
        "type": metadata.get("type", []),
        "capabilities": capabilities,
        "ability_type": capabilities.get("ability_type"),
        "ability_types": capabilities.get("ability_types", []),
        "adapter_ability_types": capabilities.get("adapter_ability_types", []),
        "input_modalities": capabilities.get("input_modalities", []),
        "adapter_input_modalities": capabilities.get("adapter_input_modalities", []),
        "api_contract_verified": capabilities.get("api_contract_verified", False),
        "concurrency": metadata.get("concurrency"),
    }


def _resolve_media_type(types: list[str]) -> str:
    if "video" in types:
        return "video"
    if any(item in types for item in ("t2i", "i2i", "image")):
        return "image"
    return ""
