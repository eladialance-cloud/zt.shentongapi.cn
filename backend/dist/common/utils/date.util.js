"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addSeconds = exports.timestamp = exports.formatDate = void 0;
const dayjs_1 = __importDefault(require("dayjs"));
const formatDate = (date, format = 'YYYY-MM-DD HH:mm:ss') => {
    return (0, dayjs_1.default)(date).format(format);
};
exports.formatDate = formatDate;
const timestamp = () => Date.now();
exports.timestamp = timestamp;
const addSeconds = (date, seconds) => {
    return (0, dayjs_1.default)(date).add(seconds, 'second').toDate();
};
exports.addSeconds = addSeconds;
//# sourceMappingURL=date.util.js.map