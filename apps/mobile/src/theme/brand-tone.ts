// Adapt legacy green shades to the selected club's primary hue. Neutral,
// gold and category-specific blue/purple colors keep their original meaning.
export function brandTone(color: string, primary: string, preserve = false): string {
  if (preserve || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color)) return color;
  function hsl(hex: string) {
    const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255) as [number, number, number];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    const lightness = (max + min) / 2;
    if (!delta) return [0, 0, lightness] as const;
    const hue = max === r ? ((g - b) / delta + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / delta + 2) * 60 : ((r - g) / delta + 4) * 60;
    return [hue, delta / (1 - Math.abs(2 * lightness - 1)), lightness] as const;
  }
  const [hue, saturation, lightness] = hsl(color);
  if (hue < 75 || hue > 175 || saturation < 0.04) return color;
  const target = hsl(primary)[0] / 30;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(target % 2 - 1)), m = lightness - chroma / 2;
  const rgb = target < 1 ? [chroma, x, 0] : target < 2 ? [x, chroma, 0] : target < 3 ? [0, chroma, x] : target < 4 ? [0, x, chroma] : target < 5 ? [x, 0, chroma] : [chroma, 0, x];
  return '#' + rgb.map((value) => Math.round((value + m) * 255).toString(16).padStart(2, '0')).join('') + color.slice(7);
}
