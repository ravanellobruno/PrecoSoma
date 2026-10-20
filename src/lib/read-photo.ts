import { recognizeText } from '@infinitered/react-native-mlkit-text-recognition';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { mergeReadings, readPriceTag, type Rect, type TagReading } from '@/lib/price-tag';

type Photo = { uri: string; width: number; height: number };

/** Widths the framed tag is read at: large display digits only come out at some scales. */
const OCR_WIDTHS = [1000, 600];

/**
 * Reads the price tag from the part of the photo inside `region`. OCR on the whole photo loses
 * large decorative digits among the surrounding text, so the region is cropped and read at more
 * than one scale, and the readings are merged.
 */
export async function readPhoto(photo: Photo, region?: Rect): Promise<TagReading> {
  const originX = region ? Math.max(0, Math.round(region.left)) : 0;
  const originY = region ? Math.max(0, Math.round(region.top)) : 0;
  const crop = region && {
    originX,
    originY,
    width: Math.min(photo.width, Math.round(region.right)) - originX,
    height: Math.min(photo.height, Math.round(region.bottom)) - originY,
  };

  const readings: TagReading[] = [];
  for (const width of OCR_WIDTHS) {
    const context = ImageManipulator.manipulate(photo.uri);
    if (crop) context.crop(crop);
    const rendered = await context.resize({ width, height: null }).renderAsync();
    const image = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });

    const text = await recognizeText(image.uri);
    const reading = readPriceTag(text.blocks.flatMap((block) => block.lines));
    // Digit sizes are relative to the image height, so the scales can be compared.
    const candidates = reading.candidates.map((c) => ({ ...c, size: c.size / image.height }));
    readings.push({ ...reading, candidates });
  }
  return mergeReadings(readings);
}
