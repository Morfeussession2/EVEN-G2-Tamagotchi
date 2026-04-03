import { BridgeStorage } from './bridgeStorage';
import type { EggVariant, PetStage, TamagotchiActionResult, TamagotchiState } from './types';

const STORAGE_KEY = 'even_tamagotchi_state_v1';
const MAX_HUNGER = 4;
const MAX_HAPPINESS = 4;
const MAX_POOP = 3;
const MIN_HEALTH = 0;
const MAX_HEALTH = 100;
const MAX_NAME_LENGTH = 12;

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

const sanitizeName = (value: string): string => {
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized) return 'G2 PET';
    return normalized.slice(0, MAX_NAME_LENGTH);
};

const resolveStage = (ageMinutes: number): PetStage => {
    if (ageMinutes < 60) return 'egg';
    if (ageMinutes < 1500) return 'baby';
    if (ageMinutes < 5820) return 'teen';
    return 'adult';
};

const makeInitialState = (): TamagotchiState => ({
    petName: 'G2 PET',
    eggVariant: 'egg1',
    requiresEggSelection: true,
    hunger: 1,
    happiness: 3,
    poop: 0,
    ageMinutes: 0,
    weight: 5,
    health: 90,
    stage: 'egg',
    isSick: false,
    isAlive: true,
    lastTickAt: Date.now(),
});

export class TamagotchiEngine {
    private state: TamagotchiState;

    constructor(initialState?: TamagotchiState) {
        this.state = initialState ?? makeInitialState();
        this.syncWithClock();
    }

    getState(): TamagotchiState {
        return { ...this.state };
    }

    syncWithClock(now = Date.now()): TamagotchiState {
        const elapsedMs = now - this.state.lastTickAt;
        const elapsedMinutes = Math.floor(elapsedMs / 60_000);
        if (elapsedMinutes > 0) {
            this.advanceMinutes(elapsedMinutes, now);
        } else {
             // Even if no minutes passed, update timestamp to now for relative drift.
             this.state.lastTickAt = now;
        }
        return this.getState();
    }

    tick(now = Date.now()): TamagotchiState {
        this.advanceMinutes(1, now);
        return this.getState();
    }

    fastForward(minutes: number, now = Date.now()): TamagotchiState {
        this.advanceMinutes(Math.max(0, Math.floor(minutes)), now);
        return this.getState();
    }

    resetAgeCache(now = Date.now()): TamagotchiState {
        this.state.eggVariant = 'egg1';
        this.state.requiresEggSelection = true;
        this.state.hunger = 1;
        this.state.happiness = 3;
        this.state.poop = 0;
        this.state.ageMinutes = 0;
        this.state.weight = 5;
        this.state.health = MAX_HEALTH;
        this.state.isSick = false;
        this.state.lastTickAt = now;
        this.updateDerivedState();
        this.persist();
        return this.getState();
    }

    chooseEgg(eggVariant: EggVariant, now = Date.now()): TamagotchiState {
        this.state.eggVariant = eggVariant;
        this.state.requiresEggSelection = false;
        this.state.lastTickAt = now;
        this.persist();
        return this.getState();
    }

    setPetName(name: string): TamagotchiState {
        this.state.petName = sanitizeName(name);
        this.persist();
        return this.getState();
    }

    feed(): TamagotchiActionResult {
        this.state.hunger = clamp(this.state.hunger - 1, 0, MAX_HUNGER);
        this.state.weight += 1;
        this.state.health = clamp(this.state.health + 1, MIN_HEALTH, MAX_HEALTH);
        this.updateDerivedState();
        this.persist();
        return { changed: true, message: 'Pet fed.' };
    }

    play(): TamagotchiActionResult {
        const previousHappiness = this.state.happiness;
        this.state.happiness = clamp(this.state.happiness + 1, 0, MAX_HAPPINESS);
        const happinessGain = this.state.happiness - previousHappiness;
        if (happinessGain > 0) {
            this.state.hunger = clamp(this.state.hunger + happinessGain, 0, MAX_HUNGER);
        }
        this.state.weight = clamp(this.state.weight - 1, 1, 99);
        if (previousHappiness < MAX_HAPPINESS) {
            this.state.health = clamp(this.state.health + 1, MIN_HEALTH, MAX_HEALTH);
        }
        this.updateDerivedState();
        this.persist();
        return { changed: true, message: 'Pet played and got happier.' };
    }

