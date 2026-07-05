import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('files')
export class FileEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index('idx_files_user_id')
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ length: 256 })
  name: string;

  @Column({ length: 512 })
  path: string;

  @Column({ type: 'int' })
  size: number;

  @Column({ name: 'mime_type', length: 128, nullable: true })
  mimeType?: string;

  @Column({
    name: 'storage_type',
    type: 'enum',
    enum: ['minio', 'oss', 'cos'],
  })
  storageType: 'minio' | 'oss' | 'cos';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
