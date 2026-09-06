// ======================================================
// DOM
// ======================================================

const bootScreen =
    document.querySelector(
        "#boot-screen"
    );

const bootLog =
    document.querySelector(
        "#boot-log"
    );

const readyPanel =
    document.querySelector(
        "#ready-panel"
    );

const modeScreen =
    document.querySelector(
        "#mode-screen"
    );

const playerScreen =
    document.querySelector(
        "#player-screen"
    );

const enterButton =
    document.querySelector(
        "#enter-button"
    );

const exitControl =
    document.querySelector(
        "#exit-control"
    );

const audio =
    document.querySelector(
        "#audio"
    );

const audioControl =
    document.querySelector(
        "#audio-control"
    );

const status =
    document.querySelector(
        "#status"
    );



// ======================================================
// APPLICATION STATE
// ======================================================

let state =
    "boot";

let mode =
    "full";



// ======================================================
// TERMINAL STATE
// ======================================================

let terminal =
    null;

let fitAddon =
    null;

let webglAddon =
    null;

let ws =
    null;



// Browser workload budget.
//
// Rust receives these dimensions
// through:
//
// /ws?cols=X&rows=Y
//
// Keep this intentionally bounded because
// every additional cell becomes renderer work.

const MAX_COLS =
    180;

const MAX_ROWS =
    58;



// PTY dimensions are frozen once playback begins.

let lockedCols =
    0;

let lockedRows =
    0;



// ======================================================
// TERMINAL OUTPUT BUFFER
// ======================================================

// WebSocket may split one terminal frame
// into several binary messages.
//
// Collect them and feed xterm at most once
// per animation frame.

let pendingChunks =
    [];

let pendingBytes =
    0;

let writeScheduled =
    false;

let terminalWriteBusy =
    false;



// ======================================================
// AUDIO STATE
// ======================================================

let audioStarted =
    false;

let audioPrimed =
    false;

let rendererStarted =
    false;



// Rust main.rs enters alternate-screen mode
// using:
//
// ESC [?1049h
//
// We watch startup output for that marker.

let startupProbe =
    "";

const ansiDecoder =
    new TextDecoder();



// ======================================================
// BOOT DATA
// ======================================================

const bootMessages = [

    "INITIALIZING PIPELINE…",

    "PIPELINE READY"

];



// ======================================================
// BOOT
// ======================================================

async function boot() {

    bootLog.textContent =
        "";


    for (
        const line
        of bootMessages
    ) {

        bootLog.textContent =
            line;


        await sleep(

            320

        );
    }


    await sleep(
        280
    );


    readyPanel
        .classList
        .remove(
            "hidden"
        );


    state =
        "ready";
}



function sleep(ms) {

    return new Promise(

        resolve =>
            setTimeout(
                resolve,
                ms
            )

    );
}



// ======================================================
// ENTER SYSTEM
// ======================================================

function enterSystem() {

    if (
        state !==
        "ready"
    ) {

        return;
    }


    state =
        "mode";


    bootScreen
        .classList
        .add(
            "hidden"
        );


    modeScreen
        .classList
        .remove(
            "hidden"
        );
}



// ======================================================
// SELECT MODE
// ======================================================

function selectMode(
    selectedMode
) {

    mode =
        selectedMode;


    document
        .querySelectorAll(
            "[data-mode]"
        )
        .forEach(
            option => {

                const selected =
                    option.dataset.mode ===
                    mode;


                option
                    .classList
                    .toggle(
                        "selected",
                        selected
                    );


                const selector =
                    option.querySelector(
                        ".selector"
                    );


                if (
                    selector
                ) {

                    selector.textContent =
                        selected

                            ? ">"

                            : " ";

                }
            }
        );
}



// ======================================================
// AUDIO PRIMING
// ======================================================
//
// Browsers usually require audio playback to begin
// inside an explicit user gesture.
//
// startExperience() is triggered by Enter/click,
// so we start the soundtrack silently here.
//
// When Rust actually enters alternate-screen mode,
// the track is rewound and unmuted.
//
// ======================================================

