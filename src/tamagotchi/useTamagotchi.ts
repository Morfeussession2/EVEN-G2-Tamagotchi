import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildAsciiFrame } from './asciiPresenter';
import { TamagotchiEngine } from './engine';
import { EvenTamagotchiBridge, type EvenInputEvent } from './evenBridge';
import { convertImageToGrayscalePng } from './imageUtils';
import { renderLifeBarPng } from './lifeBarRenderer';
import mascotTeen from './tamagotchiadolescente-03.png';
import mascotEgg from './tamagotchiovo-04.png';
import mascotBaby from './tamagotchibaby-05.png';
import mascotAdult from './tamagotchiadulto-06.png';
import rpsMascot from './Pedrapapeltesoura-04.png';
import type { MenuScreen, TamagotchiActionResult, TamagotchiState } from './types';

type SpeechCtor = new () => SpeechRecognition;

declare global {
    interface Window {
        webkitSpeechRecognition?: SpeechCtor;
    }
}

const SCREENS: MenuScreen[] = ['status', 'feed', 'play', 'clean', 'medicine'];
const MASCOT_TARGET_WIDTH = 182;
const MASCOT_TARGET_HEIGHT = 91;
const IMAGE_POLL_INTERVAL_MS = 500;
type RpsMove = 'rock' | 'paper' | 'scissors';
type PlayFlowStage = 'idle' | 'select_game' | 'select_move' | 'result';

type PlayFlowState = {
    stage: PlayFlowStage;
    round: number;
    userWins: number;
    petWins: number;
};

const IDLE_PLAY_FLOW: PlayFlowState = {
    stage: 'idle',
    round: 0,
    userWins: 0,
    petWins: 0,
};

const moveLabel: Record<RpsMove, string> = {
    rock: 'ROCK',
    paper: 'PAPER',
    scissors: 'SCISSORS',
};

const menuToMove = (screen: MenuScreen): RpsMove | null => {
    if (screen === 'feed') return 'rock';
    if (screen === 'play') return 'paper';
    if (screen === 'clean') return 'scissors';
    return null;
};

const randomPetMove = (): RpsMove => {
    const all: RpsMove[] = ['rock', 'paper', 'scissors'];
    return all[Math.floor(Math.random() * all.length)] ?? 'rock';
};

const decideRound = (userMove: RpsMove, petMove: RpsMove): 'win' | 'lose' | 'draw' => {
    if (userMove === petMove) return 'draw';
    if (
        (userMove === 'rock' && petMove === 'scissors') ||
        (userMove === 'scissors' && petMove === 'paper') ||
        (userMove === 'paper' && petMove === 'rock')
    ) {
        return 'win';
    }
    return 'lose';
};

const mascotByStage = (stage: TamagotchiState['stage']): string => {
    if (stage === 'egg') return mascotEgg;
    if (stage === 'baby') return mascotBaby;
    if (stage === 'adult') return mascotAdult;
    return mascotTeen;
};

const nextIndex = (index: number, direction: 1 | -1): number => {
    const total = SCREENS.length;
    return (index + direction + total) % total;
};

const parseVoiceCommand = (text: string): MenuScreen | null => {
    const normalized = text.toLowerCase();
    if (normalized.includes('aliment') || normalized.includes('comida') || normalized.includes('feed')) {
        return 'feed';
    }
    if (normalized.includes('brinc') || normalized.includes('play')) return 'play';
    if (normalized.includes('limp') || normalized.includes('clean')) return 'clean';
    if (
        normalized.includes('remed') ||
        normalized.includes('medic') ||
        normalized.includes('cura') ||
        normalized.includes('medicine')
    ) {
        return 'medicine';
    }
    return null;
};

export interface TamagotchiViewModel {
    state: TamagotchiState;
    selectedScreen: MenuScreen;
    message: string;
    asciiFrame: string;
    bridgeReady: boolean;
    debugLogs: string[];
    voiceSupported: boolean;
    voiceListening: boolean;
    applyScreenAction: (screen: MenuScreen) => void;
    cycleScreen: (direction: 1 | -1) => void;
    goToStatus: () => void;
    fastForward: (minutes: number) => void;
    resetAgeCache: () => void;
    setPetName: (name: string) => void;
    discipline: () => void;
    toggleVoice: () => void;
    playDialogHint: string;
}

