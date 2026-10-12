// WCAG 2.2 relative luminance and contrast, including alpha over a solid colour.

export function parseColor(value) {
  const text = String(value).trim();
  const channels = text.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/i
  );
  if (channels) {
    return [
      Number(channels[1]),
      Number(channels[2]),
      Number(channels[3]),
      channels[4] === undefined ? 1 : Number(channels[4]),
    ];
  }

  const hex = text.replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [
      Number.parseInt(hex[0] + hex[0], 16),
      Number.parseInt(hex[1] + hex[1], 16),
      Number.parseInt(hex[2] + hex[2], 16),
      1,
    ];
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
      1,
    ];
  }
  throw new Error(`Unrecognised colour: ${value}`);
}

function linear(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function luminance([red, green, blue]) {
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

export function composite(front, back) {
  const frontAlpha = front[3] ?? 1;
  const backAlpha = back[3] ?? 1;
  const alpha = frontAlpha + backAlpha * (1 - frontAlpha);
  if (alpha === 0) return [0, 0, 0, 0];
  return [0, 1, 2]
    .map(
      (index) =>
        (front[index] * frontAlpha + back[index] * backAlpha * (1 - frontAlpha)) /
        alpha
    )
    .concat(alpha);
}

export function contrastRatio(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

// 14pt bold is 18.67px. 18pt is 24px. Weight 700 is bold.
export function isLargeText(fontSizePx, fontWeight) {
  const size = Number.parseFloat(fontSizePx);
  const weight = Number.parseInt(fontWeight, 10);
  return size >= 24 || (weight >= 700 && size >= (14 * 96) / 72);
}

export function contrastOf(foreground, background) {
  const front = Array.isArray(foreground) ? foreground : parseColor(foreground);
  const back = Array.isArray(background) ? background : parseColor(background);
  const painted = composite(front, back);
  return contrastRatio(painted, back);
}
