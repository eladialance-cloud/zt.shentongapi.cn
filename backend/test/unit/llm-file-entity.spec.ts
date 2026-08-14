/** llm_files 实体字段契约测试
 * 运行: node -r ts-node/register --test test/unit/llm-file-entity.spec.ts
 */
import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getMetadataArgsStorage } from 'typeorm';
import { LlmFileEntity } from '../../src/modules/chat/entities/llm-file.entity';
import { bigintTransformer } from '../../src/common/entities/base.entity';

describe('LlmFileEntity', () => {
  it('字段默认行为：赋值与读回一致', () => {
    const e = new LlmFileEntity();
    e.userId = 1;
    e.modelId = 'qwen-long';
    e.upstreamFileId = 'file-fe-abc';
    e.fileName = 'a.pdf';
    e.fileSize = 1024;
    assert.equal(e.userId, 1);
    assert.equal(e.modelId, 'qwen-long');
    assert.equal(e.upstreamFileId, 'file-fe-abc');
    assert.equal(e.fileName, 'a.pdf');
    assert.equal(e.fileSize, 1024);
  });
});

describe('LlmFileEntity 列映射契约', () => {
  const storage = getMetadataArgsStorage();

  it('表名 llm_files', () => {
    const table = storage.tables.find((t) => t.target === LlmFileEntity);
    assert.equal(table?.name, 'llm_files');
  });

  it('列名/类型/长度/nullable 映射', () => {
    const col = (prop: string) =>
      storage.columns.find((c) => c.target === LlmFileEntity && c.propertyName === prop)?.options;

    const userId = col('userId');
    assert.equal(userId?.name, 'user_id');
    assert.equal(userId?.type, 'bigint');

    assert.equal(col('modelId')?.name, 'model_id');
    assert.equal(col('upstreamFileId')?.name, 'upstream_file_id');

    const fileName = col('fileName');
    assert.equal(fileName?.name, 'file_name');
    assert.equal(fileName?.length, 255);
    assert.equal(fileName?.nullable, true);

    const fileSize = col('fileSize');
    assert.equal(fileSize?.name, 'file_size');
    assert.equal(fileSize?.type, 'int');
    assert.equal(fileSize?.nullable, true);
  });

  it('索引 idx_llm_files_user_id', () => {
    const idx = storage.indices.find(
      (i) => i.target === LlmFileEntity && i.name === 'idx_llm_files_user_id',
    );
    assert.ok(idx);
  });
});

describe('bigintTransformer', () => {
  it('往返转换', () => {
    assert.equal(bigintTransformer.to(123), '123');
    assert.equal(bigintTransformer.from('123'), 123);
    assert.equal(bigintTransformer.to(null), null);
    assert.equal(bigintTransformer.from(null), null);
  });
});