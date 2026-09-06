const bootScreen = document.querySelector("#boot-screen");
const bootLog = document.querySelector("#boot-log");
const readyPanel = document.querySelector("#ready-panel");

const modeScreen = document.querySelector("#mode-screen");
const playerScreen = document.querySelector("#player-screen");

const enterButton = document.querySelector("#enter-button");
const exitControl = document.querySelector("#exit-control");

const audio = document.querySelector("#audio");
const audioControl = document.querySelector("#audio-control");

const status = document.querySelector("#status");


let state = "boot";
let mode = "full";


// ======================================================
// TERMINAL STATE
// ======================================================

let terminal = null;
let fitAddon = null;
let webglAddon = null;
let ws = null;


// Keep mainframe rendering workload controlled.
const MAX_COLS = 180;
const MAX_ROWS = 58;


// Geometry gets frozen once PTY starts.
let lockedCols = 0;
let lockedRows = 0;


// ======================================================
// TERMINAL DATA BUFFERING
// ======================================================

let pendingChunks = [];
let pendingBytes = 0;

let writeScheduled = false;
let terminalWriteBusy = false;


// ======================================================
// AUDIO STATE
// ======================================================

let audioStarted = false;
let rendererStarted = false;

let startupProbe = "";

const ansiDecoder =
    new TextDecoder();


// ======================================================
// BOOT
// ======================================================

const bootMessages = [

    "RUST//FRAME TERMINAL v0.1",
    "",

    "> initializing runtime...",
    "> ffmpeg pipeline .............. OK",
    "> rgb24 decoder ................ OK",
    "> ansi renderer ................ OK",
    "> websocket interface .......... STANDBY",
    "> media subsystem .............. OK",

    "",

    "INITIALIZATION COMPLETE."
];


async function boot() {

    for (const line of bootMessages) {

        bootLog.textContent +=
            line + "\n";


        await sleep(

            line === ""

                ? 120

                : 150 +
                  Math.random() * 220

        );
    }


    await sleep(400);


    readyPanel.classList.remove(
        "hidden"
    );


    state = "ready";
}


function sleep(ms) {

    return new Promise(
        resolve =>
            setTimeout(resolve, ms)
    );
}


// ======================================================
// ENTER SYSTEM
// ======================================================

function enterSystem() {

    if (state !== "ready") {
        return;
    }


    state = "mode";


    bootScreen.classList.add(
        "hidden"
    );


    modeScreen.classList.remove(
        "hidden"
    );
}


// ======================================================
// MODE SELECT
// ======================================================

function selectMode(selectedMode) {

    mode = selectedMode;


    document
        .querySelectorAll(
            "[data-mode]"
        )
        .forEach(option => {

            const selected =
                option.dataset.mode === mode;


            option.classList.toggle(
                "selected",
                selected
            );


            const selector =
                option.querySelector(
                    ".selector"
                );


            if (selector) {

                selector.textContent =
                    selected
                        ? ">"
                        : " ";
            }
        });
}


// ======================================================
// START EXPERIENCE
// ======================================================

async function startExperience() {

    if (state !== "mode") {
        return;
    }


    state = "playing";


    // Clean previous state.
    stopAudio();


    rendererStarted = false;
    startupProbe = "";


    pendingChunks = [];
    pendingBytes = 0;

    writeScheduled = false;
    terminalWriteBusy = false;


    // ------------------------------------------
    // AUTO FULLSCREEN DISABLED FOR NOW
    // ------------------------------------------

    /*
    if (!document.fullscreenElement) {

        try {

            await document
                .documentElement
                .requestFullscreen();

        } catch (error) {

            console.warn(
                "Fullscreen unavailable:",
                error
            );
        }
    }
    */


    modeScreen.classList.add(
        "hidden"
    );


    playerScreen.classList.remove(
        "hidden"
    );


    status.textContent =
        "CALCULATING TERMINAL";


    // Reset audio.
    audio.pause();

    try {
        audio.currentTime = 0;
    } catch (_) {}


    audio.muted =
        mode === "visual";


    updateAudioDisplay();


    // Wait until player layout exists.
    requestAnimationFrame(() => {

        requestAnimationFrame(() => {

            startRenderer();

        });
    });
}


// ======================================================
// TERMINAL CREATION
// ======================================================