async function primeAudio() {

    if (
        mode !==
        "full"
    ) {

        return;
    }


    try {

        audio.pause();

        audio.currentTime =
            0;

        audio.muted =
            true;


        await audio.play();


        audioStarted =
            true;

        audioPrimed =
            true;


        console.log(
            "AUDIO PRIMED"
        );


    } catch (
        error
    ) {

        audioStarted =
            false;

        audioPrimed =
            false;


        console.warn(
            "Audio prime failed:",
            error
        );
    }
}



// ======================================================
// START EXPERIENCE
// ======================================================

async function startExperience() {

    if (
        state !==
        "mode"
    ) {

        return;
    }


    // IMPORTANT:
    // Do this while the user gesture is active.
    if (
        mode ===
        "full"
    ) {

        await primeAudio();

    } else {

        stopAudio();

    }


    state =
        "playing";


    rendererStarted =
        false;

    startupProbe =
        "";


    pendingChunks =
        [];

    pendingBytes =
        0;

    writeScheduled =
        false;

    terminalWriteBusy =
        false;


    modeScreen
        .classList
        .add(
            "hidden"
        );


    playerScreen
        .classList
        .remove(
            "hidden"
        );


    status.textContent =
        "CALCULATING TERMINAL";


    updateAudioDisplay();


    // Wait for player geometry to actually
    // exist before FitAddon measures it.

    requestAnimationFrame(
        () => {

            requestAnimationFrame(
                () => {

                    startRenderer();

                }
            );
        }
    );
}



// ======================================================
// TERMINAL CREATION
// ======================================================

function startRenderer() {

    destroyRenderer();


    terminal =
        new Terminal({

            cursorBlink:
                false,

            disableStdin:
                true,

            scrollback:
                0,

            convertEol:
                false,

            allowTransparency:
                false,


            fontFamily:
                "'JetBrains Mono', Consolas, 'Courier New', monospace",

            fontSize:
                11,

            lineHeight:
                1,


            theme: {

                background:
                    "#050307",

                foreground:
                    "#d8b4fe",

                cursor:
                    "#f472b6",

                cursorAccent:
                    "#050307",

                selectionBackground:
                    "#a855f733"

            }
        });



    // ==================================================
    // FIT
    // ==================================================

    fitAddon =
        new FitAddon
            .FitAddon();


    terminal.loadAddon(
        fitAddon
    );


    terminal.open(
        document.querySelector(
            "#xterm"
        )
    );



    // ==================================================
    // WEBGL
    // ==================================================

    try {

        webglAddon =
            new WebglAddon
                .WebglAddon();


        terminal.loadAddon(
            webglAddon
        );


        webglAddon
            .onContextLoss(
                () => {

                    console.warn(
                        "XTERM WEBGL CONTEXT LOST"
                    );


                    try {

                        webglAddon
                            .dispose();

                    } catch (_) {}


                    webglAddon =
                        null;
                }
            );


        console.log(
            "XTERM WEBGL ACTIVE"
        );


    } catch (
        error
    ) {

        console.warn(
            "WebGL unavailable:",
            error
        );
    }



    // ==================================================
    // CALCULATE TERMINAL ONCE
    // ==================================================

    requestAnimationFrame(
        () => {

            requestAnimationFrame(
                () => {

                    fitTerminalWithinBudget();


                    lockedCols =
                        terminal.cols;

                    lockedRows =
                        terminal.rows;


                    console.log(
                        `LOCKED TERMINAL ${lockedCols}x${lockedRows}`
                    );


                    status.textContent =
                        `CONNECTING ${lockedCols}×${lockedRows}`;


                    connectMainframe(
                        lockedCols,
                        lockedRows
                    );
                }
            );
        }
    );
}



// ======================================================
// TERMINAL SIZE BUDGET
// ======================================================

function fitTerminalWithinBudget() {

    if (
        !terminal ||
        !fitAddon
    ) {

        return;
    }


    terminal.options.fontSize =
        11;


    fitAddon.fit();


    const colScale =
        terminal.cols /
        MAX_COLS;


    const rowScale =
        terminal.rows /
        MAX_ROWS;


    const scale =
        Math.max(

            colScale,

            rowScale,

            1

        );


    if (
        scale > 1
    ) {

        terminal.options.fontSize =
            Math.ceil(
                11 * scale
            );


        fitAddon.fit();
    }


    console.log(

        "TERMINAL SIZE",

        `${terminal.cols}x${terminal.rows}`,

        "FONT",

        terminal.options.fontSize

    );
}



