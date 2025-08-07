import express, { Request, Response, NextFunction } from 'express';
import AWS from 'aws-sdk';
import multer from 'multer';
import mongoose from 'mongoose';

const localizedStringSchema = new mongoose.Schema({
  en: { type: String, trim: true },
  ru: { type: String, trim: true },
  et: { type: String, trim: true },
  fi: { type: String, trim: true },
  pl: { type: String, trim: true },
  lt: { type: String, trim: true },
  lv: { type: String, trim: true },
}, { _id: false });

const BlogPostSchema = new mongoose.Schema({
  country: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2, match: /^[A-Z]{2}$/ },
  city: { type: String, required: true, trim: true, match: /^[A-Za-z\s\-]+$/ },
  title: { type: localizedStringSchema, required: true },
  description: { type: localizedStringSchema, required: true },
  photoUrl: { type: String },
  categories: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
});

const BlogPost = mongoose.models.BlogPost || mongoose.model('BlogPost', BlogPostSchema);

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  region: process.env.AWS_REGION!,
});
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const lang = (req.query.lang?.toString() || 'en').toLowerCase();
    const country = req.query.country?.toString().toUpperCase();
    const city = req.query.city?.toString();

    const filter: any = {};
    if (country) filter.country = country;
    if (city) filter.city = city;

    const blogs = await BlogPost.find(filter).sort({ createdAt: -1 }).lean();
    res.json(blogs);
  } catch (error) {
    console.error('[GET /api/blog] Failed fetching blogs:', error);
    res.status(500).json({ error: 'Failed to fetch blogs' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ error: 'Invalid blog ID' });

    const blog = await BlogPost.findById(id).lean();

    if (!blog) return res.status(404).json({ error: 'Blog post not found' });

    res.json(blog);
  } catch (error) {
    console.error('[GET /api/blog/:id] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', upload.single('photo'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { country, city, title, description } = req.body;
    let categoriesRaw = req.body.categories;

    if (!country || !city || !title || !description) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let categories: string[] = [];
    if (categoriesRaw) {
      try {
        categories = JSON.parse(categoriesRaw);
        if (!Array.isArray(categories)) categories = [];
      } catch {
        categories = [];
      }
    }

    let parsedTitle: Record<string, string>;
    let parsedDescription: Record<string, string>;
    try {
      parsedTitle = typeof title === 'string' ? JSON.parse(title) : title;
    } catch {
      return res.status(400).json({ error: 'Invalid title format, must be JSON object' });
    }
    try {
      parsedDescription = typeof description === 'string' ? JSON.parse(description) : description;
    } catch {
      return res.status(400).json({ error: 'Invalid description format, must be JSON object' });
    }

    if (!parsedTitle.en || !parsedDescription.en) {
      return res.status(400).json({ error: 'English translations for title and description are required' });
    }

    let photoUrl = '';
    if (req.file) {
      const fileName = `blog/${Date.now()}-${req.file.originalname}`;
      const params = {
        Bucket: process.env.AWS_S3_BUCKET!,
        Key: fileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        ACL: 'public-read',
      };
      const uploadResult = await s3.upload(params).promise();
      photoUrl = uploadResult.Location;
    }

    const newPost = new BlogPost({
      country,
      city,
      title: parsedTitle,
      description: parsedDescription,
      photoUrl,
      categories,
    });
    await newPost.save();

    return res.status(201).json({ success: true, post: newPost });
  } catch (err) {
    console.error('Failed to save blog post:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ error: 'Invalid blog ID' });

    let { title, description, categories } = req.body;

    if (typeof categories === 'string') {
      try {
        categories = JSON.parse(categories);
      } catch {
        categories = [];
      }
    }
    if (!Array.isArray(categories)) categories = [];

    try {
      title = typeof title === 'string' ? JSON.parse(title) : title;
    } catch {
      return res.status(400).json({ error: 'Invalid title format' });
    }
    try {
      description = typeof description === 'string' ? JSON.parse(description) : description;
    } catch {
      return res.status(400).json({ error: 'Invalid description format' });
    }

    if (!title.en || !description.en) {
      return res.status(400).json({ error: 'English translations for title and description are required' });
    }

    const updateData: any = {
      ...req.body,
      title,
      description,
      categories,
    };

    const updated = await BlogPost.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: 'Blog post not found' });
    res.json({ success: true, post: updated });
  } catch (error) {
    console.error('[PUT /api/blog/:id] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ error: 'Invalid blog ID' });
    const deleted = await BlogPost.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: 'Blog post not found' });
    res.json({ success: true, message: 'Blog post deleted' });
  } catch (error) {
    console.error('[DELETE /api/blog/:id] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