function startRenderer() {

    destroyRenderer();


    terminal =
        new Terminal({

            cursorBlink: false,

            disableStdin: true,

            scrollback: 0,

            convertEol: false,

            fontFamily:
                "Consolas, 'Courier New', monospace",

            fontSize: 11,

            lineHeight: 1,

            theme: {

                background:
                    "#020403",

                foreground:
                    "#66ff99",

                cursor:
                    "#66ff99"
            }
        });


    // -----------------------------
    // FIT
    // -----------------------------

    fitAddon =
        new FitAddon.FitAddon();


    terminal.loadAddon(
        fitAddon
    );


    terminal.open(
        document.querySelector(
            "#xterm"
        )
    );


    // -----------------------------
    // WEBGL
    // -----------------------------

    try {

        webglAddon =
            new WebglAddon
                .WebglAddon();


        terminal.loadAddon(
            webglAddon
        );


        webglAddon.onContextLoss(
            () => {

                console.warn(
                    "WEBGL CONTEXT LOST"
                );


                try {

                    webglAddon.dispose();

                } catch (_) {}


                webglAddon = null;
            }
        );


        console.log(
            "XTERM WEBGL ACTIVE"
        );


    } catch (error) {

        console.warn(
            "WebGL unavailable",
            error
        );
    }


    // -----------------------------
    // Calculate dimensions ONCE
    // -----------------------------

    requestAnimationFrame(() => {

        requestAnimationFrame(() => {

            fitTerminalWithinBudget();


            lockedCols =
                terminal.cols;


            lockedRows =
                terminal.rows;


            console.log(
                `LOCKED TERMINAL: ${lockedCols}x${lockedRows}`
            );


            status.textContent =
                `CONNECTING ${lockedCols}×${lockedRows}`;


            connectMainframe(
                lockedCols,
                lockedRows
            );

        });
    });
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


    // Start from base font.
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


    if (scale > 1) {

        terminal.options.fontSize =
            Math.ceil(
                11 * scale
            );


        fitAddon.fit();
    }


    console.log(
        "TERMINAL SIZE:",
        `${terminal.cols}x${terminal.rows}`,
        "FONT:",
        terminal.options.fontSize
    );
}


// ======================================================
// MAINFRAME CONNECTION
// ======================================================

function connectMainframe(
    cols,
    rows
) {

    const protocol =

        location.protocol === "https:"

            ? "wss"

            : "ws";


    const url =
        `${protocol}://${location.host}/ws?cols=${cols}&rows=${rows}`;


    console.log(
        "Connecting:",
        url
    );


    ws =
        new WebSocket(url);


    ws.binaryType =
        "arraybuffer";


    // --------------------------------
    // OPEN
    // --------------------------------

    ws.onopen = () => {

        console.log(
            `MAINFRAME CONNECTED ${cols}x${rows}`
        );


        status.textContent =
            `MAINFRAME ${cols}×${rows}`;
    };


    // --------------------------------
    // DATA
    // --------------------------------

    ws.onmessage =
        async event => {


            // -------------------------
            // PTY binary data
            // -------------------------

            if (
                event.data
                instanceof ArrayBuffer
            ) {

                const bytes =
                    new Uint8Array(
                        event.data
                    );


                // Detect when main.rs
                // actually switches into
                // terminal render mode.
                if (!rendererStarted) {

                    const text =
                        ansiDecoder.decode(
                            bytes,
                            {
                                stream: true
                            }
                        );


                    startupProbe =
                        (
                            startupProbe +
                            text
                        )
                        .slice(-512);


                    // main.rs sends:
                    // ESC [?1049h
                    //
                    // when entering alternate
                    // terminal screen.
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
                            mode === "full"
                        ) {

                            await startAudio();
                        }
                    }
                }


                queueTerminalData(
                    event.data
                );


                return;
            }


            // -------------------------
            // Text server messages
            // -------------------------

            if (
                typeof event.data ===
                "string"
            ) {

                terminal.write(
                    event.data
                );
            }
        };


    // --------------------------------
    // ERROR
    // --------------------------------

    ws.onerror = error => {

        console.error(
            "MAINFRAME ERROR",
            error
        );


        stopAudio();


        status.textContent =
            "MAINFRAME ERROR";
    };


    // --------------------------------
    // CLOSE
    // --------------------------------

    ws.onclose = event => {

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
            state === "playing"
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
// SCHEDULE FLUSH
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
// FLUSH TO XTERM
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


    let offset = 0;


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


    pendingChunks = [];
    pendingBytes = 0;


    terminalWriteBusy =
        true;


    terminal.write(
        combined,
        () => {

            terminalWriteBusy =
                false;


            if (
                pendingBytes > 0
            ) {

                scheduleTerminalFlush();
            }
        }
    );
}


// ======================================================
// AUDIO
// ======================================================

