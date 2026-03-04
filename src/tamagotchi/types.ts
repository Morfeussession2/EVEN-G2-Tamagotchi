export type PetStage = 'egg' | 'baby' | 'child' | 'teen' | 'adult';

export type MenuScreen = 'status' | 'feed' | 'play' | 'clean' | 'medicine';

export interface TamagotchiState {
    petName: string;
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
