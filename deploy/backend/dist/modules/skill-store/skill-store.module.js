"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillStoreModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const skill_source_entity_1 = require("./entities/skill-source.entity");
const skill_package_entity_1 = require("./entities/skill-package.entity");
const skill_install_log_entity_1 = require("./entities/skill-install-log.entity");
const chat_session_entity_1 = require("../chat/entities/chat-session.entity");
const skill_store_controller_1 = require("./controllers/skill-store.controller");
const skill_store_service_1 = require("./services/skill-store.service");
const skill_analyzer_service_1 = require("./services/skill-analyzer.service");
const skill_runner_service_1 = require("./services/skill-runner.service");
const github_adapter_1 = require("./adapters/github-adapter");
const manifest_generator_1 = require("./adapters/manifest-generator");
const credits_module_1 = require("../credits/credits.module");
let SkillStoreModule = class SkillStoreModule {
};
exports.SkillStoreModule = SkillStoreModule;
exports.SkillStoreModule = SkillStoreModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                skill_source_entity_1.SkillSourceEntity,
                skill_package_entity_1.SkillPackageEntity,
                skill_install_log_entity_1.SkillInstallLogEntity,
                chat_session_entity_1.ChatSessionEntity,
            ]),
            credits_module_1.CreditsModule,
        ],
        controllers: [skill_store_controller_1.SkillStoreController],
        providers: [
            skill_store_service_1.SkillStoreService,
            skill_analyzer_service_1.SkillAnalyzerService,
            skill_runner_service_1.SkillRunnerService,
            github_adapter_1.GitHubAdapter,
            manifest_generator_1.ManifestGenerator,
        ],
        exports: [skill_store_service_1.SkillStoreService, skill_analyzer_service_1.SkillAnalyzerService, skill_runner_service_1.SkillRunnerService],
    })
], SkillStoreModule);
//# sourceMappingURL=skill-store.module.js.map