import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import mongoose from 'mongoose';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';

import dotenv from 'dotenv';
dotenv.config();

import authRouter from './src/routes/auth';
import usersRouter from './src/routes/users';
import blogRouter from './src/routes/blog'
import therapistsRouter from './src/routes/therapists';
import bookingsRouter from './src/routes/bookings';
import reviewsRouter from './src/routes/reviews';
import serviceRouter from './src/routes/services';
import uploadRouter from './src/routes/upload';
import therapistRouter from './src/routes/therapists';
import certificatesRouter from './src/routes/certificates';
import paymentsRouter from './src/routes/payments';
import webhookRouter from './src/routes/stripeWebhook';

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI is not defined in .env!');
}

// Подключение к MongoDB
mongoose.connect(uri)
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

const app = express();
// Настройка CORS-домена (замените на ваш фронтенд URL)
const allowedOrigins = [
  'http://localhost:3000',
  'mytours.ee' // укажите ваш реальный домен фронтенда
];

app.use(helmet());
app.use(cors({
  origin: function(origin, callback) {
    // Позволить запросы с указанных origin или без origin (postman, серверные запросы)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use('/api/webhook', express.raw({ type: 'application/json' }), webhookRouter);
app.use(express.json()); // только после, для остальных маршрутов!
app.use(express.urlencoded({ extended: true }));
app.use(compression());
app.use(morgan('combined'));
app.use(express.json());

// Создаем HTTP сервер и передаем ему наше Express-приложение
const server = http.createServer(app);

// Инициализируем Socket.IO сервер
export const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Обработка подключений Socket.IO
io.on('connection', (socket) => {
  console.log('⚡️ New client connected, socket id:', socket.id);

  // Обработка подписки на комнату по ID бронирования (для чата)
  socket.on('joinBookingRoom', (bookingId: string) => {
    socket.join(bookingId);
    console.log(`Socket ${socket.id} joined room ${bookingId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected, socket id:', socket.id);
  });
});

// Роуты

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/therapists', therapistsRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/services', serviceRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/therapists', therapistRouter);
app.use('/api/certificates', certificatesRouter);
app.use('/api/blog', blogRouter);
app.use('/', paymentsRouter);


// Обработка ошибок
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3001;

// Запускаем HTTP-сервер (с Socket.IO)
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