// ======================================================
// MAINFRAME WEBSOCKET
// ======================================================

function connectMainframe(
    cols,
    rows
) {

    const protocol =

        location.protocol ===
        "https:"

            ? "wss"

            : "ws";


    const url =

        `${protocol}://${location.host}` +
        `/ws?cols=${cols}&rows=${rows}`;


    console.log(
        "CONNECT MAINFRAME:",
        url
    );


    ws =
        new WebSocket(
            url
        );


    ws.binaryType =
        "arraybuffer";



    // ==================================================
    // OPEN
    // ==================================================

    ws.onopen =
        () => {

            console.log(
                `MAINFRAME CONNECTED ${cols}x${rows}`
            );


            status.textContent =
                `MAINFRAME ${cols}×${rows}`;
        };



    // ==================================================
    // DATA
    // ==================================================

    ws.onmessage =
        async event => {


            // ------------------------------------------
            // PTY BINARY OUTPUT
            // ------------------------------------------

            if (
                event.data
                instanceof ArrayBuffer
            ) {

                const bytes =
                    new Uint8Array(
                        event.data
                    );


                // Detect renderer entering
                // alternate-screen mode.

                if (
                    !rendererStarted
                ) {

                    const text =
                        ansiDecoder.decode(

                            bytes,

                            {
                                stream:
                                    true
                            }

                        );


                    startupProbe =
                        (
                            startupProbe +
                            text
                        )
                        .slice(
                            -768
                        );


                    if (
                        startupProbe.includes(
                            "\x1b[?1049h"
                        )
                    ) {

                        rendererStarted =
                            true;


                        console.log(
                            "RUST RENDERER STARTED"
                        );


                        status.textContent =
                            `PLAYING ${lockedCols}×${lockedRows}`;


                        if (
                            mode ===
                            "full"
                        ) {

                            await syncAudioToRenderer();

                        } else {

                            audio.muted =
                                true;

                            updateAudioDisplay();

                        }
                    }
                }


                queueTerminalData(
                    event.data
                );


                return;
            }



            // ------------------------------------------
            // SERVER TEXT MESSAGE
            // ------------------------------------------

            if (
                typeof event.data ===
                "string"
            ) {

                terminal?.write(
                    event.data
                );
            }
        };



    // ==================================================
    // ERROR
    // ==================================================

    ws.onerror =
        error => {

            console.error(
                "MAINFRAME ERROR",
                error
            );


            stopAudio();


            status.textContent =
                "MAINFRAME ERROR";
        };



    // ==================================================
    // CLOSE
    // ==================================================

    ws.onclose =
        event => {

            console.log(

                "MAINFRAME CLOSED",

                event.code,

                event.reason

            );


            stopAudio();


            rendererStarted =
                false;

            startupProbe =
                "";


            if (
                state ===
                "playing"
            ) {

                status.textContent =
                    "PLAYBACK COMPLETE";
            }
        };
}



// ======================================================
// TERMINAL DATA QUEUE
// ======================================================

function queueTerminalData(
    buffer
) {

    const chunk =
        new Uint8Array(
            buffer
        );


    pendingChunks.push(
        chunk
    );


    pendingBytes +=
        chunk.byteLength;


    scheduleTerminalFlush();
}



// ======================================================
// SCHEDULE TERMINAL FLUSH
// ======================================================

function scheduleTerminalFlush() {

    if (
        writeScheduled ||
        terminalWriteBusy
    ) {

        return;
    }


    writeScheduled =
        true;


    requestAnimationFrame(
        () => {

            writeScheduled =
                false;


            flushTerminalData();
        }
    );
}



// ======================================================
// FLUSH TERMINAL DATA
// ======================================================

function flushTerminalData() {

    if (
        !terminal ||
        terminalWriteBusy ||
        pendingBytes === 0
    ) {

        return;
    }


    const combined =
        new Uint8Array(
            pendingBytes
        );


    let offset =
        0;


    for (
        const chunk
        of pendingChunks
    ) {

        combined.set(
            chunk,
            offset
        );


        offset +=
            chunk.byteLength;
    }


    pendingChunks =
        [];

    pendingBytes =
        0;


    terminalWriteBusy =
        true;


    terminal.write(

        combined,

        () => {

            terminalWriteBusy =
                false;


            if (
                pendingBytes >
                0
            ) {

                scheduleTerminalFlush();
            }
        }

    );
}



