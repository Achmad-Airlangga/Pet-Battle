/**
 * Pet sprites: hand-designed 32x32 pixel art per pet (sprites/recipes.ts),
 * painted with lit, shaded volumes (sprites/pixel.ts). Same pet -> same sprite
 * on every client. Sprites face right; flip to face left.
 */
import { Sprite } from './sprites/pixel.ts';
import { fallbackRecipe, recipeFor } from './sprites/recipes.ts';
import type { Element } from './types.ts';

const cache = new Map<string, HTMLCanvasElement>();

export function petSprite(id: string, element: Element, ko = false): HTMLCanvasElement {
  const key = `${id}|${ko}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const sprite = new Sprite();
  (recipeFor(id) ?? fallbackRecipe(element))(sprite);
  const canvas = sprite.toCanvas(ko);
  cache.set(key, canvas);
  return canvas;
}

/** A scaled copy for DOM use (lobby cards, HUD buttons). */
export function spriteImage(id: string, element: Element, size: number, ko = false): HTMLCanvasElement {
  const src = petSprite(id, element, ko);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  c.className = 'sprite';
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, size, size);
  return c;
}
