import express from 'express';
import User, { IUser } from '../models/User'; // Импорт интерфейса пользователя, если он есть
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import passport from '../../passport';

const router = express.Router();

router.use(passport.initialize());

router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password, userType, telegramChatId } = req.body;

    if (!firstName || !lastName || !email || !password || !userType) {
      return res.status(400).json({ error: 'Все поля обязательны для заполнения' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      firstName,
      lastName,
      email,
      telegramChatId,
      passwordHash,
      userType
    });

    return res.status(201).json({
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      userType: user.userType
    });
  } catch (err) {
    console.error('Ошибка регистрации:', err);
    return res.status(500).json({ error: 'Ошибка сервера при регистрации' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Введите email и пароль' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        userType: user.userType,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    );

    res.json({ token });
  } catch (err) {
    console.error('Ошибка логина:', err);
    res.status(500).json({ error: 'Ошибка сервера при входе' });
  }
});

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  (req, res) => {
    // Здесь req.user — экземпляр документа пользователя
    const user = req.user as unknown as IUser & { _id: any };
    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, userType: user.userType },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    );
    res.redirect(`${process.env.FRONTEND_URL}/auth/social?token=${token}`);
  }
);

router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }));

router.get(
  '/facebook/callback',
  passport.authenticate('facebook', { session: false, failureRedirect: '/login' }),
  (req, res) => {
    const user = req.user as unknown as IUser & { _id: any };
    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, userType: user.userType },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    );
    res.redirect(`${process.env.FRONTEND_URL}/auth/social?token=${token}`);
  }
);

export default router;
