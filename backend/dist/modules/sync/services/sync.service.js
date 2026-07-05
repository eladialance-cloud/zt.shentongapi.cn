"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SyncService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const sync_record_entity_1 = require("../entities/sync-record.entity");
const MAX_BATCH_SIZE = 100;
let SyncService = SyncService_1 = class SyncService {
    syncRepo;
    dataSource;
    logger = new common_1.Logger(SyncService_1.name);
    constructor(syncRepo, dataSource) {
        this.syncRepo = syncRepo;
        this.dataSource = dataSource;
    }
    async batchUpload(userId, items) {
        if (items.length > MAX_BATCH_SIZE) {
            items = items.slice(0, MAX_BATCH_SIZE);
        }
        if (items.length === 0) {
            return { accepted: 0, skipped: 0 };
        }
        const clientTxnIds = items.map((i) => i.clientTxnId);
        const existing = await this.syncRepo
            .createQueryBuilder('s')
            .select(['s.clientTxnId'])
            .where('s.user_id = :userId', { userId })
            .andWhere('s.client_txn_id IN (:...ids)', { ids: clientTxnIds })
            .getMany();
        const existingSet = new Set(existing.map((e) => e.clientTxnId));
        const toInsert = items.filter((i) => !existingSet.has(i.clientTxnId));
        if (toInsert.length === 0) {
            return { accepted: 0, skipped: items.length };
        }
        const entities = toInsert.map((i) => this.syncRepo.create({
            userId,
            clientTxnId: i.clientTxnId,
            type: i.type,
            payload: i.payload,
            status: 'pending',
        }));
        await this.syncRepo.save(entities);
        return { accepted: toInsert.length, skipped: items.length - toInsert.length };
    }
    async pull(userId, since, types) {
        const want = (key) => !types || types.length === 0 || types.includes(key);
        const sinceStr = since.toISOString();
        const result = {
            agents: [],
            workflows: [],
            plugins: [],
            models: [],
            credits: null,
            announcements: [],
            userLevel: null,
            serverTime: new Date().toISOString(),
        };
        if (want('agent')) {
            try {
                result.agents = await this.dataSource.query(`SELECT * FROM agents WHERE updated_at > ? ORDER BY updated_at ASC`, [sinceStr]);
            }
            catch (e) {
                this.logger.debug?.(`agents 拉取跳过: ${e.message}`);
            }
        }
        if (want('workflow')) {
            try {
                result.workflows = await this.dataSource.query(`SELECT * FROM workflows WHERE updated_at > ? ORDER BY updated_at ASC`, [sinceStr]);
            }
            catch (e) {
                this.logger.debug?.(`workflows 拉取跳过: ${e.message}`);
            }
        }
        if (want('plugin')) {
            try {
                result.plugins = await this.dataSource.query(`SELECT * FROM plugins WHERE updated_at > ? ORDER BY updated_at ASC`, [sinceStr]);
            }
            catch (e) {
                this.logger.debug?.(`plugins 拉取跳过: ${e.message}`);
            }
        }
        if (want('model')) {
            try {
                result.models = await this.dataSource.query(`SELECT * FROM models WHERE updated_at > ? ORDER BY updated_at ASC`, [sinceStr]);
            }
            catch (e) {
                this.logger.debug?.(`models 拉取跳过: ${e.message}`);
            }
        }
        if (want('credits')) {
            try {
                const rows = await this.dataSource.query(`SELECT user_id, balance, frozen_balance, total_recharged, total_consumed, updated_at
           FROM credit_accounts WHERE user_id = ?`, [userId]);
                result.credits = rows[0] || null;
            }
            catch (e) {
                this.logger.debug?.(`credits 拉取跳过: ${e.message}`);
            }
        }
        if (want('user-level')) {
            try {
                const rows = await this.dataSource.query(`SELECT id, level, updated_at FROM users WHERE id = ?`, [userId]);
                result.userLevel = rows[0] || null;
            }
            catch (e) {
                this.logger.debug?.(`user-level 拉取跳过: ${e.message}`);
            }
        }
        return result;
    }
    async getSyncStatus(userId) {
        const pendingCount = await this.syncRepo.count({
            where: { userId, status: 'pending' },
        });
        const last = await this.syncRepo.findOne({
            where: { userId },
            order: { createdAt: 'DESC' },
        });
        return {
            pendingCount,
            lastSyncAt: last?.createdAt || null,
        };
    }
    health() {
        return { status: 'ok', module: 'sync' };
    }
};
exports.SyncService = SyncService;
exports.SyncService = SyncService = SyncService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(sync_record_entity_1.SyncRecordEntity)),
    __param(1, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.DataSource])
], SyncService);
//# sourceMappingURL=sync.service.js.map