// ======================================================
// SYNC AUDIO TO RUST RENDERER
// ======================================================

async function syncAudioToRenderer() {

    if (
        mode !==
        "full"
    ) {

        return;
    }


    try {

        // Rust is now drawing actual frames.
        // Restart soundtrack at t=0.

        audio.currentTime =
            0;

        audio.muted =
            false;


        if (
            audio.paused
        ) {

            await audio.play();
        }


        audioStarted =
            true;


        console.log(
            "AUDIO SYNCED WITH RENDERER"
        );


        updateAudioDisplay();


    } catch (
        error
    ) {

        console.warn(
            "Audio sync failed:",
            error
        );


        audioStarted =
            false;


        audioControl.textContent =
            "[M] ENABLE AUDIO";
    }
}



// ======================================================
// STOP AUDIO
// ======================================================

function stopAudio() {

    audio.pause();


    try {

        audio.currentTime =
            0;

    } catch (_) {}


    audioStarted =
        false;

    audioPrimed =
        false;


    updateAudioDisplay();
}



// ======================================================
// TOGGLE AUDIO
// ======================================================

async function toggleAudio() {

    // User selected visual-only but then
    // explicitly enables audio.

    if (
        mode ===
        "visual"
    ) {

        mode =
            "full";


        try {

            audio.currentTime =
                0;

            audio.muted =
                false;


            await audio.play();


            audioStarted =
                true;

            audioPrimed =
                true;


        } catch (
            error
        ) {

            console.warn(
                "Audio start failed:",
                error
            );
        }


        updateAudioDisplay();

        return;
    }



    // Keep timeline running.
    // Just change mute state.

    audio.muted =
        !audio.muted;


    if (
        !audioStarted &&
        !audio.muted &&
        rendererStarted
    ) {

        try {

            await audio.play();


            audioStarted =
                true;

        } catch (
            error
        ) {

            console.warn(
                "Audio start failed:",
                error
            );
        }
    }


    updateAudioDisplay();
}



// ======================================================
// AUDIO UI
// ======================================================

function updateAudioDisplay() {

    if (
        !audioControl
    ) {

        return;
    }


    if (
        mode ===
        "visual"
    ) {

        audioControl.innerHTML =
            "<kbd>M</kbd> AUDIO: OFF";

        return;
    }


    audioControl.innerHTML =

        audio.muted

            ? "<kbd>M</kbd> AUDIO: MUTED"

            : "<kbd>M</kbd> AUDIO: ON";
}



// ======================================================
// DESTROY TERMINAL / WEBSOCKET
// ======================================================

function destroyRenderer() {


    // ==================================================
    // WEBSOCKET
    // ==================================================

    if (
        ws
    ) {

        ws.onopen =
            null;

        ws.onmessage =
            null;

        ws.onerror =
            null;

        ws.onclose =
            null;


        if (

            ws.readyState ===
                WebSocket.OPEN ||

            ws.readyState ===
                WebSocket.CONNECTING

        ) {

            try {

                ws.close();

            } catch (_) {}
        }


        ws =
            null;
    }



    // ==================================================
    // WEBGL
    // ==================================================

    if (
        webglAddon
    ) {

        try {

            webglAddon
                .dispose();

        } catch (_) {}


        webglAddon =
            null;
    }



    // ==================================================
    // TERMINAL
    // ==================================================

    if (
        terminal
    ) {

        try {

            terminal
                .dispose();

        } catch (_) {}


        terminal =
            null;
    }


    fitAddon =
        null;



    // ==================================================
    // BUFFER RESET
    // ==================================================

    pendingChunks =
        [];

    pendingBytes =
        0;

    writeScheduled =
        false;

    terminalWriteBusy =
        false;


    lockedCols =
        0;

    lockedRows =
        0;
}



// ======================================================
// EXIT EXPERIENCE
// ======================================================

