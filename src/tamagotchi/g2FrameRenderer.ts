import { encodeGrayscalePng } from './pngEncoder';
import type { MenuScreen, TamagotchiState } from './types';

const WIDTH = 576;
const HEIGHT = 324;
const ACCENT = '#95ff5c';
const CARD_BG = '#050905';
const CHIP_BG = '#0f2f18';

let mascotBitmapPromise: Promise<ImageBitmap> | null = null;

const getMascotBitmap = (imageUrl: string): Promise<ImageBitmap> => {
    if (!mascotBitmapPromise) {
        mascotBitmapPromise = fetch(imageUrl)
            .then((response) => response.blob())
            .then((blob) => createImageBitmap(blob));
    }
    return mascotBitmapPromise;
};

const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill?: string,
    stroke?: string,
): void => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
    }
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
};

const drawMeter = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    value: number,
    max: number,
): void => {
    ctx.fillStyle = '#e7ffe0';
    ctx.font = '42px Arial, sans-serif';
    ctx.fillText(label, x, y);

    const chipY = y + 10;
    for (let i = 0; i < max; i += 1) {
        drawRoundedRect(ctx, x + i * 46, chipY, 38, 38, 9, i < value ? ACCENT : CHIP_BG);
    }
};

const actionIndex = (screen: MenuScreen): number => {
    if (screen === 'feed') return 0;
    if (screen === 'play') return 1;
    if (screen === 'clean') return 2;
    return -1;
};

const computeStatusText = (state: TamagotchiState): string => {
    if (!state.isAlive) return 'DEAD';
    if (state.isSick) return 'SICK';
    if (state.health > 80) return 'GOOD';
    if (state.health > 45) return 'OK';
    return 'WEAK';
};

const ageText = (minutes: number): string => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}:${String(m).padStart(2, '0')}:00`;
};

export const renderG2InterfaceFrame = async (
    state: TamagotchiState,
    selectedScreen: MenuScreen,
    mascotUrl: string,
): Promise<number[]> => {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    drawRoundedRect(ctx, 10, 10, WIDTH - 20, HEIGHT - 20, 18, undefined, ACCENT);

    drawRoundedRect(ctx, 32, 28, 285, 155, 24, CARD_BG, ACCENT);
    drawRoundedRect(ctx, 32, 196, 285, 98, 24, CARD_BG, ACCENT);

    drawMeter(ctx, 336, 54, 'Hunger:', state.hunger, 4);
    drawMeter(ctx, 336, 120, 'Happy', state.happiness, 4);
    drawMeter(ctx, 336, 186, 'Poop:', state.poop, 3);

    const activeAction = actionIndex(selectedScreen);
    const actions = ['FEED', 'PLAY', 'CLEAN'];
    ctx.font = '44px Arial, sans-serif';
    for (let i = 0; i < actions.length; i += 1) {
        const y = 236 + i * 34;
        ctx.fillStyle = '#f1fff0';
        ctx.fillText(actions[i], 126, y);
        drawRoundedRect(ctx, 238, y - 25, 37, 37, 8, i === activeAction ? ACCENT : CHIP_BG);
    }

    ctx.fillStyle = '#f1fff0';
    ctx.font = '43px Arial, sans-serif';
    ctx.fillText('NAME:', 350, 236);
    ctx.fillText('AGE:', 350, 270);
    ctx.fillText('STATUS:', 350, 304);

    ctx.textAlign = 'right';
    ctx.fillText('G2 PET', 548, 236);
    ctx.fillText(ageText(state.ageMinutes), 548, 270);
    ctx.fillText(computeStatusText(state), 548, 304);
    ctx.textAlign = 'left';

    const bitmap = await getMascotBitmap(mascotUrl);
    const boxX = 56;
    const boxY = 43;
    const boxW = 236;
    const boxH = 124;
    const scale = Math.min(boxW / bitmap.width, boxH / bitmap.height);
    const drawW = bitmap.width * scale;
    const drawH = bitmap.height * scale;
    const dx = boxX + (boxW - drawW) / 2;
    const dy = boxY + (boxH - drawH) / 2;
    ctx.drawImage(bitmap, dx, dy, drawW, drawH);

    const rgba = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
    const gray = new Uint8Array(WIDTH * HEIGHT);
    for (let i = 0; i < WIDTH * HEIGHT; i += 1) {
        const offset = i * 4;
        gray[i] = (rgba[offset] * 77 + rgba[offset + 1] * 151 + rgba[offset + 2] * 28) >>> 8;
    }

    return Array.from(encodeGrayscalePng(WIDTH, HEIGHT, gray));
};
