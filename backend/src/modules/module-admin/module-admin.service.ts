import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ModuleAdminService {
  private readonly logger = new Logger(ModuleAdminService.name);

  /**
   * 卸载/停用模块的云端数据处置。
   *
   * 注意：当前桌面端模块（如 video-claw）没有云端专属数据（mod_{id}_* 表 / modules/{id}/ 前缀）。
   * 因此这些接口先做“安全空操作”：返回契约结果、记录日志，但不动任何表或文件。
   * 等模块真正上云后，在这里实现：根据 moduleId 前缀删除/导出对应表与存储目录，并写 admin-audit。
   */
  retain(moduleId: string, adminUser?: unknown) {
    this.logger.log(`module-admin retain(keep): moduleId=${moduleId} admin=${JSON.stringify(adminUser ?? {})}`);
    return { ok: true, id: moduleId, disposition: 'keep' as const };
  }

  exportData(moduleId: string, adminUser?: unknown) {
    this.logger.log(`module-admin export: moduleId=${moduleId} admin=${JSON.stringify(adminUser ?? {})}`);
    // 安全空操作：模块无云端数据；返回空下载地址，由桌面端本地导出为准
    return { ok: true, id: moduleId, disposition: 'export' as const, downloadUrl: '' };
  }

  deleteData(moduleId: string, adminUser?: unknown) {
    this.logger.log(`module-admin delete: moduleId=${moduleId} admin=${JSON.stringify(adminUser ?? {})}`);
    // 安全空操作：模块无云端数据，不删表/文件；后续有 mod_ 前缀数据时再删除并写审计
    return { ok: true, id: moduleId, disposition: 'delete' as const };
  }

  describe(moduleId: string) {
    this.logger.log(`module-admin describe: moduleId=${moduleId}`);
    return { ok: true, id: moduleId, tables: [], files: [] };
  }
}