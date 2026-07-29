"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminSystemModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const admin_auth_module_1 = require("../admin-auth/admin-auth.module");
const system_config_entity_1 = require("./entities/system-config.entity");
const announcement_entity_1 = require("./entities/announcement.entity");
const tenant_entity_1 = require("./entities/tenant.entity");
const admin_system_controller_1 = require("./admin-system.controller");
const admin_tenant_controller_1 = require("./admin-tenant.controller");
const admin_announcement_controller_1 = require("./admin-announcement.controller");
const admin_system_service_1 = require("./admin-system.service");
let AdminSystemModule = class AdminSystemModule {
};
exports.AdminSystemModule = AdminSystemModule;
exports.AdminSystemModule = AdminSystemModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                system_config_entity_1.SystemConfigEntity,
                announcement_entity_1.AnnouncementEntity,
                tenant_entity_1.TenantEntity,
            ]),
            admin_auth_module_1.AdminAuthModule,
        ],
        controllers: [
            admin_system_controller_1.AdminSystemController,
            admin_tenant_controller_1.AdminTenantController,
            admin_announcement_controller_1.AdminAnnouncementController,
        ],
        providers: [admin_system_service_1.AdminSystemService],
        exports: [admin_system_service_1.AdminSystemService],
    })
], AdminSystemModule);
//# sourceMappingURL=admin-system.module.js.map