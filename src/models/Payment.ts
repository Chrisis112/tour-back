import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    unique: true, // можно убрать, если необходимы множественные платежи на бронь
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  currency: {
    type: String,
    default: 'EUR',
  },
  paymentMethod: {
    type: String,
    required: true,
    // enum: ['card', 'bank_transfer', ...], // по необходимости
  },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'COMPLETED', 'FAILED'],
    default: 'pending',
  },
  transactionId: {
    type: String,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
