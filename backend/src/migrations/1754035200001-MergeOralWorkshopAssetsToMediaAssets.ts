import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P3 冗余表合并：口播工坊三张素材表归一至 media_assets
 *
 * - voice_assets              -> media_assets（biz_type='voice_asset'，url=参考音频，meta 存 speaker_id/demo_audio/emotion_ref_audio/status）
 * - ip_archives               -> media_assets（biz_type='ip_archive'，url=对标链接，meta 存 style_analysis/topics/source_json）
 * - oral_workshop_materials   -> media_assets（biz_type='media'，素材库常规素材，meta 存 category/preview_url/status）
 *
 * 关键点：
 *   1. media_assets 新增 biz_type 列；新装库（表不存在）时直接按最终结构建表，供 legacy db-migration 幂等跳过。
 *   2. 保留原表 id 于 meta.old_id，并用它回填 oral_workshop_jobs.voice_id（旧声音 id -> 新 media_assets id）。
 *   3. 数据回填幂等（NOT EXISTS 按 old_id 防重）；旧表 RENAME 为 *_archived 归档，可回溯。
 */

export class MergeOralWorkshopAssetsToMediaAssets1754035200001 implements MigrationInterface {
  name = 'MergeOralWorkshopAssetsToMediaAssets1754035200001';

