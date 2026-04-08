import { useEffect, useState } from 'react';
import { useTamagotchi } from './tamagotchi/useTamagotchi';
import appConfig from '../app.json';

function InfoCard({ children }: { children: React.ReactNode }) {
    return <div className="card">{children}</div>;
}

function DetailBox({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="detail-box">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function App() {
    const {
        state,
        bridgeReady,
        fastForward,
        resetAgeCache,
        setPetName,
        debugLogs,
    } = useTamagotchi();
    const [petNameInput, setPetNameInput] = useState(state.petName);

    useEffect(() => {
        setPetNameInput(state.petName);
    }, [state.petName]);

    return (
        <main className="together-shell">
            <header className="top-header">
                <h1>Tamagotchi | Even G2</h1>
            </header>

            {/* CONNECTION SECTION */}
            <section className="section">
                <h3 className="section-title">Connection</h3>

                <InfoCard>
                    <div className="row">
                        <span>Status</span>
                        <strong>
                            {bridgeReady
                                ? 'Bridge active in Even App'
                                : 'Waiting for bridge...'}
                        </strong>
                    </div>
                </InfoCard>

                <InfoCard>
                    <div className="row">
                        <span>Device</span>
                        <strong>
                            {bridgeReady
                                ? 'G2 connected in app webview'
                                : 'Open via Even App using QR'}
                        </strong>
                    </div>
                </InfoCard>
            </section>

            {/* DETAILS */}
            <section className="section">
                <h3 className="section-title">Details</h3>

                <div className="details-grid">
                    <DetailBox label="Stage" value={state.stage} />
                    <DetailBox
                        label="Age"
                        value={`${Math.floor(state.ageMinutes / 60)}:${String(
                            state.ageMinutes % 60
                        )}`}
                    />
                    <DetailBox label="Hunger" value={`${state.hunger}/4`} />
                    <DetailBox label="Happiness" value={`${state.happiness}/4`} />
                </div>
            </section>

            {/* SETTINGS / DEBUG */}
            <section className="section">
                <h3 className="section-title">Controls</h3>

                <InfoCard>
                    <div className="button-group">
                        <input
                            type="text"
                            className="name-input"
                            value={petNameInput}
                            onChange={(event) => setPetNameInput(event.target.value)}
                            maxLength={12}
                            placeholder="Pet name (max 12)"
                        />
                        <button

                            className="primary-button text-black"
                            onClick={() => setPetName(petNameInput)}
                        >
                            Save name
                        </button>
                        {/* <button
                            className="primary-button text-black"
                            onClick={() => fastForward(60)}
                        >
                            Advance +1h
                        </button> */}

                        <button
                            className="secondary-button text-black"
                            onClick={resetAgeCache}
                        >
                            Reset age
                        </button>
                    </div>
                </InfoCard>
            </section>

            {/* LOGS */}
            <section className="section">
                <h3 className="section-title">Diagnostics</h3>

                <InfoCard>
                    <div className="log-box">
                        {debugLogs.length === 0 ? (
                            <p>No logs yet...</p>
                        ) : (
                            debugLogs.slice(0, 18).map((line, index) => (
                                <p key={`${index}-${line}`}>{line}</p>
                            ))
                        )}
                    </div>
                </InfoCard>
            </section>

            <footer style={{ textAlign: 'center', fontSize: '12px', color: '#888', marginTop: '2rem', paddingBottom: '1rem', opacity: 0.7 }}>
                v{appConfig.version}
            </footer>
        </main>
    );
}

export default App;
