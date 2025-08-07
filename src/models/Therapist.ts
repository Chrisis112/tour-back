import mongoose from 'mongoose';

const CertificateSchema = new mongoose.Schema({
  fileUrl: { type: String, required: true },
  title: { type: String }
});

const ServiceSchema = new mongoose.Schema({
  title: String,
  description: String,
  photoUrl: String,
  variants: [
    {
      duration: Number,
      price: Number
    }
  ]
});

const TherapistSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  bio: String,
  photoUrl: String,
  skills: [String],
  certificates: [CertificateSchema],
  services: [ServiceSchema]
});

export default mongoose.models.Therapist || mongoose.model('Therapist', TherapistSchema);



