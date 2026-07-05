"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateFileName = exports.getFileName = exports.getFileExtension = void 0;
const path_1 = require("path");
const getFileExtension = (filename) => {
    return (0, path_1.extname)(filename).toLowerCase();
};
exports.getFileExtension = getFileExtension;
const getFileName = (filepath) => {
    return (0, path_1.basename)(filepath);
};
exports.getFileName = getFileName;
const generateFileName = (originalName) => {
    const ext = (0, exports.getFileExtension)(originalName);
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 10);
    return `${timestamp}-${random}${ext}`;
};
exports.generateFileName = generateFileName;
//# sourceMappingURL=file.util.js.map