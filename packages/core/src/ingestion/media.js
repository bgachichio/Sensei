import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * MediaProcessor - Handles image/media ingestion pipeline
 * Store → Thumbnail → OCR → AI Description → Embedding → Entity Extraction
 */
export class MediaProcessor {
  constructor({ storage, database, aiProvider }) {
    this.storage = storage;
    this.db = database;
    this.ai = aiProvider;
    this.mediaPath = path.join(storage.basePath, 'knowledge', 'media');
    this.thumbPath = path.join(storage.basePath, 'knowledge', 'media', 'thumbs');
    if (!fs.existsSync(this.thumbPath)) fs.mkdirSync(this.thumbPath, { recursive: true });
    this.hasTesseract = this._checkBinary('tesseract');
  }

  _checkBinary(name) {
    try { execSync(`which ${name}`, { stdio: 'pipe' }); return true; } catch { return false; }
  }

  /**
   * Process an image file and return structured metadata
   */
  async processImage(buffer, filename, mimeType = 'image/jpeg') {
    const ext = path.extname(filename) || '.jpg';
    const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 12);
    const storedName = `${Date.now()}-${hash}${ext}`;
    const fullPath = path.join(this.mediaPath, storedName);
    const thumbName = `thumb-${storedName}`;
    const thumbFullPath = path.join(this.thumbPath, thumbName);

    // 1. Store original
    fs.writeFileSync(fullPath, buffer);

    // 2. Generate thumbnail (use sharp if available, else copy)
    try {
      const sharp = (await import('sharp')).default;
      await sharp(buffer).resize(300, 300, { fit: 'inside' }).jpeg({ quality: 70 }).toFile(thumbFullPath);
    } catch {
      // Fallback: just copy original as thumb
      fs.copyFileSync(fullPath, thumbFullPath);
    }

    // 3. OCR (if tesseract available)
    let ocrText = '';
    if (this.hasTesseract && ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/tiff'].includes(mimeType)) {
      try {
        ocrText = execSync(`tesseract "${fullPath}" stdout 2>/dev/null`, { timeout: 15000, maxBuffer: 1024 * 1024 }).toString().trim();
      } catch { /* OCR failed silently */ }
    }

    // 4. AI description (if AI configured)
    let description = '';
    if (this.ai && this.ai.configured) {
      try {
        const base64 = buffer.toString('base64');
        description = await this.ai.describeImage(base64, mimeType);
      } catch (e) {
        console.warn(`Image description failed: ${e.message}`);
      }
    }

    const metadata = {
      path: `media/${storedName}`,
      thumbPath: `media/thumbs/${thumbName}`,
      originalName: filename,
      mimeType,
      size: buffer.length,
      ocrText,
      description,
      processedAt: new Date().toISOString()
    };

    return metadata;
  }

  /**
   * Process a PDF and extract text
   */
  async processPDF(buffer, filename) {
    const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 12);
    const storedName = `${Date.now()}-${hash}.pdf`;
    const fullPath = path.join(this.mediaPath, storedName);
    fs.writeFileSync(fullPath, buffer);

    let extractedText = '';
    try {
      extractedText = execSync(`pdftotext "${fullPath}" - 2>/dev/null`, { timeout: 30000, maxBuffer: 5 * 1024 * 1024 }).toString().trim();
    } catch { /* pdftotext not available */ }

    return {
      path: `media/${storedName}`,
      originalName: filename,
      mimeType: 'application/pdf',
      size: buffer.length,
      extractedText,
      processedAt: new Date().toISOString()
    };
  }
}
