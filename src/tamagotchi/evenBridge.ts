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

export type EvenInputEvent =
    | 'scroll_top'
    | 'scroll_bottom'
    | 'click'
    | 'double_click'
    | 'egg_next'
    | 'egg_confirm';
// Bridge types for better alignment
type DebugLogger = (message: string) => void;
type BridgeUiMode = 'default' | 'egg_selection';

type LayoutAttempt = {
    name: string;
    payload: {
        containerTotalNum: number;
        textObject?: TextContainerProperty[];
        listObject?: ListContainerProperty[];
        imageObject?: ImageContainerProperty[];
    };
    hasImage: boolean;
    hasBarsImage: boolean;
};

const ACTIONS: MenuScreen[] = ['feed', 'play', 'clean'];

const CLICK_EVENTS = new Set<any>([
    OsEventTypeList.CLICK_EVENT,
    'CLICK_EVENT',
    'CLICK',
    0,
]);

const SCROLL_TOP_EVENTS = new Set<any>([
    OsEventTypeList.SCROLL_TOP_EVENT,
    'SCROLL_TOP_EVENT',
    'SCROLL_TOP',
    1,
]);

const SCROLL_BOTTOM_EVENTS = new Set<any>([
    OsEventTypeList.SCROLL_BOTTOM_EVENT,
    'SCROLL_BOTTOM_EVENT',
    'SCROLL_BOTTOM',
    2,
]);

const DOUBLE_CLICK_EVENTS = new Set<any>([
    OsEventTypeList.DOUBLE_CLICK_EVENT,
    'DOUBLE_CLICK_EVENT',
    'DOUBLE_CLICK',
    3,
]);

const parseEventType = (event: any): string | number | undefined =>
    event?.sysEvent?.eventType ??
    event?.listEvent?.eventType ??
    event?.textEvent?.eventType ??
    event?.jsonData?.sysEvent?.eventType ??
    event?.jsonData?.listEvent?.eventType ??
    event?.jsonData?.textEvent?.eventType;

const normalizeActionByIndex = (rawIndex: unknown): MenuScreen | null => {
    const n = typeof rawIndex === 'number' ? rawIndex : Number(rawIndex);
    if (!Number.isFinite(n)) return null;
    const idx = Math.max(0, Math.min(ACTIONS.length - 1, n));
    return ACTIONS[idx] ?? null;
};

const normalizeActionByName = (rawName: unknown): MenuScreen | null => {
    if (typeof rawName !== 'string') return null;
    const normalized = rawName.toUpperCase();
    if (normalized.includes('FEED')) return 'feed';
    if (normalized.includes('PLAY')) return 'play';
    if (normalized.includes('CLEAN')) return 'clean';
    return null;
};

const resolveListIndex = (event: any): number | undefined => {
    const fromList = event?.listEvent?.currentSelectItemIndex;
    const fromJsonList = event?.jsonData?.listEvent?.currentSelectItemIndex;
    const fromJsonRoot = event?.jsonData?.currentSelectItemIndex;
    // Padrão do clock: em evento de lista válido, índice ausente => 0
    if (event?.listEvent !== undefined && (fromList === undefined || fromList === null)) return 0;
    if (event?.jsonData?.listEvent !== undefined && (fromJsonList === undefined || fromJsonList === null)) return 0;
    const candidate = fromList ?? fromJsonList ?? fromJsonRoot;
    if (candidate === undefined || candidate === null) return undefined;
    const n = typeof candidate === 'number' ? candidate : Number(candidate);
    return Number.isFinite(n) ? n : undefined;
};

const resolveListName = (event: any): string | undefined => {
    return (
        event?.listEvent?.currentSelectItemName ??
        event?.jsonData?.listEvent?.currentSelectItemName ??
        event?.jsonData?.currentSelectItemName
    );
};

const isActionsListEvent = (event: any): boolean => {
    const byListName =
        event?.listEvent?.containerName === 'actionsList' ||
        event?.jsonData?.listEvent?.containerName === 'actionsList';
    const byContainerName = event?.jsonData?.containerName === 'actionsList';
    const byContainerId =
        event?.listEvent?.containerID === 3 ||
        event?.jsonData?.listEvent?.containerID === 3 ||
        event?.jsonData?.containerID === 3;
    return Boolean(byListName || byContainerName || byContainerId);
};

