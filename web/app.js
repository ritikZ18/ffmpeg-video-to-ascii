const bootScreen = document.querySelector("#boot-screen");
const bootLog = document.querySelector("#boot-log");
const readyPanel = document.querySelector("#ready-panel");

const modeScreen = document.querySelector("#mode-screen");
const playerScreen = document.querySelector("#player-screen");

const enterButton = document.querySelector("#enter-button");

const audio = document.querySelector("#audio");
const audioControl = document.querySelector("#audio-control");
const status = document.querySelector("#status");

let state = "boot";
let mode = "full";
let audioEnabled = true;


// ----------------------------
// BOOT
// ----------------------------

const bootMessages = [
    "RUST//FRAME TERMINAL v0.1",
    "",
    "> initializing runtime...",
    "> ffmpeg pipeline .............. OK",
    "> rgb24 decoder ................ OK",
    "> ansi renderer ................ OK",
    "> websocket interface .......... STANDBY",
    "> audio subsystem .............. OK",
    "",
    "INITIALIZATION COMPLETE."
];


async function boot() {

    for (const line of bootMessages) {

        bootLog.textContent += line + "\n";

        await sleep(
            line === ""
                ? 120
                : 150 + Math.random() * 220
        );
    }

    await sleep(400);

    readyPanel.classList.remove("hidden");
    state = "ready";
}


function sleep(ms) {

    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}


// ----------------------------
// ENTER SYSTEM
// ----------------------------

function enterSystem() {

    if (state !== "ready")
        return;

    state = "mode";

    bootScreen.classList.add("hidden");
    modeScreen.classList.remove("hidden");
}


// ----------------------------
// MODE
// ----------------------------

function selectMode(selectedMode) {

    mode = selectedMode;

    document
        .querySelectorAll("[data-mode]")
        .forEach(option => {

            option.classList.toggle(
                "selected",
                option.dataset.mode === mode
            );

            const prefix =
                option.dataset.mode === mode
                    ? "> "
                    : "";

            option.dataset.prefix = prefix;
        });
}


async function startExperience() {

    state = "playing";

    modeScreen.classList.add("hidden");
    playerScreen.classList.remove("hidden");

    status.textContent = "RENDERER ACTIVE";


    if (mode === "full") {

        audioEnabled = true;

        audio.currentTime = 0;

        try {

            await audio.play();

        } catch (error) {

            console.warn(
                "Browser prevented audio:",
                error
            );
        }

    } else {

        audioEnabled = false;

        audio.pause();
        audio.currentTime = 0;
    }

    updateAudioDisplay();
}


// ----------------------------
// AUDIO
// ----------------------------

async function toggleAudio() {

    audioEnabled = !audioEnabled;

    if (audioEnabled) {

        try {
            await audio.play();
        } catch (_) {}

    } else {

        audio.pause();
    }

    updateAudioDisplay();
}


function updateAudioDisplay() {

    audioControl.textContent =
        audioEnabled
            ? "[M] AUDIO: ON"
            : "[M] AUDIO: MUTED";
}


// ----------------------------
// KEYBOARD
// ----------------------------

document.addEventListener(
    "keydown",
    async event => {

        const key = event.key.toLowerCase();


        if (
            state === "ready" &&
            event.key === "Enter"
        ) {

            enterSystem();
            return;
        }


        if (state === "mode") {

            if (key === "1") {

                selectMode("visual");
                return;
            }

            if (key === "2") {

                selectMode("full");
                return;
            }

            if (event.key === "Enter") {

                await startExperience();
                return;
            }
        }


        if (state === "playing") {

            if (key === "m") {

                await toggleAudio();
                return;
            }

            if (key === "q") {

                audio.pause();

                playerScreen.classList.add(
                    "hidden"
                );

                modeScreen.classList.remove(
                    "hidden"
                );

                state = "mode";

                return;
            }
        }
    }
);


enterButton.addEventListener(
    "click",
    enterSystem
);


audioControl.addEventListener(
    "click",
    toggleAudio
);


boot();