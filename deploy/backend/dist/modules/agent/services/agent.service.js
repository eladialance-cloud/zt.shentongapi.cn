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
var AgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const agent_entity_1 = require("../entities/agent.entity");
const redis_service_1 = require("../../../common/services/redis.service");
let AgentService = class AgentService {
    static { AgentService_1 = this; }
    agentRepo;
    redis;
    static CACHE_KEY = 'cache:agent:list';
    static CACHE_TTL = 300;
    constructor(agentRepo, redis) {
        this.agentRepo = agentRepo;
        this.redis = redis;
    }
    async findAll() {
        const cached = await this.redis.get(AgentService_1.CACHE_KEY);
        if (cached) {
            try {
                return JSON.parse(cached);
            }
            catch {
            }
        }
        const result = await this.agentRepo.find({
            where: { status: 'published', officialVisible: true },
            order: { publishedAt: 'DESC' },
        });
        await this.redis.set(AgentService_1.CACHE_KEY, JSON.stringify(result), AgentService_1.CACHE_TTL);
        return result;
    }
    async create(data) {
        const agent = this.agentRepo.create(data);
        const saved = await this.agentRepo.save(agent);
        await this.redis.del(AgentService_1.CACHE_KEY);
        return saved;
    }
    async update(id, data) {
        await this.agentRepo.update(id, data);
        await this.redis.del(AgentService_1.CACHE_KEY);
    }
    async remove(id) {
        await this.agentRepo.delete(id);
        await this.redis.del(AgentService_1.CACHE_KEY);
    }
    health() {
        return { status: 'ok', module: 'agent' };
    }
};
exports.AgentService = AgentService;
exports.AgentService = AgentService = AgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(agent_entity_1.AgentEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        redis_service_1.RedisService])
], AgentService);
//# sourceMappingURL=agent.service.js.map