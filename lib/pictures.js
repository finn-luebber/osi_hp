/**
 * Writes the pictures into the finished site. Every picture is decoded and saved again,
 * which leaves out anything that is not picture data (camera and location details,
 * hidden content), and gets a small copy for thumbnails.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export async function writePictures(outputDir) {
  const out = path.join(outputDir, 'uploads');
  fs.mkdirSync(out, { recursive: true });
  for (const job of globalThis.osiPictureJobs || []) {
    const target = path.join(out, job.name);
    // unchanged pictures are not encoded again when the site is rebuilt on the same machine
    if (fs.existsSync(target) && fs.statSync(target).mtimeMs >= fs.statSync(job.src).mtimeMs) continue;
    const src = sharp(job.src, { limitInputPixels: 40_000_000 }).rotate();
    const full = src.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true });
    await (job.isJpeg ? full.jpeg({ quality: 85, mozjpeg: true }) : full.png({ compressionLevel: 9 })).toFile(target);
    await src.clone().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(out, job.thumb));
  }
}
