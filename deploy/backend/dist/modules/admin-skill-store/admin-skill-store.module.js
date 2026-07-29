"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminSkillStoreModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const admin_auth_module_1 = require("../admin-auth/admin-auth.module");
const skill_store_module_1 = require("../skill-store/skill-store.module");
const skill_source_entity_1 = require("../skill-store/entities/skill-source.entity");
const skill_package_entity_1 = require("../skill-store/entities/skill-package.entity");
const skill_install_log_entity_1 = require("../skill-store/entities/skill-install-log.entity");
const admin_skill_store_controller_1 = require("./admin-skill-store.controller");
const admin_skill_store_service_1 = require("./admin-skill-store.service");
let AdminSkillStoreModule = class AdminSkillStoreModule {
};
exports.AdminSkillStoreModule = AdminSkillStoreModule;
exports.AdminSkillStoreModule = AdminSkillStoreModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([skill_source_entity_1.SkillSourceEntity, skill_package_entity_1.SkillPackageEntity, skill_install_log_entity_1.SkillInstallLogEntity]),
            admin_auth_module_1.AdminAuthModule,
            skill_store_module_1.SkillStoreModule,
        ],
        controllers: [admin_skill_store_controller_1.AdminSkillStoreController],
        providers: [admin_skill_store_service_1.AdminSkillStoreService],
        exports: [admin_skill_store_service_1.AdminSkillStoreService],
    })
], AdminSkillStoreModule);
//# sourceMappingURL=admin-skill-store.module.js.map