import { encodeGrayscalePng } from './pngEncoder';
import hungerFullUrl from '../Icons/Fome1.png';
import hungerEmptyUrl from '../Icons/Fome2.png';
import happyFullUrl from '../Icons/happy1.png';
import happyEmptyUrl from '../Icons/happy2.png';
import lifeFullUrl from '../Icons/Life1.png';
import lifeEmptyUrl from '../Icons/Life2.png';
import poopFullUrl from '../Icons/Poop1.png';

const WIDTH = 132;
const HEIGHT = 100;
const ICON_SIZE = 16;
const ICON_GAP = 2;
const LABEL_WIDTH = 56;
const HUNGER_LABEL_WIDTH = 62;

let hungerFullBitmapPromise: Promise<ImageBitmap> | null = null;
let hungerEmptyBitmapPromise: Promise<ImageBitmap> | null = null;
let happyFullBitmapPromise: Promise<ImageBitmap> | null = null;
let happyEmptyBitmapPromise: Promise<ImageBitmap> | null = null;
let lifeFullBitmapPromise: Promise<ImageBitmap> | null = null;
let lifeEmptyBitmapPromise: Promise<ImageBitmap> | null = null;
let poopFullBitmapPromise: Promise<ImageBitmap> | null = null;

const loadBitmap = (url: string): Promise<ImageBitmap> =>
    fetch(url)
        .then((response) => {
            if (!response.ok) throw new Error(`Error loading image: ${response.statusText}`);
            return response.blob();
        })
        .then((blob) => createImageBitmap(blob));

const getHungerFullBitmap = (): Promise<ImageBitmap> => {
    if (!hungerFullBitmapPromise) {
        hungerFullBitmapPromise = loadBitmap(hungerFullUrl);
    }
    return hungerFullBitmapPromise;
};

const getHungerEmptyBitmap = (): Promise<ImageBitmap> => {
    if (!hungerEmptyBitmapPromise) {
        hungerEmptyBitmapPromise = loadBitmap(hungerEmptyUrl);
    }
    return hungerEmptyBitmapPromise;
};

const getHappyFullBitmap = (): Promise<ImageBitmap> => {
    if (!happyFullBitmapPromise) {
        happyFullBitmapPromise = loadBitmap(happyFullUrl);
    }
    return happyFullBitmapPromise;
};

const getHappyEmptyBitmap = (): Promise<ImageBitmap> => {
    if (!happyEmptyBitmapPromise) {
        happyEmptyBitmapPromise = loadBitmap(happyEmptyUrl);
    }
    return happyEmptyBitmapPromise;
};

const getLifeFullBitmap = (): Promise<ImageBitmap> => {
    if (!lifeFullBitmapPromise) {
        lifeFullBitmapPromise = loadBitmap(lifeFullUrl);
    }
    return lifeFullBitmapPromise;
};

const getLifeEmptyBitmap = (): Promise<ImageBitmap> => {
    if (!lifeEmptyBitmapPromise) {
        lifeEmptyBitmapPromise = loadBitmap(lifeEmptyUrl);
    }
    return lifeEmptyBitmapPromise;
};

const getPoopFullBitmap = (): Promise<ImageBitmap> => {
    if (!poopFullBitmapPromise) {
        poopFullBitmapPromise = loadBitmap(poopFullUrl);
    }
    return poopFullBitmapPromise;
};

const drawIconBar = (
    ctx: CanvasRenderingContext2D,
    label: string,
    value: number,
    max: number,
    centerY: number,
    fullBitmap: ImageBitmap,
    emptyBitmap: ImageBitmap,
    labelWidth = LABEL_WIDTH,
): void => {
    ctx.fillStyle = '#fff';
    ctx.fillText(label, 0, centerY);
    for (let i = 0; i < max; i += 1) {
        const bitmap = i < value ? fullBitmap : emptyBitmap;
        const x = labelWidth + i * (ICON_SIZE + ICON_GAP);
        const y = Math.floor(centerY - ICON_SIZE / 2);
        ctx.drawImage(bitmap, x, y, ICON_SIZE, ICON_SIZE);
    }
};

const drawPoopBar = (
    ctx: CanvasRenderingContext2D,
    label: string,
    value: number,
    max: number,
    centerY: number,
    fullBitmap: ImageBitmap,
): void => {
    ctx.fillStyle = '#fff';
    ctx.fillText(label, 0, centerY);
    for (let i = 0; i < max; i += 1) {
        const x = LABEL_WIDTH + i * (ICON_SIZE + ICON_GAP);
        const y = Math.floor(centerY - ICON_SIZE / 2);
        if (i < value) {
            ctx.drawImage(fullBitmap, x, y, ICON_SIZE, ICON_SIZE);
        } else {
            ctx.fillStyle = '#000';
            ctx.fillRect(x, y, ICON_SIZE, ICON_SIZE);
        }
    }
};

export const renderLifeBarPng = async (
    hunger: number,
    happiness: number,
    poop: number,
    life: number,
    visible = true,
): Promise<Uint8Array> => {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    if (visible) {
        ctx.fillStyle = '#fff';
        ctx.font = '16px monospace';
        ctx.textBaseline = 'middle';
        const [
            hungerFullBitmap,
            hungerEmptyBitmap,
            happyFullBitmap,
            happyEmptyBitmap,
            lifeFullBitmap,
            lifeEmptyBitmap,
            poopFullBitmap,
        ] = await Promise.all([
            getHungerFullBitmap(),
            getHungerEmptyBitmap(),
            getHappyFullBitmap(),
            getHappyEmptyBitmap(),
            getLifeFullBitmap(),
            getLifeEmptyBitmap(),
            getPoopFullBitmap(),
        ]);
        drawIconBar(ctx, 'Hunger:', hunger, 4, 14, hungerFullBitmap, hungerEmptyBitmap, HUNGER_LABEL_WIDTH);
        drawIconBar(ctx, 'Happy:', happiness, 4, 38, happyFullBitmap, happyEmptyBitmap);
        drawPoopBar(ctx, 'Poop:', poop, 3, 62, poopFullBitmap);
        drawIconBar(ctx, 'LIFE:', life, 4, 86, lifeFullBitmap, lifeEmptyBitmap);
    }

    const rgba = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
    const gray = new Uint8Array(WIDTH * HEIGHT);
    for (let i = 0; i < WIDTH * HEIGHT; i += 1) {
        const offset = i * 4;
        gray[i] = (rgba[offset] * 77 + rgba[offset + 1] * 151 + rgba[offset + 2] * 28) >>> 8;
    }

    return encodeGrayscalePng(WIDTH, HEIGHT, gray);
};
