// middleware/auth.ts
import { Request, Response, NextFunction, RequestHandler } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload & { id: string }; // ожидаемый id в payload
}

// Проверка, что payload содержит поле id типа string
function isJwtPayloadWithId(payload: unknown): payload is JwtPayload & { id: string } {
  return typeof payload === "object" && payload !== null && "id" in payload && typeof (payload as any).id === "string";
}

export const optionalAuthenticateToken: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : null;

  if (!token) {
    // Нет токена — разрешаем продолжить без авторизации
    return next();
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('JWT_SECRET is not set');
      return next(); // Не вызываем ошибку, чтобы иметь необязательную авторизацию
    }

    const decoded = jwt.verify(token, secret);
    if (!isJwtPayloadWithId(decoded)) {
      return next(); // payload неправильный — продолжаем без авторизации
    }

    (req as AuthenticatedRequest).user = decoded;
  } catch (err) {
    // Игнорируем ошибку, токен не валиден — продолжаем как неавторизованный
  }

  next();
}

export const authenticateToken: RequestHandler = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Token not found" });
  }

  try {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      console.error("JWT_SECRET is not set");
      return res.status(500).json({ error: "Server configuration error" });
    }

    const decoded = jwt.verify(token, secret);

    if (!isJwtPayloadWithId(decoded)) {
      return res.status(401).json({ error: "Invalid token payload: missing user id" });
    }

    (req as AuthenticatedRequest).user = decoded; // безопасно присваивать
    next();
  } catch (err) {
    console.error("JWT verification failed:", err);
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}
