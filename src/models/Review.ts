import mongoose from 'mongoose';

const ReviewSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  rater: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  createdAt: { type: Date, default: Date.now },
});

// Предотвращаем повторную регистрацию модели при пересборке в режиме watch
export default mongoose.models.Review || mongoose.model('Review', ReviewSchema);
