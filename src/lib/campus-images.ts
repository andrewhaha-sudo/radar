export function captureCampusImage(source: CanvasImageSource, width: number, height: number) {
  if (!width || !height) throw new Error('Wait for the image or video to finish loading.');
  const canvas = document.createElement('canvas'),
    ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image capture is unavailable in this browser.');
  let longest = Math.min(1920, Math.max(width, height)),
    image = '';
  for (let attempt = 0; attempt < 8; attempt++) {
    const scale = longest / Math.max(width, height);
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    image = canvas.toDataURL('image/jpeg', 0.9);
    if (image.length <= 300000) return image;
    longest = Math.floor(longest * 0.82);
  }
  throw new Error('This view is too detailed to save. Try a smaller image or a closer frame.');
}
