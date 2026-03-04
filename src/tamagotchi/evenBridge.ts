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
} from '@evenrealities/even_hub_sdk';
import type { MenuScreen, TamagotchiState } from './types';

export type EvenInputEvent = 'scroll_top' | 'scroll_bottom' | 'click' | 'double_click';
type AnyBridge = Awaited<ReturnType<typeof waitForEvenAppBridge>>;
type DebugLogger = (message: string) => void;

type LayoutAttempt = {
    name: string;
    payload: {
        containerTotalNum: number;
        textObject?: TextContainerProperty[];
        listObject?: ListContainerProperty[];
        imageObject?: ImageContainerProperty[];
    };
    hasImage: boolean;
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
    private bridge: AnyBridge | null = null;
    private pageCreated = false;
    private hasImageContainer = false;
    private unsubscribeEvents: (() => void) | null = null;
    private debugLog: DebugLogger = () => {};

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
        const textBase = {
            containerID: 2,
            containerName: 'statsText',
            xPosition: 306,
            yPosition: 22,
            width: 250,
            height: 238,
            content:
                'Hunger: ▒▒▒▒\n' +
                'Happy: ▒▒▒▒\n' +
                'Poop: ▒▒▒\n\n' +
                'NAME: G2 PET\n' +
                'AGE: 0:00:00\n' +
                'STATUS: GOOD\n' +
                'LIFE: ████',
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

        return [
            {
                name: 'full(list-capture)',
                hasImage: true,
                payload: {
                    containerTotalNum: 3,
                    textObject: [new TextContainerProperty({ ...textBase, isEventCapture: 0 })],
                    listObject: [new ListContainerProperty({ ...listBase, isEventCapture: 1 })],
                    imageObject: [image],
                },
            },
            {
                name: 'full(text-capture)',
                hasImage: true,
                payload: {
                    containerTotalNum: 3,
                    textObject: [new TextContainerProperty({ ...textBase, isEventCapture: 1 })],
                    listObject: [new ListContainerProperty({ ...listBase, isEventCapture: 0 })],
                    imageObject: [image],
                },
            },
            {
                name: 'fallback(text+list)',
                hasImage: false,
                payload: {
                    containerTotalNum: 2,
                    textObject: [new TextContainerProperty({ ...textBase, isEventCapture: 0 })],
                    listObject: [new ListContainerProperty({ ...listBase, isEventCapture: 1 })],
                },
            },
            {
                name: 'fallback(text+image)',
                hasImage: true,
                payload: {
                    containerTotalNum: 2,
                    textObject: [new TextContainerProperty({ ...textBase, isEventCapture: 1 })],
                    imageObject: [image],
                },
            },
            {
                name: 'fallback(text-only)',
                hasImage: false,
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
            return true;
        }

        this.log(`trying rebuildPageContainer fallback (${attempt.name})`);
        const rebuildOk = await this.bridge.rebuildPageContainer(
            new RebuildPageContainer(attempt.payload),
        );
        this.log(`rebuildPageContainer result=${String(rebuildOk)} (${attempt.name})`);
        if (rebuildOk) {
            this.hasImageContainer = attempt.hasImage;
            return true;
        }
        return false;
    }

    async init(
        onInput: (event: EvenInputEvent) => void,
        onActionFocus?: (screen: MenuScreen) => void,
        onActionExecute?: (screen: MenuScreen) => void,
        onDebugLog?: DebugLogger,
    ): Promise<boolean> {
        this.debugLog = onDebugLog ?? (() => {});
        this.pageCreated = false;
        this.hasImageContainer = false;

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
                    `device: model=${device?.model ?? 'unknown'} connected=${
                        device?.status?.isConnected?.() ?? 'n/a'
                    } battery=${device?.status?.batteryLevel ?? 'n/a'}`,
                );
            } catch (err) {
                this.log(`getDeviceInfo failed: ${(err as Error).message}`);
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
            this.log(`init failed: ${(err as Error).message}`);
            return false;
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

        const result = await this.bridge.updateImageRawData(
            new ImageRawDataUpdate({
                containerID: 1,
                containerName: 'petImg',
                imageData,
            }),
        );
        this.imagePushCount += 1;
        this.log(`pushUiFrame #${this.imagePushCount}: bytes=${imageData.length} result=${String(result)}`);
        return result === 0 || result === true || result === 'success';
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

        const bar = (value: number, max: number): string =>
            `${'█'.repeat(value)}${'▒'.repeat(max - value)}`;
        const safeName = (state.petName || 'G2 PET').slice(0, 12).toUpperCase();
        const baseSeconds = Math.max(0, state.ageMinutes * 60);
        const liveSeconds = Math.max(0, Math.floor((nowMs - state.lastTickAt) / 1000));
        const totalSeconds = baseSeconds + liveSeconds;
        const ageHours = Math.floor(totalSeconds / 3600);
        const ageMinutes = Math.floor((totalSeconds % 3600) / 60);
        const ageSeconds = totalSeconds % 60;
        const status = !state.isAlive ? 'DEAD' : state.isSick ? 'SICK' : state.health >= 70 ? 'GOOD' : 'OK';
        const lifeUnits = Math.max(0, Math.min(4, Math.round(state.health / 25)));
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
            : `Hunger: ${bar(state.hunger, 4)}\n` +
              `Happy: ${bar(state.happiness, 4)}\n` +
              `Poop: ${bar(state.poop, 3)}\n\n` +
              `NAME: ${safeName}\n` +
              `AGE: ${ageHours}:${String(ageMinutes).padStart(2, '0')}:${String(ageSeconds).padStart(2, '0')}\n` +
              `STATUS: ${status}\n` +
              `LIFE: ${bar(lifeUnits, 4)}` +
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





