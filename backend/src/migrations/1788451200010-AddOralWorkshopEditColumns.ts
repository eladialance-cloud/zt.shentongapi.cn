import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 口播工坊「两阶段」：先出数字人草稿（draft），再分段剪辑重渲染成片（render）。
 *
 * 为 create_oral_workshop_jobs 新增：草稿视频 / 分段方案 / 重渲染次数 / 草稿模式 / 计价列。
 * 幂等：逐列检查 information_schema 后 ADD COLUMN，避免重复迁移报错。
 */
export class AddOralWorkshopEditColumns1788451200010 implements MigrationInterface {
  name = 'AddOralWorkshopEditColumns1788451200010';

  private async addColumnIfMissing(queryRunner: QueryRunner, column: string, ddl: string): Promise<void> {
    const [row] = await queryRunner.query(
      'SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
      ['create_oral_workshop_jobs', column],
    );
    const exists = Number(row?.c || 0) > 0;
    if (!exists) {
      await queryRunner.query('ALTER TABLE create_oral_workshop_jobs ADD COLUMN ' + ddl);
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfMissing(
      queryRunner,
      'draft_video_url',
      'draft_video_url VARCHAR(512) DEFAULT NULL COMMENT \'数字人原始草稿视频(draft_mode=1 时 digitalHuman 产物)\' AFTER video_url',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'edit_segments',
      'edit_segments TEXT DEFAULT NULL COMMENT \'分段剪辑方案 JSON(裁剪/删段/排序)\' AFTER draft_video_url',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'render_count',
      'render_count INT NOT NULL DEFAULT 0 COMMENT \'重渲染成片次数\' AFTER edit_segments',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'draft_mode',
      'draft_mode TINYINT NOT NULL DEFAULT 0 COMMENT \'草稿模式(1=出草稿暂停等待渲染)\' AFTER execution_mode',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'draft_cost',
      'draft_cost INT NOT NULL DEFAULT 0 COMMENT \'草稿结算成本\' AFTER credits_cost',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'edit_cost',
      'edit_cost INT NOT NULL DEFAULT 0 COMMENT \'最近一次重渲染成本\' AFTER draft_cost',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const cols = ['edit_cost', 'draft_cost', 'draft_mode', 'render_count', 'edit_segments', 'draft_video_url'];
    for (const c of cols) {
      await queryRunner.query('ALTER TABLE create_oral_workshop_jobs DROP COLUMN ' + c).catch(() => undefined);
    }
  }
}
