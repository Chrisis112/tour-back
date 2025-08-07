"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = authenticateToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
// Секретный ключ для подписи JWT (лучше хранить в .env)
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
function authenticateToken(req, res, next) {
    // Ожидаем заголовок вида: Authorization: Bearer <token>
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Token required' });
    }
    try {
        // Проверяем и декодируем токен
        const user = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = user; // Сохраняем данные пользователя в объекте запроса
        next();
    }
    catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
}
