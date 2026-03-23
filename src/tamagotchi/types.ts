export type PetStage = 'egg' | 'baby' | 'child' | 'teen' | 'adult';
export type EggVariant = 'egg1' | 'egg2';

export type MenuScreen = 'status' | 'feed' | 'play' | 'clean' | 'medicine';

export interface TamagotchiState {
    petName: string;
    eggVariant: EggVariant;
    requiresEggSelection: boolean;
    hunger: number; // 0-4
    happiness: number; // 0-4
    poop: number; // 0-3
    ageMinutes: number;
    weight: number;
    health: number; // 0-100
    stage: PetStage;
    isSick: boolean;
    isAlive: boolean;
    lastTickAt: number;
}

export interface TamagotchiActionResult {
    changed: boolean;
    message: string;
}
