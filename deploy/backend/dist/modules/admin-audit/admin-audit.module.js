"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminAuditModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const admin_auth_module_1 = require("../admin-auth/admin-auth.module");
const sensitive_word_entity_1 = require("./entities/sensitive-word.entity");
const ai_audit_config_entity_1 = require("./entities/ai-audit-config.entity");
const audit_queue_entity_1 = require("./entities/audit-queue.entity");
const admin_audit_controller_1 = require("./admin-audit.controller");
const admin_sensitive_word_controller_1 = require("./admin-sensitive-word.controller");
const admin_audit_service_1 = require("./admin-audit.service");
let AdminAuditModule = class AdminAuditModule {
};
exports.AdminAuditModule = AdminAuditModule;
exports.AdminAuditModule = AdminAuditModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                sensitive_word_entity_1.SensitiveWordEntity,
                ai_audit_config_entity_1.AiAuditConfigEntity,
                audit_queue_entity_1.AuditQueueEntity,
            ]),
            admin_auth_module_1.AdminAuthModule,
        ],
        controllers: [admin_audit_controller_1.AdminAuditController, admin_sensitive_word_controller_1.AdminSensitiveWordController],
        providers: [admin_audit_service_1.AdminAuditService],
        exports: [admin_audit_service_1.AdminAuditService],
    })
], AdminAuditModule);
//# sourceMappingURL=admin-audit.module.js.map