export class EvenTamagotchiBridge {
    private bridge: EvenAppBridge | null = null;
    private pageCreated = false;
    private hasImageContainer = false;
    private hasBarsImageContainer = false;
    private unsubscribeEvents: (() => void) | null = null;
    private debugLog: DebugLogger = () => {};
    private imageUpdateQueue: Promise<boolean> = Promise.resolve(true);
    private uiMode: BridgeUiMode = 'default';

    private selectedAction: MenuScreen = 'feed';
    private actionLabels: [string, string, string] = ['FEED', 'PLAY', 'CLEAN'];
    private textPushCount = 0;
    private imagePushCount = 0;
    private lastExecuteAt = 0;
    private lastExecuteAction: MenuScreen | null = null;

    private log(message: string): void {
        const line = `[Bridge] ${message}`;
        this.debugLog(line);
        console.log(line);
    }

    private buildLayoutAttempts(): LayoutAttempt[] {
        if (this.uiMode === 'egg_selection') {
            const textBase = {
                containerID: 2,
                containerName: 'statsText',
                xPosition: 192,
                yPosition: 154,
                width: 220,
                height: 28,
                content: 'CHOOSE EGG',
            } as const;

            const listBase = {
                containerID: 3,
                containerName: 'actionsList',
                xPosition: 198,
                yPosition: 198,
                width: 180,
                height: 74,
                itemContainer: new ListItemContainerProperty({
                    itemCount: 2,
                    itemWidth: 180,
                    itemName: ['NEXT', 'OK'],
                    isItemSelectBorderEn: 1,
                }),
            } as const;

            const image = new ImageContainerProperty({
                containerID: 1,
                containerName: 'petImg',
                xPosition: 197,
                yPosition: 40,
                width: 182,
                height: 91,
            });

            return [
                {
                    name: 'egg-selection',
                    hasImage: true,
                    hasBarsImage: false,
                    payload: {
                        containerTotalNum: 3,
                        textObject: [new TextContainerProperty({ ...textBase, isEventCapture: 0 })],
                        listObject: [new ListContainerProperty({ ...listBase, isEventCapture: 1 })],
                        imageObject: [image],
                    },
                },
            ];
        }

        const textBase = {
            containerID: 2,
            containerName: 'statsText',
            xPosition: 306,
            yPosition: 126,
            width: 250,
            height: 110,
            content:
                'NAME: G2 PET\n' +
                'AGE: 0:00:00\n' +
                'STATUS: GOOD',
        } as const;

        const listBase = {
            containerID: 3,
            containerName: 'actionsList',
            xPosition: 24,
            yPosition: 104,
            width: 180,
            height: 150,
            itemContainer: new ListItemContainerProperty({
                itemCount: 3,
                itemWidth: 180,
                itemName: [...this.actionLabels],
                isItemSelectBorderEn: 1,
            }),
        } as const;

        const image = new ImageContainerProperty({
            containerID: 1,
            containerName: 'petImg',
            xPosition: 30,
            yPosition: 10,
            width: 182,
            height: 91,
        });

        const lifeBarImage = new ImageContainerProperty({
            containerID: 4,
            containerName: 'lifeBarImg',
            xPosition: 306,
            yPosition: 22,
            width: 132,
            height: 100,
        });

        return [
            {
                name: 'full(list-capture)',
                hasImage: true,
                hasBarsImage: true,
                payload: {
                    containerTotalNum: 4,
                    textObject: [new TextContainerProperty({ ...textBase, isEventCapture: 0 })],
                    listObject: [new ListContainerProperty({ ...listBase, isEventCapture: 1 })],
                    imageObject: [image, lifeBarImage],
                },
            },
            {
                name: 'full(text-capture)',
                hasImage: true,
                hasBarsImage: true,
                payload: {
                    containerTotalNum: 4,
                    textObject: [new TextContainerProperty({ ...textBase, isEventCapture: 1 })],
                    listObject: [new ListContainerProperty({ ...listBase, isEventCapture: 0 })],
                    imageObject: [image, lifeBarImage],
                },
            },
            {
                name: 'fallback(text+list)',
                hasImage: false,
                hasBarsImage: false,
                payload: {
                    containerTotalNum: 2,
                    textObject: [new TextContainerProperty({ ...textBase, isEventCapture: 0 })],
                    listObject: [new ListContainerProperty({ ...listBase, isEventCapture: 1 })],
                },
            },
            {
                name: 'fallback(text+image)',
                hasImage: true,
                hasBarsImage: true,
                payload: {
                    containerTotalNum: 3,
                    textObject: [new TextContainerProperty({ ...textBase, isEventCapture: 1 })],
                    imageObject: [image, lifeBarImage],
                },
            },
            {
                name: 'fallback(text-only)',
                hasImage: false,
                hasBarsImage: false,
                payload: {
                    containerTotalNum: 1,
                    textObject: [new TextContainerProperty({ ...textBase, isEventCapture: 1 })],
                },
            },
        ];
    }