export const useTamagotchi = (): TamagotchiViewModel => {
    const engineRef = useRef<TamagotchiEngine>(new TamagotchiEngine());
    const bridgeRef = useRef<EvenTamagotchiBridge | null>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const lastMascotKeyRef = useRef<string | null>(null);
    const lastBarsKeyRef = useRef<string | null>(null);
    const mascotImageCacheRef = useRef<Map<string, Uint8Array>>(new Map());
    const barsImageCacheRef = useRef<Map<string, Uint8Array>>(new Map());
    const mascotPushInFlightRef = useRef(false);
    const lastMascotPushAtRef = useRef(0);
    const screenIndexRef = useRef(0);
    const playFlowRef = useRef<PlayFlowState>(IDLE_PLAY_FLOW);
    const [state, setState] = useState<TamagotchiState>(() => engineRef.current.getState());
    const [screenIndex, setScreenIndex] = useState(0);
    const [message, setMessage] = useState('Pet woke up.');
    const [voiceListening, setVoiceListening] = useState(false);
    const [bridgeReady, setBridgeReady] = useState(false);
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const [playFlow, setPlayFlow] = useState<PlayFlowState>(IDLE_PLAY_FLOW);
    const [lastPetMoveLabel, setLastPetMoveLabel] = useState<string>('');
    const [imageRefreshToken, setImageRefreshToken] = useState(0);
    const [renderNowMs, setRenderNowMs] = useState<number>(() => Date.now());

    const selectedScreen = SCREENS[screenIndex];
    screenIndexRef.current = screenIndex;
    const voiceSupported = typeof window !== 'undefined' &&
        Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
    const currentMascotUrl = playFlow.stage === 'idle' ? mascotByStage(state.stage) : rpsMascot;
    const currentMascotKey = `${playFlow.stage}:${state.stage}:${currentMascotUrl}`;

    const appendLog = useCallback((messageLine: string) => {
        const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
        const line = `${timestamp} ${messageLine}`;
        setDebugLogs((prev) => [line, ...prev].slice(0, 80));
    }, []);

    useEffect(() => {
        playFlowRef.current = playFlow;
    }, [playFlow]);

    const syncState = useCallback((nextMessage?: string) => {
        const nextState = engineRef.current.syncWithClock();
        setState(nextState);
        if (nextMessage) setMessage(nextMessage);
    }, []);

    const executeAction = useCallback((screen: MenuScreen) => {
        const flow = playFlowRef.current;
        if (flow.stage === 'result') {
            playFlowRef.current = IDLE_PLAY_FLOW;
            setPlayFlow(IDLE_PLAY_FLOW);
            setLastPetMoveLabel('');
            setScreenIndex(0);
            setMessage('Result confirmed. Back to menu.');
            return;
        }

        if (flow.stage === 'select_game') {
            if (screen === 'play') {
                const nextFlow: PlayFlowState = {
                    stage: 'select_move',
                    round: 1,
                    userWins: 0,
                    petWins: 0,
                };
                playFlowRef.current = nextFlow;
                setPlayFlow(nextFlow);
                setMessage('RPS R1: FEED=ROCK | PLAY=PAPER | CLEAN=SCISSORS');
            } else {
                setMessage('Single game: select PLAY to start RPS.');
            }
            return;
        }

        if (flow.stage === 'select_move') {
            const userMove = menuToMove(screen);
            if (!userMove) {
                setMessage('Use FEED/PLAY/CLEAN to choose a move.');
                return;
            }

            const petMove = randomPetMove();
            const result = decideRound(userMove, petMove);
            setLastPetMoveLabel(moveLabel[petMove]);
            const nextUserWins = flow.userWins + (result === 'win' ? 1 : 0);
            const nextPetWins = flow.petWins + (result === 'lose' ? 1 : 0);
            const nextRound = flow.round + 1;
            const roundSummary = `R${flow.round}: you ${moveLabel[userMove]} vs pet ${moveLabel[petMove]} => ${
                result === 'win' ? 'WIN' : result === 'lose' ? 'LOSE' : 'DRAW'
            }`;

            const seriesClosed = nextUserWins >= 2 || nextPetWins >= 2 || flow.round >= 3;
            if (seriesClosed) {
                const userWonSeries = nextUserWins >= 2;
                const reward = engineRef.current.applyPlaySeriesReward(userWonSeries);
                const nextState = engineRef.current.getState();
                setState(nextState);
                const resultFlow: PlayFlowState = {
                    stage: 'result',
                    round: flow.round,
                    userWins: nextUserWins,
                    petWins: nextPetWins,
                };
                playFlowRef.current = resultFlow;
                setPlayFlow(resultFlow);
                setMessage(
                    `${roundSummary} | Final ${nextUserWins}x${nextPetWins}. ${reward.message} Click to return.`,
                );
                return;
            }

            const nextFlow: PlayFlowState = {
                stage: 'select_move',
                round: nextRound,
                userWins: nextUserWins,
                petWins: nextPetWins,
            };
            playFlowRef.current = nextFlow;
            setPlayFlow(nextFlow);
            setMessage(
                `${roundSummary} | Score ${nextUserWins}x${nextPetWins}. R${nextRound}: FEED/PLAY/CLEAN.`,
            );
            return;
        }

        if (screen === 'play') {
            setLastPetMoveLabel('');
            const nextFlow: PlayFlowState = {
                stage: 'select_game',
                round: 0,
                userWins: 0,
                petWins: 0,
            };
            playFlowRef.current = nextFlow;
            setPlayFlow(nextFlow);
            setMessage('Select game: PLAY = ROCK-PAPER-SCISSORS');
            return;
        }

        let result: TamagotchiActionResult = { changed: false, message: 'No action on this screen.' };
        switch (screen) {
            case 'feed':
                result = engineRef.current.feed();
                break;
            case 'clean':
                result = engineRef.current.clean();
                break;
            case 'medicine':
                result = engineRef.current.medicine();
                break;
            default:
                result = { changed: false, message: 'Status selected.' };
        }
        const nextState = engineRef.current.getState();
        setState(nextState);
        setMessage(result.message);
    }, []);

    const cycleScreen = useCallback((direction: 1 | -1) => {
        setScreenIndex((current) => nextIndex(current, direction));
    }, []);

    const onEvenInput = useCallback((event: EvenInputEvent) => {
        if (event === 'scroll_top') {
            cycleScreen(-1);
            setMessage('Previous menu.');
            return;
        }
        if (event === 'scroll_bottom') {
            cycleScreen(1);
            setMessage('Next menu.');
            return;
        }
        if (event === 'double_click') {
            if (playFlowRef.current.stage !== 'idle') {
                playFlowRef.current = IDLE_PLAY_FLOW;
                setPlayFlow(IDLE_PLAY_FLOW);
                setLastPetMoveLabel('');
                setMessage('Mini-game canceled.');
                return;
            }
            setScreenIndex(0);
            setMessage('Returned to status.');
            return;
        }
    }, [cycleScreen]);

    useEffect(() => {
        const timer = setInterval(() => {
            const nextState = engineRef.current.syncWithClock();
            setState(nextState);
            setRenderNowMs(Date.now());
        }, 500);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        syncState('Synced.');
    }, [syncState]);

    useEffect(() => {
        const bridge = new EvenTamagotchiBridge();
        bridgeRef.current = bridge;
        appendLog('[Hook] starting bridge init');
        bridge
            .init(
                onEvenInput,
                (screen) => setScreenIndex(SCREENS.indexOf(screen)),
                executeAction,
                appendLog,
            )
            .then((ready) => {
                setBridgeReady(ready);
                appendLog(`[Hook] bridge ready=${ready}`);
            })
            .catch(() => {
                setBridgeReady(false);
                appendLog('[Hook] bridge init threw error');
            });
        return () => bridge.destroy();
    }, [appendLog, executeAction, onEvenInput]);

    useEffect(() => {
        let cancelled = false;
        const pollAndSendMascot = async (force = false) => {
            if (cancelled || !bridgeReady || mascotPushInFlightRef.current) return;
            const now = Date.now();
            const keyChanged = lastMascotKeyRef.current !== currentMascotKey;
            if (!force && !keyChanged && now - lastMascotPushAtRef.current < IMAGE_POLL_INTERVAL_MS) {
                return;
            }

            mascotPushInFlightRef.current = true;
            try {
                let imageData = mascotImageCacheRef.current.get(currentMascotKey);
                if (!imageData) {
                    appendLog(
                        `[Hook] preparing mascot image ${MASCOT_TARGET_WIDTH}x${MASCOT_TARGET_HEIGHT} key=${currentMascotKey}`,
                    );
                    imageData = await convertImageToGrayscalePng(
                        currentMascotUrl,
                        MASCOT_TARGET_WIDTH,
                        MASCOT_TARGET_HEIGHT,
                        0.9,
                    );
                    mascotImageCacheRef.current.set(currentMascotKey, imageData);
                }
                if (cancelled) return;

                const sent = await bridgeRef.current?.pushUiFrame(Array.from(imageData));
                if (sent) {
                    lastMascotKeyRef.current = currentMascotKey;
                    lastMascotPushAtRef.current = Date.now();
                }
                if (force || keyChanged || !sent) {
                    appendLog(`[Hook] mascot send result=${Boolean(sent)} bytes=${imageData.length}`);
                }
            } catch {
                appendLog('[Hook] mascot send failed');
            } finally {
                mascotPushInFlightRef.current = false;
            }
        };

        void pollAndSendMascot(true);
        const timer = setInterval(() => {
            void pollAndSendMascot();
        }, IMAGE_POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [appendLog, bridgeReady, currentMascotKey, currentMascotUrl, imageRefreshToken]);

    useEffect(() => {
        if (!bridgeReady) return;
        const labels: [string, string, string] =
            playFlow.stage === 'select_move'
                ? ['ROCK', 'PAPER', 'SCISSORS']
                : playFlow.stage === 'result'
                  ? ['OK', 'OK', 'OK']
                : ['FEED', 'PLAY', 'CLEAN'];
        bridgeRef.current?.setActionLabels(labels).then(() => {
            // Alguns firmwares limpam image layer após rebuild.
            lastMascotKeyRef.current = null;
            lastBarsKeyRef.current = null;
            setImageRefreshToken((value) => value + 1);
        }).catch(() => {
            appendLog('[Hook] setActionLabels failed');
        });
    }, [appendLog, bridgeReady, playFlow.stage]);

    useEffect(() => {
        if (!bridgeReady) return;

        const dialogMode = playFlow.stage !== 'idle';
        const lifeUnits = Math.max(0, Math.min(4, Math.round(state.health / 25)));
        const barsKey = dialogMode
            ? 'dialog:hidden'
            : `bars:${state.hunger}:${state.happiness}:${state.poop}:${lifeUnits}`;
        if (lastBarsKeyRef.current === barsKey) return;

        let cancelled = false;
        const sendBars = async () => {
            try {
                let imageData = barsImageCacheRef.current.get(barsKey);
                if (!imageData) {
                    imageData = await renderLifeBarPng(
                        state.hunger,
                        state.happiness,
                        state.poop,
                        lifeUnits,
                        !dialogMode,
                    );
                    barsImageCacheRef.current.set(barsKey, imageData);
                }
                if (cancelled) return;

                const sent = await bridgeRef.current?.pushLifeBarFrame(Array.from(imageData));
                if (sent) {
                    lastBarsKeyRef.current = barsKey;
                }
            } catch {
                appendLog('[Hook] pushLifeBarFrame failed');
            }
        };

        void sendBars();
        return () => {
            cancelled = true;
        };
    }, [appendLog, bridgeReady, imageRefreshToken, playFlow.stage, state.happiness, state.health, state.hunger, state.poop]);

    useEffect(() => {
        const playDialogHint =
            playFlow.stage === 'select_game'
                ? 'Select game\nRock Paper Scissors\nClick PLAY to start'
                : playFlow.stage === 'select_move'
                  ? `Round ${playFlow.round}\n` +
                    `Score ${playFlow.userWins} x ${playFlow.petWins}\n` +
                    `${state.petName} move: ${lastPetMoveLabel || '---'}\n` +
                    ''
                  : playFlow.stage === 'result'
                    ? `Result\nYou ${playFlow.userWins} x ${playFlow.petWins} ${state.petName}\n` +
                      `${playFlow.userWins > playFlow.petWins ? 'YOU WON' : `${state.petName} WON`}\n` +
                      'Click to return'
                  : '';
        const dialogMode = playFlow.stage !== 'idle';
        bridgeRef.current?.pushDashboardTexts(state, playDialogHint, dialogMode, renderNowMs).catch(() => {
            appendLog('[Hook] pushDashboardTexts failed');
        });
        return () => {
            // noop
        };
    }, [appendLog, state, playFlow, lastPetMoveLabel, renderNowMs]);

    const toggleVoice = useCallback(() => {
        if (!voiceSupported) {
            setMessage('Speech API not supported.');
            return;
        }
        if (voiceListening) {
            recognitionRef.current?.stop();
            setVoiceListening(false);
            setMessage('Voice paused.');
            return;
        }

        const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!RecognitionCtor) {
            setMessage('Speech API unavailable.');
            return;
        }

        const recognition = new RecognitionCtor();
        recognition.lang = 'pt-BR';
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.onresult = (event: SpeechRecognitionEvent) => {
            const transcript = event.results[event.results.length - 1]?.[0]?.transcript ?? '';
            const screen = parseVoiceCommand(transcript);
            if (!screen) {
                setMessage(`Ignored command: ${transcript}`);
                return;
            }
            setScreenIndex(SCREENS.indexOf(screen));
            executeAction(screen);
        };
        recognition.onerror = () => {
            setVoiceListening(false);
            setMessage('Voice recognition error.');
        };
        recognition.onend = () => {
            setVoiceListening(false);
        };
        recognition.start();
        recognitionRef.current = recognition;
        setVoiceListening(true);
        setMessage('Voice active.');
    }, [executeAction, voiceListening, voiceSupported]);

    const fastForward = useCallback((minutes: number) => {
        const nextState = engineRef.current.fastForward(minutes);
        setState(nextState);
        setMessage(`Time advanced by ${minutes} min.`);
    }, []);

    const resetAgeCache = useCallback(() => {
        const nextState = engineRef.current.resetAgeCache();
        setState(nextState);
        lastMascotKeyRef.current = null;
        setImageRefreshToken((value) => value + 1);
        setMessage('Age cache reset.');
        appendLog('[Hook] age cache reset requested');
    }, [appendLog]);

    const setPetName = useCallback((name: string) => {
        const nextState = engineRef.current.setPetName(name);
        setState(nextState);
        setMessage(`Name updated to ${nextState.petName}.`);
        appendLog(`[Hook] pet name set to "${nextState.petName}"`);
    }, [appendLog]);

    const discipline = useCallback(() => {
        const result = engineRef.current.discipline();
        setState(engineRef.current.getState());
        setMessage(result.message);
    }, []);

    const goToStatus = useCallback(() => {
        setScreenIndex(0);
        setMessage('Status opened.');
    }, []);

    const asciiFrame = useMemo(
        () => buildAsciiFrame(state, selectedScreen, message),
        [state, selectedScreen, message],
    );
    const playDialogHint =
        playFlow.stage === 'select_game'
            ? 'Select game\nRock Paper Scissors\nClick PLAY to start'
            : playFlow.stage === 'select_move'
              ? `Round ${playFlow.round}\nFEED Rock\nPLAY Paper\nCLEAN Scissors`
              : playFlow.stage === 'result'
                ? `Result\n${playFlow.userWins} x ${playFlow.petWins}\nClick to return`
              : '';

    return {
        state,
        selectedScreen,
        message,
        asciiFrame,
        bridgeReady,
        debugLogs,
        voiceSupported,
        voiceListening,
        applyScreenAction: executeAction,
        cycleScreen,
        goToStatus,
        fastForward,
        resetAgeCache,
        setPetName,
        discipline,
        toggleVoice,
        playDialogHint,
    };
};
