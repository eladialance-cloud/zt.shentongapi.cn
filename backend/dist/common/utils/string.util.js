"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maskEmail = exports.generateRandomString = exports.isUsername = exports.isEmail = void 0;
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
exports.isEmail = isEmail;
const isUsername = (s) => /^[a-zA-Z0-9_]{3,32}$/.test(s);
exports.isUsername = isUsername;
const generateRandomString = (length = 32) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};
exports.generateRandomString = generateRandomString;
const maskEmail = (email) => {
    const [name, domain] = email.split('@');
    return `${name.slice(0, 2)}***@${domain}`;
};
exports.maskEmail = maskEmail;
//# sourceMappingURL=string.util.js.map