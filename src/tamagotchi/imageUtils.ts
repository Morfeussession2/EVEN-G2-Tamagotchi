import { encodeGrayscalePng } from './pngEncoder';

export const convertImageToGrayscalePng = async (
    imageUrl: string,
    targetWidth: number,
    targetHeight: number,
    occupancy = 0.82,
): Promise<Uint8Array> => {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Error loading image: ${response.statusText}`);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    // Mantem proporcao do sprite (contain) para evitar distorcao.
    const safeOccupancy = Math.min(1, Math.max(0.2, occupancy));
    const scale =
        Math.min(targetWidth / bitmap.width, targetHeight / bitmap.height) * safeOccupancy;
    const drawWidth = Math.floor(bitmap.width * scale);
    const drawHeight = Math.floor(bitmap.height * scale);
    const offsetX = Math.floor((targetWidth - drawWidth) / 2);
    const offsetY = Math.floor((targetHeight - drawHeight) / 2);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    // Moldura retro dentro do container da imagem.
     //ctx.strokeStyle = '#95ff5c';
     //ctx.lineWidth = 2;
     //ctx.strokeRect(1, 1, targetWidth - 2, targetHeight - 2);
     //ctx.strokeStyle = '#3c7c2a';
     //ctx.lineWidth = 1;
     //ctx.strokeRect(6, 6, targetWidth - 12, targetHeight - 12);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, offsetX, offsetY, drawWidth, drawHeight);

    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const rgba = imageData.data;
    const gray = new Uint8Array(targetWidth * targetHeight);
    for (let i = 0; i < targetWidth * targetHeight; i += 1) {
        const offset = i * 4;
        gray[i] = (rgba[offset] * 77 + rgba[offset + 1] * 151 + rgba[offset + 2] * 28) >>> 8;
    }

    return encodeGrayscalePng(targetWidth, targetHeight, gray);
};
