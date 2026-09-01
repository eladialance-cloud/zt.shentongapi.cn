import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** 用户安装/下载 Agent 记录（新表 eco_agent_installs，DDL 见上线报告） */
@Entity('eco_agent_installs')
@Index('uniq_agent_installs_user_agent', ['userId', 'agentId'], { unique: true })
export class AgentInstallEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index('idx_agent_installs_user_id')
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Index('idx_agent_installs_agent_id')
  @Column({ name: 'agent_id', type: 'bigint' })
  agentId: number;

  @Column({ length: 32, nullable: true })
  version?: string;

  @Column({ name: 'install_dir', length: 512, nullable: true })
  installDir?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
