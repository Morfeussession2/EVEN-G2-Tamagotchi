import type { MenuScreen, TamagotchiState } from './types';

const stageFaceMap: Record<TamagotchiState['stage'], string[]> = {
    egg: ['   ___   ', '  /   \\  ', ' |  o  | ', '  \\___/  '],
    baby: ['  ( ._. ) ', '  /|_|\\  ', '   / \\   '],
    child: ['  ( ^_^ ) ', '  /( )\\  ', '   / \\   '],
    teen: ['  ( -_- ) ', '  /( )\\  ', '   / \\   '],
    adult: ['  ( o_o ) ', '  /( )\\  ', '   / \\   '],
};

const screenLabel: Record<MenuScreen, string> = {
    status: 'STATUS',
    feed: 'FEED',
    play: 'PLAY',
    clean: 'CLEAN',
    medicine: 'MEDICINE',
};

const toBar = (value: number, max: number, full = '█', empty = '▒'): string =>
    `${full.repeat(value)}${empty.repeat(max - value)}`;

const formatAge = (ageMinutes: number): string => {
    const hours = Math.floor(ageMinutes / 60);
    const minutes = ageMinutes % 60;
    return `${hours}:${String(minutes).padStart(2, '0')}:00`;
};

export const buildAsciiFrame = (
    state: TamagotchiState,
    menu: MenuScreen,
    message: string,
): string => {
    const face = [...stageFaceMap[state.stage]];
    if (!state.isAlive) {
        face.splice(0, face.length, '  ( x_x ) ', '   /|_|\\  ', '    / \\   ');
    } else if (state.isSick) {
        face.splice(0, face.length, '  ( +_+ ) ', '  /( )\\  ', '   / \\   ');
    }

    const lines = [
        'EVEN TAMAGOTCHI',
        `MENU: ${screenLabel[menu]}`,
        `OPTIONS: ST FE PL CL MD`,
        `CTRL: TOP/BOT NAV | CLK OK | DBL ST`,
        ...face,
        `HUNGER ${toBar(state.hunger, 4)}`,
        `HAPPY  ${toBar(state.happiness, 4)}`,
        `POOP   ${toBar(state.poop, 3)}`,
        `AGE ${formatAge(state.ageMinutes)} WEIGHT ${state.weight}`,
        `HEALTH ${Math.round(state.health)}% STAGE ${state.stage.toUpperCase()}`,
        message ? `> ${message}` : '> ...',
    ];

    return lines.join('\n');
};