    private async tryCreateLayout(attempt: LayoutAttempt): Promise<boolean> {
        if (!this.bridge) return false;
        this.log(`createStartUpPageContainer called (${attempt.name})`);
        const createResult = await this.bridge.createStartUpPageContainer(
            new CreateStartUpPageContainer(attempt.payload),
        );
        this.log(`createStartUpPageContainer result=${String(createResult)} (${attempt.name})`);
        if (createResult === 0) {
            this.hasImageContainer = attempt.hasImage;
            this.hasBarsImageContainer = attempt.hasBarsImage;
            return true;
        }

        this.log(`trying rebuildPageContainer fallback (${attempt.name})`);
        const rebuildOk = await this.bridge.rebuildPageContainer(
            new RebuildPageContainer(attempt.payload),
        );
        this.log(`rebuildPageContainer result=${String(rebuildOk)} (${attempt.name})`);
        if (rebuildOk) {
            this.hasImageContainer = attempt.hasImage;
            this.hasBarsImageContainer = attempt.hasBarsImage;
            return true;
        }
        return false;
    }

    async init(
        onInput: (event: EvenInputEvent) => void,
        onActionFocus?: (screen: MenuScreen) => void,
        onActionExecute?: (screen: MenuScreen) => void,
        onDebugLog?: DebugLogger,
        initialMode: BridgeUiMode = 'default',
    ): Promise<boolean> {
        this.debugLog = onDebugLog ?? (() => {});
        this.pageCreated = false;
        this.hasImageContainer = false;
        this.hasBarsImageContainer = false;
        this.uiMode = initialMode;

        try {
            this.log('init started');
            const bridgePromise = waitForEvenAppBridge();
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('waitForEvenAppBridge timeout (8s)')), 8000);
            });
            this.bridge = await Promise.race([bridgePromise, timeoutPromise]);
            this.log('waitForEvenAppBridge resolved');

            try {
                const device = await this.bridge.getDeviceInfo();
                this.log(
                    `device: model=${device?.model ?? 'unknown'} sn=${device?.sn ?? 'n/a'} status=${device?.status ?? 'n/a'}`,
                );
                
                const user = await this.bridge.getUserInfo();
                if (user) {
                    this.log(`user: name=${user.name} country=${user.country}`);
                }
            } catch (err) {
                this.log(`getInfo failed: ${(err as Error).message}`);
            }

            for (const attempt of this.buildLayoutAttempts()) {
                const ok = await this.tryCreateLayout(attempt);
                if (ok) {
                    this.pageCreated = true;
                    break;
                }
            }

            if (!this.pageCreated) {
                this.log('page creation failed; no containers active');
                return false;
            }

            this.log(`layout active: hasImageContainer=${this.hasImageContainer}`);

            this.unsubscribeEvents = this.bridge.onEvenHubEvent((event: any) => {
                const executeActionSafe = (action: MenuScreen, reason: string): void => {
                    const now = Date.now();
                    if (this.lastExecuteAction === action && now - this.lastExecuteAt < 300) {
                        this.log(`execute skipped (dedupe) action=${action} reason=${reason}`);
                        return;
                    }
                    this.lastExecuteAction = action;
                    this.lastExecuteAt = now;
                    onActionExecute?.(action);
                };

                const idx = resolveListIndex(event);
                const selectedName = resolveListName(event);
                const actionByIndex = normalizeActionByIndex(idx);
                const actionByName = normalizeActionByName(selectedName);
                const actionFromEvent = actionByIndex ?? actionByName;
                if (actionFromEvent) {
                    this.selectedAction = actionFromEvent;
                    onActionFocus?.(actionFromEvent);
                }

                const eventType = parseEventType(event);
                if (eventType === undefined || eventType === null) {
                    if (this.uiMode === 'egg_selection' && isActionsListEvent(event)) {
                        const selectedIdx = idx ?? 0;
                        this.log(`event: undefined(egg-selection) idx=${selectedIdx}`);
                        onInput(selectedIdx === 0 ? 'egg_next' : 'egg_confirm');
                        return;
                    }
                    // Mesmo padrao do clock: tratar evento de lista sem eventType como interacao valida.
                    // Executa somente quando o payload pertence a lista de acoes.
                    if (isActionsListEvent(event)) {
                        const action = actionFromEvent ?? this.selectedAction;
                        this.log(
                            `event: undefined(list) -> click fallback action=${action} idx=${String(
                                idx,
                            )} name=${String(selectedName)}`,
                        );
                        executeActionSafe(action, 'undefined-list');
                        onInput('click');
                    } else {
                        this.log('event: undefined(non-list) ignored');
                    }
                    return;
                }
                this.log(`event: ${String(eventType)}`);

                if (SCROLL_TOP_EVENTS.has(eventType)) {
                    onInput('scroll_top');
                    return;
                }
                if (SCROLL_BOTTOM_EVENTS.has(eventType)) {
                    onInput('scroll_bottom');
                    return;
                }
                if (CLICK_EVENTS.has(eventType)) {
                    if (this.uiMode === 'egg_selection') {
                        const selectedIdx = idx ?? 0;
                        this.log(`event: click(egg-selection) idx=${selectedIdx}`);
                        onInput(selectedIdx === 0 ? 'egg_next' : 'egg_confirm');
                        return;
                    }
                    const action = actionFromEvent ?? this.selectedAction;
                    executeActionSafe(action, `click-event:${String(eventType)}`);
                    onInput('click');
                    return;
                }
                if (DOUBLE_CLICK_EVENTS.has(eventType)) {
                    // Double click so navega/volta; nao executa acao de menu.
                    onInput('double_click');
                }
            });

            this.log('init completed with active containers');
            return true;
        } catch (err) {
            this.bridge = null;
            this.pageCreated = false;
            this.hasImageContainer = false;
            this.hasBarsImageContainer = false;
            this.log(`init failed: ${(err as Error).message}`);
            return false;
        }
    }

    async setEggSelectionMode(active: boolean): Promise<void> {
        this.uiMode = active ? 'egg_selection' : 'default';
        if (!this.bridge || !this.pageCreated) return;
        const preferred = this.buildLayoutAttempts()[0];
        const ok = await this.bridge.rebuildPageContainer(new RebuildPageContainer(preferred.payload));
        this.log(`setEggSelectionMode rebuild result=${String(ok)} active=${active}`);
        if (ok) {
            this.pageCreated = true;
            this.hasImageContainer = preferred.hasImage;
            this.hasBarsImageContainer = preferred.hasBarsImage;
        }
    }

    async setActionLabels(labels: [string, string, string]): Promise<void> {
        if (!this.bridge || !this.pageCreated) return;
        const normalized: [string, string, string] = [
            (labels[0] || 'FEED').slice(0, 12),
            (labels[1] || 'PLAY').slice(0, 12),
            (labels[2] || 'CLEAN').slice(0, 12),
        ];
        if (
            this.actionLabels[0] === normalized[0] &&
            this.actionLabels[1] === normalized[1] &&
            this.actionLabels[2] === normalized[2]
        ) {
            return;
        }

        this.actionLabels = normalized;
        const preferred = this.buildLayoutAttempts().find((a) => a.name === 'full(list-capture)')
            ?? this.buildLayoutAttempts()[0];
        const ok = await this.bridge.rebuildPageContainer(new RebuildPageContainer(preferred.payload));
        this.log(`setActionLabels rebuild result=${String(ok)} labels=${normalized.join('/')}`);
        if (ok) {
            this.pageCreated = true;
            this.hasImageContainer = preferred.hasImage;
        }
    }

    async pushUiFrame(imageData: number[]): Promise<boolean> {
        if (!this.bridge || !this.pageCreated) {
            this.log(`pushUiFrame skipped: bridge=${Boolean(this.bridge)} pageCreated=${this.pageCreated}`);
            return false;
        }
        if (!this.hasImageContainer) {
            this.log('pushUiFrame skipped: active page has no image container');
            return false;
        }

        const result = await this.enqueueImageUpdate(1, 'petImg', imageData, 'pushUiFrame');
        this.imagePushCount += 1;
        this.log(`pushUiFrame #${this.imagePushCount}: bytes=${imageData.length} result=${String(result)}`);
        return result === 0 || result === true || result === 'success';
    }

    async pushLifeBarFrame(imageData: number[]): Promise<boolean> {
        if (!this.bridge || !this.pageCreated) {
            this.log(`pushLifeBarFrame skipped: bridge=${Boolean(this.bridge)} pageCreated=${this.pageCreated}`);
            return false;
        }
        if (!this.hasImageContainer) {
            this.log('pushLifeBarFrame skipped: active page has no image container');
            return false;
        }
        if (!this.hasBarsImageContainer) {
            this.log('pushLifeBarFrame skipped: active page has no bars image container');
            return false;
        }

        const result = await this.enqueueImageUpdate(4, 'lifeBarImg', imageData, 'pushLifeBarFrame');
        this.log(`pushLifeBarFrame: bytes=${imageData.length} result=${String(result)}`);
        return result === 0 || result === true || result === 'success';
    }

    private async enqueueImageUpdate(
        containerID: number,
        containerName: string,
        imageData: number[],
        source: string,
    ): Promise<unknown> {
        const run = async (): Promise<unknown> => {
            if (!this.bridge) return false;
            const result = await this.bridge.updateImageRawData(
                new ImageRawDataUpdate({
                    containerID,
                    containerName,
                    imageData,
                }),
            );
            this.log(`${source} updateImageRawData container=${containerName} result=${String(result)}`);
            return result;
        };

        const next = this.imageUpdateQueue.then(run, run);
        this.imageUpdateQueue = next.then(
            () => true,
            () => true,
        );
        return next;
    }

    async pushDashboardTexts(
        state: TamagotchiState,
        hint?: string,
        dialogMode = false,
        nowMs = Date.now(),
    ): Promise<void> {
        if (!this.bridge || !this.pageCreated) {
            this.log(`pushDashboardTexts skipped: bridge=${Boolean(this.bridge)} pageCreated=${this.pageCreated}`);
            return;
        }

        const safeName = (state.petName || 'G2 PET').slice(0, 12).toUpperCase();
        const baseSeconds = Math.max(0, state.ageMinutes * 60);
        const liveSeconds = Math.max(0, Math.floor((nowMs - state.lastTickAt) / 1000));
        const totalSeconds = baseSeconds + liveSeconds;
        const ageHours = Math.floor(totalSeconds / 3600);
        const ageMinutes = Math.floor((totalSeconds % 3600) / 60);
        const ageSeconds = totalSeconds % 60;
        const status = !state.isAlive ? 'DEAD' : state.isSick ? 'SICK' : state.health >= 70 ? 'GOOD' : 'OK';
        const safeHint = (hint ?? '').trim();
        const toShortLines = (value: string, maxChars = 24, maxLines = 7): string[] => {
            if (!value) return [];
            const words = value.replace(/\s+/g, ' ').trim().split(' ');
            const lines: string[] = [];
            let current = '';
            for (const word of words) {
                if (!word) continue;
                const candidate = current ? `${current} ${word}` : word;
                if (candidate.length <= maxChars) {
                    current = candidate;
                } else {
                    if (current) lines.push(current);
                    current = word.length > maxChars ? word.slice(0, maxChars) : word;
                    if (lines.length >= maxLines) break;
                }
                if (lines.length >= maxLines) break;
            }
            if (current && lines.length < maxLines) lines.push(current);
            return lines.slice(0, maxLines);
        };

        const content = dialogMode
            ? [
                  'MINIGAME',
                  ...toShortLines(safeHint),
              ].join('\n')
            : `NAME: ${safeName}\n` +
              `AGE: ${ageHours}:${String(ageMinutes).padStart(2, '0')}:${String(ageSeconds).padStart(2, '0')}\n` +
              `STATUS: ${status}` +
              (safeHint ? `\n> ${toShortLines(safeHint, 26, 2).join('\n> ')}` : '');

        const result = await this.bridge.textContainerUpgrade(
            new TextContainerUpgrade({
                containerID: 2,
                containerName: 'statsText',
                content,
            }),
        );

        this.textPushCount += 1;
        if (this.textPushCount <= 3 || this.textPushCount % 10 === 0) {
            this.log(`pushDashboardTexts #${this.textPushCount}: result=${String(result)}`);
        }
    }

    destroy(): void {
        this.log('destroy called');
        this.unsubscribeEvents?.();
        this.unsubscribeEvents = null;

        if (this.bridge) {
            this.bridge
                .shutDownPageContainer(0)
                .then((ok: boolean) => this.log(`shutDownPageContainer result=${String(ok)}`))
                .catch((err: Error) => this.log(`shutDownPageContainer failed: ${err.message}`));
        }
    }
}





