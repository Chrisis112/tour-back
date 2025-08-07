// /backend/models/Booking.ts

import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IMessage {
  sender: Types.ObjectId;
  text: string;
  timestamp: Date;
}

export interface IBooking extends Document {
  clientId: Types.ObjectId;
  therapistId: Types.ObjectId;
  serviceId: Types.ObjectId;
  date: string;
  price: number;   // 'YYYY-MM-DD'
  timeSlot: string;   // 'HH:mm'
  duration: number;   // минуты
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  messages: IMessage[];
  lastReadAt: Map<string, Date>;
  paymentStatus: {
    type: String,
    enum: ['PAID', 'UNPAID'],
    default: 'UNPAID'
  },
  stripePaymentId: String,    // Новое поле, время последнего прочтения для каждого пользователя
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>({
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const bookingSchema = new Schema<IBooking>({
  clientId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
  therapistId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
  date: { type: String, required: true },
  timeSlot: { type: String, required: true },
  duration: { type: Number, required: true },
  price: { type: Number, required: false },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  address: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'completed', 'cancelled'], 
    default: 'pending' 
  },
  messages: { type: [MessageSchema], default: [] },
  lastReadAt: {
    type: Map,
  of: Date,
  default: new Map(),
  }
}, {
  timestamps: true,
});

export default mongoose.models.Booking || mongoose.model<IBooking>('Booking', bookingSchema);
