import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // кому приходит уведомление
  type: { type: String, enum: ['BOOKING'], required: true },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  message: String,
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Notification', notificationSchema);