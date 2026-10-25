/** Runs inside Chrome. Canvas converts CSS Color 4 values to sRGB before
 * WCAG luminance calculations; translucent surfaces are composited all the
 * way to the canvas. Gradient-backed text is reported, not silently passed.
 */
export function measureTextContrast(selector) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const cache = new Map(), backgrounds = new Map();
  const rgba = value => {
    if (cache.has(value)) return cache.get(value);
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const data = [...ctx.getImageData(0, 0, 1, 1).data];
    data[3] /= 255;
    cache.set(value, data);
    return data;
  };
  const mix = (front, back) => [0, 1, 2].map(i => front[i] * front[3] + back[i] * (1 - front[3]));
  const background = el => {
    if (!el) return [255, 255, 255];
    if (backgrounds.has(el)) return backgrounds.get(el);
    const result = mix(rgba(getComputedStyle(el).backgroundColor), background(el.parentElement));
    backgrounds.set(el, result);
    return result;
  };
  const luminance = rgb => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const failures = [], unsupported = [];
  let tested = 0;
  for (const el of document.querySelectorAll(`${selector} *`)) {
    if (el.closest('svg, [aria-hidden="true"], [disabled]')) continue;
    const text = [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim();
    if (!/[\p{L}\p{N}]/u.test(text) || !el.getClientRects().length) continue;
    const style = getComputedStyle(el), rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height || style.visibility === 'hidden' || Number(style.opacity) < .5) continue;
    let parent = el, gradient = false;
    while (parent) { if (getComputedStyle(parent).backgroundImage !== 'none') gradient = true; parent = parent.parentElement; }
    if (gradient) { unsupported.push(text.slice(0, 50)); continue; }
    const bg = background(el), fg = mix(rgba(style.color), bg), a = luminance(fg), b = luminance(bg);
    const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
    const required = large ? 3 : 4.5;
    tested++;
    if (ratio + .005 < required) failures.push({ text: text.slice(0, 60), className: el.className, ratio: +ratio.toFixed(2), required });
  }
  return { tested, failures, unsupported };
}