    applyPlaySeriesReward(userWonSeries: boolean): TamagotchiActionResult {
        const previousHappiness = this.state.happiness;
        if (userWonSeries) {
            this.state.happiness = MAX_HAPPINESS;
        } else {
            this.state.happiness = clamp(this.state.happiness + 1, 0, MAX_HAPPINESS);
        }
        const happinessGain = this.state.happiness - previousHappiness;
        if (happinessGain > 0) {
            this.state.hunger = clamp(this.state.hunger + happinessGain, 0, MAX_HUNGER);
        }
        this.state.weight = clamp(this.state.weight - 1, 1, 99);
        this.state.health = clamp(this.state.health + 1, MIN_HEALTH, MAX_HEALTH);
        this.updateDerivedState();
        this.persist();
        return {
            changed: true,
            message: userWonSeries
                ? 'You won 2/3! Happiness maxed.'
                : 'Pet won. Happiness +1.',
        };
    }

    clean(): TamagotchiActionResult {
        if (this.state.poop === 0) {
            return { changed: false, message: 'Nothing to clean.' };
        }
        this.state.poop = 0;
        this.state.health = clamp(this.state.health + 4, MIN_HEALTH, MAX_HEALTH);
        this.updateDerivedState();
        this.persist();
        return { changed: true, message: 'Area cleaned.' };
    }

    medicine(): TamagotchiActionResult {
        this.state.health = clamp(this.state.health + 15, MIN_HEALTH, MAX_HEALTH);
        this.state.isSick = false;
        this.updateDerivedState();
        this.persist();
        return { changed: true, message: 'Medicine applied.' };
    }

    discipline(): TamagotchiActionResult {
        this.state.happiness = clamp(this.state.happiness - 1, 0, MAX_HAPPINESS);
        this.state.health = clamp(this.state.health + 2, MIN_HEALTH, MAX_HEALTH);
        this.updateDerivedState();
        this.persist();
        return { changed: true, message: 'Discipline applied.' };
    }

    private advanceMinutes(minutes: number, now: number): void {
        for (let i = 0; i < minutes; i += 1) {
            this.state.ageMinutes += 1;
            if (this.state.ageMinutes % 3 === 0) {
                this.state.hunger = clamp(this.state.hunger + 1, 0, MAX_HUNGER);
            }
            if (this.state.ageMinutes % 4 === 0) {
                this.state.happiness = clamp(this.state.happiness - 1, 0, MAX_HAPPINESS);
            }
            if (this.state.ageMinutes % 12 === 0) {
                this.state.poop = clamp(this.state.poop + 1, 0, MAX_POOP);
            }

            const neglectPenalty =
                (this.state.hunger >= MAX_HUNGER ? 1 : 0) +
                (this.state.happiness <= 1 ? 2 : 0) +
                (this.state.poop >= 2 ? 3 : 0);

            this.state.health = clamp(this.state.health - neglectPenalty, MIN_HEALTH, MAX_HEALTH);
            if (this.state.hunger === 0 && this.state.happiness === MAX_HAPPINESS) {
                this.state.health = clamp(this.state.health + 5, MIN_HEALTH, MAX_HEALTH);
            }
            if (this.state.health <= 35) this.state.isSick = true;
        }

        this.state.lastTickAt = now;
        this.updateDerivedState();
        this.persist();
    }

    private updateDerivedState(): void {
        this.state.stage = resolveStage(this.state.ageMinutes);
        this.state.isAlive = true;
        if (this.state.health <= 35) {
            this.state.isSick = true;
        } else if (this.state.health >= 45) {
            this.state.isSick = false;
        }
    }

    static parseState(raw: string | null): TamagotchiState {
        if (!raw) return makeInitialState();
        try {
            const parsed = JSON.parse(raw) as Partial<TamagotchiState>;
            const nextState: TamagotchiState = {
                ...makeInitialState(),
                ...parsed,
            };
            nextState.hunger = clamp(nextState.hunger, 0, MAX_HUNGER);
            nextState.happiness = clamp(nextState.happiness, 0, MAX_HAPPINESS);
            nextState.poop = clamp(nextState.poop, 0, MAX_POOP);
            nextState.health = clamp(nextState.health, MIN_HEALTH, MAX_HEALTH);
            nextState.petName = sanitizeName(nextState.petName ?? '');
            nextState.eggVariant = nextState.eggVariant === 'egg2' ? 'egg2' : 'egg1';
            nextState.requiresEggSelection =
                typeof parsed.requiresEggSelection === 'boolean'
                    ? parsed.requiresEggSelection
                    : false;
            nextState.isAlive = true;
            nextState.stage = resolveStage(nextState.ageMinutes);
            return nextState;
        } catch {
            return makeInitialState();
        }
    }

    private persist(): void {
        void BridgeStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    }
}