  private async tableExists(qr: QueryRunner, table: string): Promise<boolean> {
    const rows = await qr.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  private async columnExists(qr: QueryRunner, table: string, column: string): Promise<boolean> {
    const rows = await qr.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  /** 确保 media_assets 存在且含 biz_type 列（新装库直接建最终结构，存量库补列） */
  private async ensureMediaAssets(qr: QueryRunner): Promise<void> {
    if (!(await this.tableExists(qr, 'media_assets'))) {
      await qr.query(`
        CREATE TABLE IF NOT EXISTS media_assets (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id BIGINT NOT NULL,
          source_type ENUM('task','media_job','manual') NOT NULL DEFAULT 'manual',
          source_id BIGINT,
          title VARCHAR(255) NOT NULL,
          asset_type ENUM('image','video','audio','file') NOT NULL DEFAULT 'file',
          url VARCHAR(1024) NOT NULL,
          mime_type VARCHAR(128),
          file_size BIGINT,
          tags JSON,
          description TEXT,
          vector_status VARCHAR(16) NOT NULL DEFAULT 'none',
          meta JSON,
          biz_type VARCHAR(32) NOT NULL DEFAULT 'media' COMMENT '业务类型: media/voice_asset/ip_archive',
          archived TINYINT(1) NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_media_assets_user (user_id),
          KEY idx_media_assets_source (source_type, source_id),
          KEY idx_media_assets_biz (biz_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='素材资产库（种子：task_output_item / media_jobs）'
      `);
      return;
    }
    if (!(await this.columnExists(qr, 'media_assets', 'biz_type'))) {
      await qr.query(
        `ALTER TABLE media_assets ADD COLUMN biz_type VARCHAR(32) NOT NULL DEFAULT 'media' COMMENT '业务类型: media/voice_asset/ip_archive' AFTER vector_status`,
      );
      await qr.query(`ALTER TABLE media_assets ADD KEY idx_media_assets_biz (biz_type)`);
    }
  }

  /** voice_assets -> media_assets（biz_type='voice_asset'）+ 回填 oral_workshop_jobs.voice_id */
  private async mergeVoiceAssets(qr: QueryRunner): Promise<void> {
    if (!(await this.tableExists(qr, 'voice_assets'))) return;
    await qr.query(`
      INSERT INTO media_assets
        (user_id, source_type, source_id, title, asset_type, url, mime_type, file_size, tags, description, vector_status, meta, biz_type, archived, created_at, updated_at)
      SELECT v.user_id, 'manual', NULL, v.name, 'audio', v.ref_audio_url, NULL, NULL, NULL, NULL, 'none',
        JSON_OBJECT(
          'kind', 'voice_asset',
          'old_id', v.id,
          'speaker_id', v.speaker_id,
          'demo_audio', v.demo_audio,
          'emotion_ref_audio', v.emotion_ref_audio,
          'status', v.status
        ),
        'voice_asset', 0, v.created_at, v.created_at
      FROM voice_assets v
      WHERE NOT EXISTS (
        SELECT 1 FROM media_assets m
        WHERE m.biz_type = 'voice_asset'
          AND JSON_UNQUOTE(JSON_EXTRACT(m.meta, '$.old_id')) = CAST(v.id AS CHAR)
      )
    `);
    // 回填任务引用的声音 id（旧 voice_assets.id -> 新 media_assets.id）
    if (await this.tableExists(qr, 'oral_workshop_jobs')) {
      await qr.query(`
        UPDATE oral_workshop_jobs j
        INNER JOIN media_assets m
          ON m.biz_type = 'voice_asset'
          AND JSON_UNQUOTE(JSON_EXTRACT(m.meta, '$.old_id')) = CAST(j.voice_id AS CHAR)
        SET j.voice_id = m.id
        WHERE j.voice_id IS NOT NULL AND j.voice_id > 0
      `);
    }
    if (!(await this.tableExists(qr, 'voice_assets_archived'))) {
      await qr.query(`RENAME TABLE voice_assets TO voice_assets_archived`);
    }
  }

  /** ip_archives -> media_assets（biz_type='ip_archive'） */
  private async mergeIpArchives(qr: QueryRunner): Promise<void> {
    if (!(await this.tableExists(qr, 'ip_archives'))) return;
    await qr.query(`
      INSERT INTO media_assets
        (user_id, source_type, source_id, title, asset_type, url, mime_type, file_size, tags, description, vector_status, meta, biz_type, archived, created_at, updated_at)
      SELECT a.user_id, 'manual', NULL, COALESCE(a.title, a.url), 'file', a.url, NULL, NULL, NULL, NULL, 'none',
        JSON_OBJECT(
          'kind', 'ip_archive',
          'old_id', a.id,
          'style_analysis', a.style_analysis,
          'topics', a.topics,
          'source_json', a.source_json
        ),
        'ip_archive', 0, a.created_at, a.created_at
      FROM ip_archives a
      WHERE NOT EXISTS (
        SELECT 1 FROM media_assets m
        WHERE m.biz_type = 'ip_archive'
          AND JSON_UNQUOTE(JSON_EXTRACT(m.meta, '$.old_id')) = CAST(a.id AS CHAR)
      )
    `);
    if (!(await this.tableExists(qr, 'ip_archives_archived'))) {
      await qr.query(`RENAME TABLE ip_archives TO ip_archives_archived`);
    }
  }

  /** oral_workshop_materials -> media_assets（biz_type='media'，素材库常规素材） */
  private async mergeOralWorkshopMaterials(qr: QueryRunner): Promise<void> {
    if (!(await this.tableExists(qr, 'oral_workshop_materials'))) return;
    const hasDesc = await this.columnExists(qr, 'oral_workshop_materials', 'description');
    const hasVecId = await this.columnExists(qr, 'oral_workshop_materials', 'vector_id');
    const descSql = hasDesc ? 'm.description' : 'NULL';
    const jsonSql = [
      `'kind', 'oral_workshop_material'`,
      `'old_id', m.id`,
      `'category', m.category`,
      `'preview_url', m.preview_url`,
      `'status', m.status`,
    ];
    if (hasVecId) jsonSql.push(`'vector_id', m.vector_id`);
    await qr.query(`
      INSERT INTO media_assets
        (user_id, source_type, source_id, title, asset_type, url, mime_type, file_size, tags, description, vector_status, meta, biz_type, archived, created_at, updated_at)
      SELECT m.user_id, 'manual', NULL, m.name, m.type, m.url, NULL, NULL, NULL, ${descSql}, 'none',
        JSON_OBJECT(${jsonSql.join(', ')}),
        'media', 0, m.created_at, m.created_at
      FROM oral_workshop_materials m
      WHERE NOT EXISTS (
        SELECT 1 FROM media_assets x
        WHERE x.biz_type = 'media'
          AND JSON_UNQUOTE(JSON_EXTRACT(x.meta, '$.old_id')) = CAST(m.id AS CHAR)
      )
    `);
    if (!(await this.tableExists(qr, 'oral_workshop_materials_archived'))) {
      await qr.query(`RENAME TABLE oral_workshop_materials TO oral_workshop_materials_archived`);
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.ensureMediaAssets(queryRunner);
    await this.mergeVoiceAssets(queryRunner);
    await this.mergeIpArchives(queryRunner);
    await this.mergeOralWorkshopMaterials(queryRunner);
  }

  /** 回滚：仅恢复归档表名（数据已并入 media_assets，不回拷避免破坏性操作） */
  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [archived, original] of [
      ['voice_assets_archived', 'voice_assets'],
      ['ip_archives_archived', 'ip_archives'],
      ['oral_workshop_materials_archived', 'oral_workshop_materials'],
    ] as Array<[string, string]>) {
      if ((await this.tableExists(queryRunner, archived)) && !(await this.tableExists(queryRunner, original))) {
        await queryRunner.query(`RENAME TABLE ${archived} TO ${original}`);
      }
    }
  }
}