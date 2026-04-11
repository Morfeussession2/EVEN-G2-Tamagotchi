import {
    CreateStartUpPageContainer,
    ImageContainerProperty,
    ImageRawDataUpdate,
    ListContainerProperty,
    ListItemContainerProperty,
    OsEventTypeList,
    RebuildPageContainer,
    TextContainerProperty,
    TextContainerUpgrade,
    waitForEvenAppBridge,
    EvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import type { MenuScreen, TamagotchiState } from './types';

// Eventos enviados para a sua aplicação principal
export type EvenInputEvent =
    | 'scroll_top'
    | 'scroll_bottom'
    | 'click'
    | 'double_click'
    | 'egg_next'
    | 'egg_confirm'
    | 'minigame_select_rps'
    | 'minigame_select_tictactoe'
    | 'minigame_play'
    | 'minigame_back'
    | 'minigame_replay'
    | 'minigame_menu';

type DebugLogger = (message: string) => void;

// Todas as telas do nosso jogo
export type BridgeUiMode = 'default' | 'main_menu' | 'egg_selection' | 'minigame_selection' | 'minigame_start' | 'minigame_choice' | 'minigame_result';

type LayoutAttempt = {
    name: BridgeUiMode;
    payload: any;
    hasImage: boolean;
    hasBarsImage: boolean;
};

// Mapeamentos de ações
const ACTIONS: MenuScreen[] = ['feed', 'play', 'clean'];

// Constantes de Eventos do SDK
const CLICK_EVENTS = new Set<any>([OsEventTypeList.CLICK_EVENT, 'CLICK_EVENT', 'CLICK', 0]);
const SCROLL_TOP_EVENTS = new Set<any>([OsEventTypeList.SCROLL_TOP_EVENT, 'SCROLL_TOP_EVENT', 'SCROLL_TOP', 1]);
const SCROLL_BOTTOM_EVENTS = new Set<any>([OsEventTypeList.SCROLL_BOTTOM_EVENT, 'SCROLL_BOTTOM_EVENT', 'SCROLL_BOTTOM', 2]);
const DOUBLE_CLICK_EVENTS = new Set<any>([OsEventTypeList.DOUBLE_CLICK_EVENT, 'DOUBLE_CLICK_EVENT', 'DOUBLE_CLICK', 3]);

const parseEventType = (event: any): number => {
    const type =
        event?.sysEvent?.eventType ??
        event?.listEvent?.eventType ??
        event?.textEvent?.eventType ??
        event?.jsonData?.sysEvent?.eventType ??
        event?.jsonData?.listEvent?.eventType ??
        event?.jsonData?.textEvent?.eventType;

    if (type === undefined || type === null) return 0;
    return Number(type);
};

const resolveListIndex = (event: any): number | undefined => {
    const candidate =
        event?.currentSelectItemIndex ??
        event?.listEvent?.currentSelectItemIndex ??
        event?.listEvent?.itemIndex ??
        event?.textEvent?.currentSelectItemIndex ??
        event?.jsonData?.currentSelectItemIndex ??
        event?.jsonData?.listEvent?.currentSelectItemIndex ??
        event?.jsonData?.listEvent?.itemIndex ??
        event?.jsonData?.textEvent?.currentSelectItemIndex;

    if (candidate !== undefined && candidate !== null) {
        const n = Number(candidate);
        if (Number.isFinite(n)) return n;
    }

    const isListEvent = event?.listEvent || event?.jsonData?.listEvent;
    if (isListEvent) return 0;

    return undefined;
};

export class EvenTamagotchiBridge {
    private bridge: EvenAppBridge | null = null;
    private pageCreated = false;
    private startupCreated = false;
    private hasImageContainer = false;
    private hasBarsImageContainer = false;
    private unsubscribeEvents: (() => void) | null = null;
    private debugLog: DebugLogger = () => { };
    private imageUpdateQueue: Promise<boolean> = Promise.resolve(true);

    private uiMode: BridgeUiMode = 'main_menu';
    private actionLabels: [string, string, string] = ['FEED', 'PLAY', 'CLEAN'];

    // Controles de foco separados para não misturar índices ao trocar de tela
    private selectedMainIndex = 0;
    private selectedEggIndex = 0;
    private selectedMinigameSelectionIndex = 0;
    private selectedMinigameStartIndex = 0;
    private selectedMinigameChoiceIndex = 0;
    private selectedMinigameResultIndex = 0;

    private lastExecuteAt = 0;
    private lastExecuteAction: string | null = null;

    private resetAllFocus(): void {
        this.selectedMainIndex = 0;
        this.selectedEggIndex = 0;
        this.selectedMinigameSelectionIndex = 0;
        this.selectedMinigameStartIndex = 0;
        this.selectedMinigameChoiceIndex = 0;
        this.selectedMinigameResultIndex = 0;
    }

    private log(message: string): void {
        const line = `[Bridge] ${message}`;
        this.debugLog(line);
        console.log(line);
    }

    // ========================================================================
    // 🎨 CONSTRUTORES DE LAYOUT (Sempre 4 containers para Rebuild seguro)
    // IDs: 1=ImgPet, 2=Texto, 3=Lista, 4=ImgBarra
    // ========================================================================

    private getLayout(mode: BridgeUiMode): LayoutAttempt {
        switch (mode) {
            case 'egg_selection':
                return {
                    name: 'egg_selection', hasImage: true, hasBarsImage: false,
                    payload: {
                        containerTotalNum: 3,
                        textObject: [new TextContainerProperty({ containerID: 2, containerName: 'statsText', xPosition: 300, yPosition: 154, width: 220, height: 28, content: 'CHOOSE EGG', isEventCapture: 0 })],
                        listObject: [new ListContainerProperty({ containerID: 3, containerName: 'actionsList', xPosition: 250, yPosition: 190, width: 180, height: 75, isEventCapture: 1, itemContainer: new ListItemContainerProperty({ itemCount: 2, itemWidth: 0, itemName: ['NEXT', 'OK'], isItemSelectBorderEn: 1 }) })],
                        imageObject: [new ImageContainerProperty({ containerID: 1, containerName: 'petImg', xPosition: 197, yPosition: 40, width: 182, height: 91 })]
                    }
                };

            case 'minigame_selection':
                return {
                    name: 'minigame_selection', hasImage: true, hasBarsImage: false,
                    payload: {
                        containerTotalNum: 3,
                        textObject: [new TextContainerProperty({ containerID: 2, containerName: 'statsText', xPosition: 300, yPosition: 22, width: 250, height: 110, content: 'CHOOSE GAME', isEventCapture: 0 })],
                        listObject: [new ListContainerProperty({ containerID: 3, containerName: 'actionsList', xPosition: 65, yPosition: 100, width: 180, height: 150, isEventCapture: 1, itemContainer: new ListItemContainerProperty({ itemCount: 2, itemWidth: 0, itemName: ['JOKENPO', 'TIC TAC TOE'], isItemSelectBorderEn: 1 }) })],
                        imageObject: [new ImageContainerProperty({ containerID: 1, containerName: 'petImg', xPosition: 30, yPosition: 10, width: 182, height: 91 })]
                    }
                };

            case 'minigame_start':
                return {
                    name: 'minigame_start', hasImage: true, hasBarsImage: false,
                    payload: {
                        containerTotalNum: 3,
                        textObject: [new TextContainerProperty({ containerID: 2, containerName: 'statsText', xPosition: 300, yPosition: 22, width: 250, height: 110, content: 'READY?', isEventCapture: 0 })],
                        listObject: [new ListContainerProperty({ containerID: 3, containerName: 'actionsList', xPosition: 65, yPosition: 100, width: 180, height: 100, isEventCapture: 1, itemContainer: new ListItemContainerProperty({ itemCount: 2, itemWidth: 0, itemName: ['START', 'BACK'], isItemSelectBorderEn: 1 }) })],
                        imageObject: [new ImageContainerProperty({ containerID: 1, containerName: 'petImg', xPosition: 30, yPosition: 10, width: 182, height: 91 })]
                    }
                };

            case 'minigame_choice':
                return {
                    name: 'minigame_choice', hasImage: true, hasBarsImage: false,
                    payload: {
                        containerTotalNum: 3,
                        textObject: [new TextContainerProperty({ containerID: 2, containerName: 'statsText', xPosition: 300, yPosition: 22, width: 250, height: 110, content: 'CHOOSE', isEventCapture: 0 })],
                        listObject: [new ListContainerProperty({ containerID: 3, containerName: 'actionsList', xPosition: 65, yPosition: 100, width: 180, height: 150, isEventCapture: 1, itemContainer: new ListItemContainerProperty({ itemCount: 3, itemWidth: 0, itemName: ['ROCK', 'PAPER', 'SCISSORS'], isItemSelectBorderEn: 1 }) })],
                        imageObject: [new ImageContainerProperty({ containerID: 1, containerName: 'petImg', xPosition: 30, yPosition: 10, width: 182, height: 91 })]
                    }
                };

            case 'minigame_result':
                return {
                    name: 'minigame_result', hasImage: true, hasBarsImage: false,
                    payload: {
                        containerTotalNum: 3,
                        textObject: [new TextContainerProperty({ containerID: 2, containerName: 'statsText', xPosition: 300, yPosition: 22, width: 250, height: 110, content: 'RESULT', isEventCapture: 0 })],
                        listObject: [new ListContainerProperty({ containerID: 3, containerName: 'actionsList', xPosition: 65, yPosition: 100, width: 180, height: 100, isEventCapture: 1, itemContainer: new ListItemContainerProperty({ itemCount: 2, itemWidth: 0, itemName: ['PLAY AGAIN', 'MENU'], isItemSelectBorderEn: 1 }) })],
                        imageObject: [new ImageContainerProperty({ containerID: 1, containerName: 'petImg', xPosition: 30, yPosition: 10, width: 182, height: 91 })]
                    }
                };

            case 'main_menu':
            case 'default':
            default:
                return {
                    name: 'main_menu', hasImage: true, hasBarsImage: true,
                    payload: {
                        containerTotalNum: 4,
                        textObject: [new TextContainerProperty({ containerID: 2, containerName: 'statsText', xPosition: 300, yPosition: 126, width: 250, height: 110, content: 'NAME: G2 PET\nAGE: 0:00:00\nSTATUS: GOOD', isEventCapture: 0 })],
                        listObject: [new ListContainerProperty({ containerID: 3, containerName: 'actionsList', xPosition: 65, yPosition: 100, width: 180, height: 150, isEventCapture: 1, itemContainer: new ListItemContainerProperty({ itemCount: 3, itemWidth: 0, itemName: this.actionLabels, isItemSelectBorderEn: 1 }) })],
                        imageObject: [
                            new ImageContainerProperty({ containerID: 1, containerName: 'petImg', xPosition: 10, yPosition: 10, width: 182, height: 91 }),
                            new ImageContainerProperty({ containerID: 4, containerName: 'lifeBarImg', xPosition: 300, yPosition: 20, width: 132, height: 100 })
                        ]
                    }
                };
        }
    }

    // ========================================================================
    // ⚙️ GESTÃO DE LAYOUTS E TRANSIÇÕES
    // ========================================================================

    private async buildLayout(attempt: LayoutAttempt): Promise<boolean> {
        if (!this.bridge) return false;

        try {
            if (!this.startupCreated) {
                this.log(`Executando StartUp: ${attempt.name}`);
                const startUpParam = new CreateStartUpPageContainer(attempt.payload);
                const createResult = await this.bridge.createStartUpPageContainer(startUpParam);

                if (createResult === 0 || createResult === true) {
                    this.startupCreated = true;
                    this.hasImageContainer = attempt.hasImage;
                    this.hasBarsImageContainer = attempt.hasBarsImage;
                    return true;
                }
            }

            this.log(`Executando Rebuild: ${attempt.name}`);
            const rebuildParam = new RebuildPageContainer(attempt.payload);
            const rebuildResult = await this.bridge.rebuildPageContainer(rebuildParam);

            if (rebuildResult === 0 || rebuildResult === true) {
                this.hasImageContainer = attempt.hasImage;
                this.hasBarsImageContainer = attempt.hasBarsImage;
                return true;
            }
        } catch (e) {
            this.log(`Falha no Layout: ${e}`);
        }
        return false;
    }

    async setUiMode(mode: BridgeUiMode): Promise<boolean> {
        this.uiMode = mode;
        this.resetAllFocus();
        if (!this.bridge || !this.pageCreated) return false;

        const attempt = this.getLayout(mode);
        const ok = await this.buildLayout(attempt);
        this.log(`Mudança para tela '${mode}' resultou em: ${ok}`);

        // Retornamos true se sucesso. O seu App DEVE chamar pushUiFrame e pushDashboardTexts logo a seguir!
        return ok;
    }

    // ========================================================================
    // 🚀 INICIALIZAÇÃO E EVENTOS
    // ========================================================================

    async init(
        onInput: (event: EvenInputEvent) => void,
        onActionFocus?: (screen: MenuScreen | string) => void,
        onActionExecute?: (screen: MenuScreen | string) => void,
        onDebugLog?: DebugLogger,
        initialMode: BridgeUiMode = 'main_menu',
    ): Promise<boolean> {
        this.debugLog = onDebugLog ?? (() => { });
        this.pageCreated = false;
        this.uiMode = initialMode;
        this.resetAllFocus();

        try {
            this.log('Conectando aos óculos...');
            const bridgePromise = waitForEvenAppBridge();
            const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000));
            this.bridge = await Promise.race([bridgePromise, timeoutPromise]);

            // Pausa vital para inicialização a frio do BLE
            await new Promise(resolve => setTimeout(resolve, 800));

            const attempt = this.getLayout(this.uiMode);
            this.pageCreated = await this.buildLayout(attempt);

            if (!this.pageCreated) return false;

            this.unsubscribeEvents = this.bridge.onEvenHubEvent((event: any) => {
                const eventType = parseEventType(event);
                const isClick = CLICK_EVENTS.has(eventType);
                const isScrollTop = SCROLL_TOP_EVENTS.has(eventType);
                const isScrollBottom = SCROLL_BOTTOM_EVENTS.has(eventType);
                const isDouble = DOUBLE_CLICK_EVENTS.has(eventType);
                const idx = resolveListIndex(event);

                const executeSafe = (action: string, context: string) => {
                    const now = Date.now();
                    if (this.lastExecuteAction === action && now - this.lastExecuteAt < 300) return;
                    this.lastExecuteAction = action;
                    this.lastExecuteAt = now;
                    this.log(`Click [${action}] em [${context}]`);
                    onActionExecute?.(action);
                };

                // 1. ATUALIZAÇÃO DO ÍNDICE FOCADO
                if (idx !== undefined) {
                    if (this.uiMode === 'main_menu' || this.uiMode === 'default') {
                        this.selectedMainIndex = Math.max(0, Math.min(2, idx));
                        onActionFocus?.(ACTIONS[this.selectedMainIndex]);
                    } else if (this.uiMode === 'egg_selection') {
                        this.selectedEggIndex = Math.max(0, Math.min(1, idx));
                    } else if (this.uiMode === 'minigame_selection') {
                        this.selectedMinigameSelectionIndex = Math.max(0, Math.min(1, idx));
                    } else if (this.uiMode === 'minigame_start') {
                        this.selectedMinigameStartIndex = Math.max(0, Math.min(1, idx));
                    } else if (this.uiMode === 'minigame_choice') {
                        this.selectedMinigameChoiceIndex = Math.max(0, Math.min(2, idx));
                    } else if (this.uiMode === 'minigame_result') {
                        this.selectedMinigameResultIndex = Math.max(0, Math.min(1, idx));
                    }
                }

                // 2. AÇÕES DE CLIQUE
                if (isClick) {
                    if (this.uiMode === 'main_menu' || this.uiMode === 'default') {
                        executeSafe(ACTIONS[this.selectedMainIndex], 'main_menu');
                    } else if (this.uiMode === 'egg_selection') {
                        onInput(this.selectedEggIndex === 0 ? 'egg_next' : 'egg_confirm');
                    } else if (this.uiMode === 'minigame_selection') {
                        onInput(this.selectedMinigameSelectionIndex === 0 ? 'minigame_select_rps' : 'minigame_select_tictactoe');
                    } else if (this.uiMode === 'minigame_start') {
                        onInput(this.selectedMinigameStartIndex === 0 ? 'minigame_play' : 'minigame_back');
                    } else if (this.uiMode === 'minigame_choice') {
                        const moves = ['rock', 'paper', 'scissors'];
                        executeSafe(moves[this.selectedMinigameChoiceIndex], 'minigame_choice');
                    } else if (this.uiMode === 'minigame_result') {
                        onInput(this.selectedMinigameResultIndex === 0 ? 'minigame_replay' : 'minigame_menu');
                    }

                    if (this.uiMode !== 'minigame_choice') {
                        onInput('click');
                    }
                    return;
                }

                // 3. NAVEGAÇÃO SCROLL CIMA
                if (isScrollTop) {
                    if (this.uiMode === 'main_menu' || this.uiMode === 'default') {
                        this.selectedMainIndex = (this.selectedMainIndex - 1 + 3) % 3;
                        onActionFocus?.(ACTIONS[this.selectedMainIndex]);
                    } else if (this.uiMode === 'egg_selection') {
                        this.selectedEggIndex = Math.max(0, this.selectedEggIndex - 1);
                    } else if (this.uiMode === 'minigame_selection') {
                        this.selectedMinigameSelectionIndex = (this.selectedMinigameSelectionIndex - 1 + 2) % 2;
                    } else if (this.uiMode === 'minigame_start') {
                        this.selectedMinigameStartIndex = Math.max(0, this.selectedMinigameStartIndex - 1);
                    } else if (this.uiMode === 'minigame_choice') {
                        this.selectedMinigameChoiceIndex = (this.selectedMinigameChoiceIndex - 1 + 3) % 3;
                    } else if (this.uiMode === 'minigame_result') {
                        this.selectedMinigameResultIndex = Math.max(0, this.selectedMinigameResultIndex - 1);
                    }
                    onInput('scroll_top');
                    return;
                }

                // 4. NAVEGAÇÃO SCROLL BAIXO
                if (isScrollBottom) {
                    if (this.uiMode === 'main_menu' || this.uiMode === 'default') {
                        this.selectedMainIndex = (this.selectedMainIndex + 1) % 3;
                        onActionFocus?.(ACTIONS[this.selectedMainIndex]);
                    } else if (this.uiMode === 'egg_selection') {
                        this.selectedEggIndex = Math.min(1, this.selectedEggIndex + 1);
                    } else if (this.uiMode === 'minigame_selection') {
                        this.selectedMinigameSelectionIndex = (this.selectedMinigameSelectionIndex + 1) % 2;
                    } else if (this.uiMode === 'minigame_start') {
                        this.selectedMinigameStartIndex = Math.min(1, this.selectedMinigameStartIndex + 1);
                    } else if (this.uiMode === 'minigame_choice') {
                        this.selectedMinigameChoiceIndex = (this.selectedMinigameChoiceIndex + 1) % 3;
                    } else if (this.uiMode === 'minigame_result') {
                        this.selectedMinigameResultIndex = Math.min(1, this.selectedMinigameResultIndex + 1);
                    }
                    onInput('scroll_bottom');
                    return;
                }

                if (isDouble) onInput('double_click');
            });

            return true;
        } catch (err) {
            this.bridge = null;
            return false;
        }
    }

    async setActionLabels(labels: [string, string, string]): Promise<void> {
        if (!this.bridge || !this.pageCreated) return;
        this.actionLabels = [
            (labels[0] || 'FEED').slice(0, 12),
            (labels[1] || 'PLAY').slice(0, 12),
            (labels[2] || 'CLEAN').slice(0, 12),
        ];

        if (this.uiMode === 'main_menu' || this.uiMode === 'default') {
            const attempt = this.getLayout('main_menu');
            await this.buildLayout(attempt);
        }
    }

    // ========================================================================
    // 🖼️ ATUALIZAÇÕES VISUAIS
    // ========================================================================

    private async enqueueImageUpdate(containerID: number, containerName: string, imageData: number[] | Uint8Array): Promise<boolean> {
        const run = async (): Promise<boolean> => {
            if (!this.bridge) return false;
            try {
                const safeImageArray = Array.isArray(imageData) ? imageData : Array.from(imageData);
                const req = new ImageRawDataUpdate({ containerID, containerName, imageData: safeImageArray });
                await this.bridge.updateImageRawData(req as any);
                await new Promise(resolve => setTimeout(resolve, 150)); // Proteção Bluetooth vital
                return true;
            } catch { return false; }
        };
        const next = this.imageUpdateQueue.then(run, run);
        this.imageUpdateQueue = next.then(() => true, () => true);
        return next as any;
    }

    async pushUiFrame(imageData: number[] | Uint8Array): Promise<boolean> {
        if (!this.bridge || !this.pageCreated || !this.hasImageContainer) return false;
        return this.enqueueImageUpdate(1, 'petImg', imageData);
    }

    pushLifeBarFrame(imageData: number[] | Uint8Array): Promise<boolean> {
        if (!this.bridge || !this.pageCreated || !this.hasBarsImageContainer) return Promise.resolve(false);
        return this.enqueueImageUpdate(4, 'lifeBarImg', imageData);
    }

    hasBarsImage(): boolean {
        return this.hasBarsImageContainer;
    }

    hasPetImage(): boolean {
        return this.hasImageContainer;
    }

    async pushDashboardTexts(state: TamagotchiState, textOverwrite?: string): Promise<void> {
        if (!this.bridge || !this.pageCreated) return;

        let content = textOverwrite;
        if (!content) {
            const nowMs = Date.now();
            const elapsedSecs = Math.floor((nowMs - (state.lastTickAt ?? nowMs)) / 1000);
            const totalSeconds = (state.ageMinutes ?? 0) * 60 + Math.max(0, elapsedSecs);

            const h = Math.floor(totalSeconds / 3600);
            const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
            const s = String(totalSeconds % 60).padStart(2, '0');

            const status = !state.isAlive ? 'DEAD' : state.isSick ? 'SICK' : state.health >= 70 ? 'GOOD' : 'OK';
            content = `NAME: G2 PET\nAGE: ${h}:${m}:${s}\nSTATUS: ${status}`;
        }

        await this.bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: 2, containerName: 'statsText', content }) as any);
    }

    destroy(): void {
        this.unsubscribeEvents?.();
        this.unsubscribeEvents = null;
        this.bridge?.shutDownPageContainer(0).catch(() => { });
    }
}