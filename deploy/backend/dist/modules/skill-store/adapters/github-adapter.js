"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var GitHubAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubAdapter = void 0;
const common_1 = require("@nestjs/common");
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const business_exception_1 = require("../../../common/exceptions/business.exception");
const error_constant_1 = require("../../../common/constants/error.constant");
const manifest_generator_1 = require("./manifest-generator");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const CLONE_TIMEOUT_MS = 120_000;
const INSTALL_TIMEOUT_MS = 60_000;
const MAX_SCAN_DEPTH = 2;
const MAX_BUFFER = 10 * 1024 * 1024;
let GitHubAdapter = GitHubAdapter_1 = class GitHubAdapter {
    manifestGenerator;
    logger = new common_1.Logger(GitHubAdapter_1.name);
    constructor(manifestGenerator) {
        this.manifestGenerator = manifestGenerator;
    }
    async fetch(url) {
        if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(url)) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '无效的 GitHub 仓库地址');
        }
        const repoName = (url.split('/').pop() || 'skill').replace(/\.git$/, '');
        const targetDir = path.resolve(process.cwd(), 'uploads', 'skills', `${repoName}-${Date.now()}`);
        await fs.mkdir(path.dirname(targetDir), { recursive: true });
        const cloneUrl = await this.resolveCloneUrl(url);
        this.logger.log(`克隆仓库: ${cloneUrl} -> ${targetDir}`);
        await execFileAsync('git', ['clone', cloneUrl, targetDir, '--depth', '1'], {
            timeout: CLONE_TIMEOUT_MS,
            maxBuffer: MAX_BUFFER,
        });
        return targetDir;
    }
    async analyze(localPath) {
        const files = [];
        try {
            await this.collectFiles(localPath, files, 0, MAX_SCAN_DEPTH);
        }
        catch (e) {
            this.logger.warn(`目录列举失败: ${e.message}`);
        }
        const detectedLanguages = new Set();
        let hasSkillMd = false;
        let hasRequirementsTxt = false;
        let hasPackageJson = false;
        let hasDockerfile = false;
        let hasMainPy = false;
        let hasIndexJs = false;
        let hasRunPy = false;
        let hasWorkflowDefinition = false;
        let readmeContent;
        for (const file of files) {
            const base = path.basename(file).toLowerCase();
            const ext = path.extname(base).toLowerCase();
            const lang = this.extensionToLanguage(ext);
            if (lang)
                detectedLanguages.add(lang);
            switch (base) {
                case 'skill.md':
                    hasSkillMd = true;
                    break;
                case 'requirements.txt':
                    hasRequirementsTxt = true;
                    break;
                case 'package.json':
                    hasPackageJson = true;
                    break;
                case 'dockerfile':
                    hasDockerfile = true;
                    break;
                case 'main.py':
                    hasMainPy = true;
                    break;
                case 'run.py':
                    hasRunPy = true;
                    break;
                case 'index.js':
                    hasIndexJs = true;
                    break;
                case 'readme.md':
                    try {
                        readmeContent = await fs.readFile(file, 'utf-8');
                    }
                    catch {
                    }
                    break;
                default:
                    if (base.includes('workflow') ||
                        base.includes('n8n') ||
                        base.endsWith('.workflow.json')) {
                        hasWorkflowDefinition = true;
                    }
                    break;
            }
        }
        const hasCompleteEntryPoint = hasMainPy || hasIndexJs || hasRunPy;
        const hasMultiStepProcess = this.detectMultiStepProcess(readmeContent);
        return {
            hasSkillMd,
            hasRequirementsTxt,
            hasPackageJson,
            hasDockerfile,
            hasMainPy,
            hasIndexJs,
            hasWorkflowDefinition,
            hasMultiStepProcess,
            hasCompleteEntryPoint,
            readmeContent,
            detectedLanguages: Array.from(detectedLanguages),
        };
    }
    async generateManifest(localPath, analysis) {
        const files = [];
        try {
            await this.collectFiles(localPath, files, 0, MAX_SCAN_DEPTH);
        }
        catch (e) {
            this.logger.warn(`清单生成时目录列举失败: ${e.message}`);
        }
        const locate = (name) => files.find((f) => path.basename(f).toLowerCase() === name.toLowerCase());
        let manifest;
        const skillMdFile = analysis.hasSkillMd ? locate('skill.md') : undefined;
        if (skillMdFile) {
            const content = await fs.readFile(skillMdFile, 'utf-8');
            manifest = this.manifestGenerator.parseSkillMd(content, localPath, analysis);
            manifest.skillMdPath = skillMdFile;
        }
        else if (analysis.hasDockerfile) {
            manifest = this.buildBaseManifest(localPath, 'docker', 'Dockerfile');
        }
        else if (analysis.hasMainPy) {
            const entry = locate('main.py') || locate('run.py') || 'main.py';
            manifest = this.buildBaseManifest(localPath, 'python-cli', entry);
        }
        else if (analysis.hasPackageJson) {
            const entry = locate('index.js') || 'index.js';
            manifest = this.buildBaseManifest(localPath, 'node-cli', entry);
        }
        else {
            manifest = this.buildBaseManifest(localPath, 'markdown-only', undefined);
            manifest.skillMdPath = path.join(localPath, 'README.md');
        }
        const defaults = this.manifestGenerator.autoGenerateDefaults(localPath, analysis);
        if (!manifest.name)
            manifest.name = defaults.name;
        if (!manifest.category)
            manifest.category = defaults.category;
        if (!manifest.triggerKeywords || manifest.triggerKeywords.length === 0) {
            manifest.triggerKeywords = defaults.triggerKeywords;
        }
        if (!manifest.uiConfig)
            manifest.uiConfig = defaults.uiConfig;
        if (!manifest.examples || manifest.examples.length === 0) {
            manifest.examples = defaults.examples;
        }
        if (!manifest.inputSchema)
            manifest.inputSchema = defaults.inputSchema;
        if (!manifest.outputSchema)
            manifest.outputSchema = defaults.outputSchema;
        if (!manifest.description) {
            manifest.description = analysis.readmeContent
                ? analysis.readmeContent.slice(0, 512)
                : manifest.name;
        }
        const depInfo = {};
        if (analysis.hasRequirementsTxt)
            depInfo.requirementsTxt = true;
        if (analysis.hasPackageJson)
            depInfo.packageJson = true;
        if (Object.keys(depInfo).length > 0 &&
            (!manifest.dependencies || Object.keys(manifest.dependencies).length === 0)) {
            manifest.dependencies = depInfo;
        }
        return manifest;
    }
    async installDependencies(localPath, deps) {
        void deps;
        if (await this.pathExists(path.join(localPath, 'requirements.txt'))) {
            try {
                this.logger.log(`安装 Python 依赖: ${localPath}`);
                await execFileAsync('pip', ['install', '-r', 'requirements.txt'], {
                    cwd: localPath,
                    timeout: INSTALL_TIMEOUT_MS,
                    maxBuffer: MAX_BUFFER,
                });
            }
            catch (e) {
                this.logger.warn(`Python 依赖安装失败（已忽略）: ${e.message}`);
            }
        }
        if (await this.pathExists(path.join(localPath, 'package.json'))) {
            try {
                this.logger.log(`安装 Node 依赖: ${localPath}`);
                await execFileAsync('npm', ['install'], {
                    cwd: localPath,
                    timeout: INSTALL_TIMEOUT_MS,
                    maxBuffer: MAX_BUFFER,
                });
            }
            catch (e) {
                this.logger.warn(`Node 依赖安装失败（已忽略）: ${e.message}`);
            }
        }
    }
    async collectFiles(dir, out, currentDepth, maxDepth) {
        if (currentDepth > maxDepth)
            return;
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name.startsWith('.') || entry.name === 'node_modules') {
                    continue;
                }
                await this.collectFiles(fullPath, out, currentDepth + 1, maxDepth);
            }
            else if (entry.isFile()) {
                out.push(fullPath);
            }
        }
    }
    extensionToLanguage(ext) {
        switch (ext) {
            case '.py':
                return 'python';
            case '.js':
            case '.mjs':
            case '.cjs':
            case '.jsx':
                return 'javascript';
            case '.ts':
            case '.tsx':
                return 'typescript';
            case '.go':
                return 'go';
            case '.rs':
                return 'rust';
            case '.java':
                return 'java';
            case '.rb':
                return 'ruby';
            case '.php':
                return 'php';
            case '.cs':
                return 'csharp';
            case '.cpp':
            case '.cc':
            case '.cxx':
                return 'cpp';
            case '.c':
                return 'c';
            case '.sh':
            case '.bash':
                return 'shell';
            default:
                return undefined;
        }
    }
    detectMultiStepProcess(readme) {
        if (!readme)
            return false;
        return /step\s*\d|步骤\s*\d|第\s*\d\s*步/i.test(readme);
    }
    buildBaseManifest(localPath, runtimeType, entryPoint) {
        return {
            name: '',
            displayName: '',
            description: '',
            skillType: 'skill',
            runtimeType,
            sourceUrl: '',
            installPath: localPath,
            entryPoint,
        };
    }
    async resolveCloneUrl(url) {
        try {
            await execFileAsync('git', ['ls-remote', url, 'HEAD'], {
                timeout: 5_000,
                maxBuffer: MAX_BUFFER,
            });
            return url;
        }
        catch {
            this.logger.warn('直连 GitHub 失败，尝试使用镜像加速...');
        }
        const mirrored = `https://gh-proxy.com/${url}`;
        this.logger.log(`使用镜像: ${mirrored}`);
        return mirrored;
    }
    async pathExists(p) {
        try {
            await fs.access(p);
            return true;
        }
        catch {
            return false;
        }
    }
};
exports.GitHubAdapter = GitHubAdapter;
exports.GitHubAdapter = GitHubAdapter = GitHubAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [manifest_generator_1.ManifestGenerator])
], GitHubAdapter);
//# sourceMappingURL=github-adapter.js.map