async function exitExperience() {

    if (
        state !==
        "playing"
    ) {

        return;
    }


    console.log(
        "EXIT EXPERIENCE"
    );


    stopAudio();


    rendererStarted =
        false;

    startupProbe =
        "";


    destroyRenderer();


    playerScreen
        .classList
        .add(
            "hidden"
        );


    modeScreen
        .classList
        .remove(
            "hidden"
        );


    status.textContent =
        "STANDBY";


    state =
        "mode";
}



// ======================================================
// KEYBOARD CONTROLS
// ======================================================

document.addEventListener(

    "keydown",

    async event => {

        const key =
            event.key
                .toLowerCase();



        // ==================================================
        // READY SCREEN
        // ==================================================

        if (
            state ===
                "ready" &&
            event.key ===
                "Enter"
        ) {

            enterSystem();

            return;
        }



        // ==================================================
        // MODE SCREEN
        // ==================================================

        if (
            state ===
            "mode"
        ) {

            if (
                key ===
                "1"
            ) {

                selectMode(
                    "visual"
                );

                return;
            }


            if (
                key ===
                "2"
            ) {

                selectMode(
                    "full"
                );

                return;
            }


            if (
                event.key ===
                "ArrowLeft"
            ) {

                selectMode(
                    "visual"
                );

                return;
            }


            if (
                event.key ===
                "ArrowRight"
            ) {

                selectMode(
                    "full"
                );

                return;
            }


            if (
                event.key ===
                "Enter"
            ) {

                await startExperience();

                return;
            }
        }



        // ==================================================
        // PLAYER
        // ==================================================

        if (
            state ===
            "playing"
        ) {

            if (
                key ===
                "m"
            ) {

                await toggleAudio();

                return;
            }


            if (
                key ===
                "q" ||
                event.key ===
                "Escape"
            ) {

                await exitExperience();

                return;
            }
        }
    }

);



// ======================================================
// ENTER BUTTON
// ======================================================

enterButton.addEventListener(

    "click",

    enterSystem

);



// ======================================================
// MODE CARD CLICK
// ======================================================

document
    .querySelectorAll(
        "[data-mode]"
    )
    .forEach(
        card => {

            card.addEventListener(
                "click",
                () => {

                    selectMode(
                        card.dataset.mode
                    );
                }
            );


            card.addEventListener(
                "dblclick",
                async () => {

                    selectMode(
                        card.dataset.mode
                    );


                    await startExperience();
                }
            );


            card.addEventListener(
                "keydown",
                async event => {

                    if (
                        event.key ===
                            "Enter" ||
                        event.key ===
                            " "
                    ) {

                        event.preventDefault();


                        selectMode(
                            card.dataset.mode
                        );
                    }
                }
            );
        }
    );



// ======================================================
// AUDIO CONTROL
// ======================================================

audioControl.addEventListener(

    "click",

    toggleAudio

);



// ======================================================
// EXIT CONTROL
// ======================================================

if (
    exitControl
) {

    exitControl.addEventListener(

        "click",

        exitExperience

    );


    exitControl.addEventListener(

        "keydown",

        async event => {

            if (
                event.key ===
                    "Enter" ||
                event.key ===
                    " "
            ) {

                event.preventDefault();


                await exitExperience();
            }
        }
    );
}



// ======================================================
// AUDIO DIAGNOSTICS
// ======================================================

audio.addEventListener(

    "loadedmetadata",

    () => {

        console.log(

            "AUDIO LOADED",

            `${audio.duration.toFixed(2)}s`

        );
    }

);


audio.addEventListener(

    "error",

    () => {

        console.error(

            "AUDIO FILE ERROR",

            audio.error

        );


        if (
            audioControl
        ) {

            audioControl.innerHTML =
                "<kbd>M</kbd> AUDIO ERROR";
        }
    }

);



// ======================================================
// IMPORTANT
//
// DO NOT FitAddon.fit() during playback.
//
// PTY:
//     lockedCols × lockedRows
//
// xterm:
//     lockedCols × lockedRows
//
// Rust:
//
//     terminal::size()
//
// must all remain identical for one session.
// ======================================================



// ======================================================
// INITIALIZE
// ======================================================

selectMode(
    "full"
);


updateAudioDisplay();


boot();
