"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLONE_TIMEOUT_MS = exports.BATCH_SIZE = exports.DEFAULT_RUNTIME_TYPE = exports.DEFAULT_PRICE_PER_CALL = exports.DEFAULT_CREATOR_ID = exports.DEFAULT_MODEL_ID = exports.EXCLUDE_PATTERNS = exports.SOURCE_DIRS_TO_SCAN = exports.SOURCE_DIR_TO_CATEGORY = void 0;
exports.SOURCE_DIR_TO_CATEGORY = {
    engineering: 'programming',
    testing: 'programming',
    security: 'programming',
    'game-development': 'programming',
    marketing: 'copywriting',
    sales: 'copywriting',
    'paid-media': 'copywriting',
    finance: 'data_analysis',
    'supply-chain': 'data_analysis',
    strategy: 'data_analysis',
    design: 'office',
    product: 'office',
    'project-management': 'office',
    hr: 'office',
    academic: 'other',
    gis: 'other',
    'spatial-computing': 'other',
    specialized: 'other',
    support: 'other',
    legal: 'other',
    integrations: 'other',
};
exports.SOURCE_DIRS_TO_SCAN = Object.keys(exports.SOURCE_DIR_TO_CATEGORY);
exports.EXCLUDE_PATTERNS = [
    '**/examples/**',
    '**/assets/**',
    '**/README.md',
    '**/readme.md',
    '**/LICENSE',
    '**/.git/**',
];
exports.DEFAULT_MODEL_ID = 'gpt-4o-mini';
exports.DEFAULT_CREATOR_ID = 1;
exports.DEFAULT_PRICE_PER_CALL = 0;
exports.DEFAULT_RUNTIME_TYPE = 'openclaw';
exports.BATCH_SIZE = 50;
exports.CLONE_TIMEOUT_MS = 120_000;
//# sourceMappingURL=agent-import.constants.js.map