async function startAudio() {

    if (
        mode !== "full" ||
        audioStarted
    ) {
        return;
    }


    try {

        audio.currentTime = 0;

        audio.muted = false;


        await audio.play();


        audioStarted =
            true;


        console.log(
            "AUDIO STARTED"
        );


        updateAudioDisplay();


    } catch (error) {

        console.warn(
            "Audio could not start:",
            error
        );


        audioControl.textContent =
            "[M] AUDIO: ENABLE";
    }
}


function stopAudio() {

    audio.pause();


    try {

        audio.currentTime = 0;

    } catch (_) {}


    audioStarted =
        false;


    updateAudioDisplay();
}


async function toggleAudio() {

    // Visual mode has no soundtrack.
    if (
        mode === "visual"
    ) {

        mode = "full";


        try {

            audio.currentTime = 0;

            audio.muted = false;


            await audio.play();


            audioStarted =
                true;


        } catch (error) {

            console.warn(
                "Audio start failed:",
                error
            );
        }


        updateAudioDisplay();

        return;
    }


    // Keep audio timeline running.
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

        } catch (error) {

            console.warn(
                "Audio start failed:",
                error
            );
        }
    }


    updateAudioDisplay();
}


function updateAudioDisplay() {

    if (!audioControl) {
        return;
    }


    if (
        mode === "visual"
    ) {

        audioControl.textContent =
            "[M] AUDIO: OFF";

        return;
    }


    audioControl.textContent =

        audio.muted

            ? "[M] AUDIO: MUTED"

            : "[M] AUDIO: ON";
}


// ======================================================
// DESTROY TERMINAL / WS
// ======================================================

function destroyRenderer() {

    // -------------------------
    // WebSocket
    // -------------------------

    if (ws) {

        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;


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


        ws = null;
    }


    // -------------------------
    // WebGL
    // -------------------------

    if (webglAddon) {

        try {

            webglAddon.dispose();

        } catch (_) {}


        webglAddon =
            null;
    }


    // -------------------------
    // Terminal
    // -------------------------

    if (terminal) {

        try {

            terminal.dispose();

        } catch (_) {}


        terminal =
            null;
    }


    fitAddon =
        null;


    // -------------------------
    // Buffers
    // -------------------------

    pendingChunks = [];
    pendingBytes = 0;

    writeScheduled = false;
    terminalWriteBusy = false;


    lockedCols = 0;
    lockedRows = 0;
}


// ======================================================
// EXIT EXPERIENCE
// ======================================================

async function exitExperience() {

    if (
        state !== "playing"
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


    playerScreen.classList.add(
        "hidden"
    );


    modeScreen.classList.remove(
        "hidden"
    );


    status.textContent =
        "STANDBY";


    state =
        "mode";


    // Fullscreen logic disabled for now.
}


// ======================================================
// KEYBOARD
// ======================================================

document.addEventListener(
    "keydown",
    async event => {

        const key =
            event.key.toLowerCase();


        // -------------------------
        // READY
        // -------------------------

        if (
            state === "ready" &&
            event.key === "Enter"
        ) {

            enterSystem();

            return;
        }


        // -------------------------
        // MODE
        // -------------------------

        if (
            state === "mode"
        ) {

            if (
                key === "1"
            ) {

                selectMode(
                    "visual"
                );

                return;
            }


            if (
                key === "2"
            ) {

                selectMode(
                    "full"
                );

                return;
            }


            if (
                event.key === "Enter"
            ) {

                await startExperience();

                return;
            }
        }


        // -------------------------
        // PLAYING
        // -------------------------

        if (
            state === "playing"
        ) {

            if (
                key === "m"
            ) {

                await toggleAudio();

                return;
            }


            if (
                key === "q"
            ) {

                await exitExperience();

                return;
            }
        }
    }
);


// ======================================================
// BUTTON EVENTS
// ======================================================

enterButton.addEventListener(
    "click",
    enterSystem
);


audioControl.addEventListener(
    "click",
    toggleAudio
);


// -----------------------------
// CLICKABLE Q EXIT
// -----------------------------

if (exitControl) {

    exitControl.addEventListener(
        "click",
        exitExperience
    );


    exitControl.addEventListener(
        "keydown",
        async event => {

            if (
                event.key === "Enter" ||
                event.key === " "
            ) {

                event.preventDefault();

                await exitExperience();
            }
        }
    );
}


// ======================================================
// IMPORTANT:
// NO resize FitAddon during playback yet.
//
// xterm and PTY must remain exactly
// the same dimensions once started.
// ======================================================


// ======================================================
// INITIALIZE
// ======================================================

selectMode(
    "full"
);

boot();