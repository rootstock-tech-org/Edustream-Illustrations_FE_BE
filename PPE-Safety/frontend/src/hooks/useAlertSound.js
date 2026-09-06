import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Audible alert, in the operator's browser — a chime, then a voice.
 *
 * The backend has an alarm, but it beeps on whichever machine is running the
 * AI — a server in a rack, or a Google datacentre when the model runs on
 * Colab. Nobody hears it. The only speaker that matters is the one next to
 * the person who has to react, so the sound belongs here.
 *
 * A beep says *that* something is wrong; the voice says *what*: the page
 * hands over the situation in words and it is announced as
 * "Alert! <situation>. Needs attention." — so an operator looking away
 * learns what happened without walking back to the screen. The message is
 * whatever the page currently reports, so a door left open announces the
 * door, missing gear announces the gear.
 *
 * Spoken with the browser's own voice (the Web Speech API): nothing to
 * install, no audio files to ship, works offline on machines with local
 * voices. Where no voice is available the chime alone still sounds — a
 * degraded alarm, never a silent one.
 *
 * Browsers refuse to play audio until the user has interacted with the page.
 * By the time an alert can fire the operator has pressed "Start watching",
 * so the context is resumed on that gesture and on the first click anywhere.
 */

const MUTE_KEY = "plant-safety.alert-sound-muted";

/** Two rising tones — distinct from a notification chime, hard to ignore. */
const PATTERN = [
  { frequency: 880, start: 0, duration: 0.18 },
  { frequency: 1245, start: 0.22, duration: 0.28 },
];

/**
 * Two *falling* tones, quieter and lower — the camera going blind.
 *
 * Deliberately the alarm's shape inverted. An operator who is not looking at
 * the screen has to be able to tell "somebody is in danger" from "the AI
 * stopped being able to see", and by ear the only thing available is the
 * contour. Rising and urgent, or falling and calm.
 */
const NOTICE_PATTERN = [
  { frequency: 660, start: 0, duration: 0.16 },
  { frequency: 494, start: 0.18, duration: 0.26 },
];

/** How often the chime alone repeats when no voice is available, in ms. */
const REPEAT_MS = 2500;

/**
 * How often the announcement repeats while an alert is still standing, in
 * ms. Longer than the bare chime's interval: a sentence every two and a
 * half seconds is not an alarm, it is a wall of noise. Each repeat speaks
 * the situation as it is *now*, so a door open for a minute announces the
 * minute.
 */
const SPEECH_REPEAT_MS = 12000;

/**
 * How often "I cannot see" repeats while it is still true, in ms.
 *
 * Ten times the alert interval, and the number this phase most easily gets
 * wrong in either direction.
 *
 * Saying it once is what the old code did with everything — and silence
 * reading as safety is the defect the whole phase exists to remove. An
 * operator who walks in five minutes after a camera went dark would learn
 * nothing, and the screen would look exactly like a quiet shift.
 *
 * Saying it every twelve seconds, as a standing violation does, is worse. A
 * standing violation is a thing to go and fix in the next few seconds; a dark
 * camera is a condition that persists for as long as it takes somebody to
 * change a light or clean a lens, and an alarm that talks over that whole
 * period is one an operator mutes — taking the real alarm with it.
 *
 * Two minutes: heard within a couple of minutes of walking back in, four or
 * five times across a ten-minute outage rather than fifty. It is also
 * re-spoken immediately whenever the *reason* changes, so going from dark to
 * blurred is heard when it happens rather than up to two minutes later.
 */
const UNVERIFIED_REPEAT_MS = 120000;

let sharedContext = null;

function audioContext() {
  if (typeof window === "undefined") return null;

  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;

  if (!sharedContext) sharedContext = new Ctor();
  return sharedContext;
}

/** Unlock audio on the first interaction, whatever it happens to be. */
if (typeof window !== "undefined") {
  const unlock = () => {
    const ctx = audioContext();
    if (ctx?.state === "suspended") ctx.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

function speechAvailable() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window
  );
}

/**
 * Play the alert tone once.
 *
 * Kept even now voice carries the content: it cuts through before the first
 * word lands, and it is the whole alarm on a machine with no voices.
 */
export function playAlertTone(volume = 0.25) {
  playPattern(PATTERN, volume);
}

/**
 * The camera-cannot-see tone. Quieter and falling, so it is unmistakably not
 * the alarm even to somebody facing the other way.
 */
export function playNoticeTone(volume = 0.14) {
  playPattern(NOTICE_PATTERN, volume);
}

function playPattern(pattern, volume) {
  const ctx = audioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const now = ctx.currentTime;

  pattern.forEach(({ frequency, start, duration }) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "square";
    oscillator.frequency.value = frequency;

    // Ramped rather than switched, or the tone clicks at both ends.
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(volume, now + start + 0.02);
    gain.gain.setValueAtTime(volume, now + start + duration - 0.04);
    gain.gain.linearRampToValueAtTime(0, now + start + duration);

    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now + start);
    oscillator.stop(now + start + duration + 0.02);
  });
}

/**
 * Speak a sentence, replacing whatever is currently being spoken.
 *
 * One live utterance at a time: without the cancel, repeats queue up and
 * play back to back — an alarm that ends five sentences after the operator
 * has already dealt with it.
 */
function speakNow(sentence) {
  try {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.lang = "en-US";
    utterance.rate = 1;

    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

/**
 * Say the situation out loud: "Alert! <situation>. Needs attention."
 *
 * The template is fixed and the middle comes from the caller, so every
 * capability announces its own facts without each page writing speech code.
 */
export function announceAlert(message) {
  if (!speechAvailable()) return false;

  const situation = String(message || "Something needs attention")
    .trim()
    .replace(/[.!\s]+$/, "");

  return speakNow(`Alert! ${situation}. Needs attention.`);
}

/**
 * Say a sentence exactly as given, without the alert template.
 *
 * For announcements whose whole wording is the point — the face module's
 * "Person recognized, Aman Verma" — where wrapping it in "Alert! ...
 * Needs attention." would bury the name the operator is listening for.
 */
export function announceVerbatim(sentence) {
  if (!speechAvailable()) return false;

  const text = String(sentence || "").trim();
  if (!text) return false;

  return speakNow(text);
}

/**
 * Sound and speak an alert for as long as `active` is true.
 *
 * @param {boolean} active whether something needs attention right now
 * @param {string} [message] the situation in words — usually the module's
 *   own summary. Read fresh at every repeat, so the announcement tracks a
 *   changing situation.
 * @param {{spoken?: string, unverified?: {active?: boolean, spoken?: string, resumed?: string}}} [options]
 *   `spoken` replaces the announcement with an exact sentence, skipping the
 *   "Alert! ..." template — for pages whose wording is prescribed, like face
 *   recognition's "Person recognized, <name>".
 *
 *   `unverified` is the third state: the picture could not be judged.
 *   `active` while that is true, `spoken` the sentence to say, and `resumed`
 *   the one sentence to say when it stops being true — pass `resumed` only
 *   while the module is genuinely watching again, so stopping the camera is
 *   not announced as a recovery.
 * @returns {{muted: boolean, setMuted: Function, supported: boolean, test: Function}}
 */
export function useAlertSound(active, message, options = {}) {
  const { spoken, unverified } = options;

  // An alarm outranks a notice: a standing violation is the thing to react
  // to, and the contract has the backend clearing `alert` when the picture
  // is unreadable anyway, so the two should never both be true.
  const blindActive = Boolean(unverified?.active) && !active;
  const blindSpoken = unverified?.spoken ?? "";
  const blindResumed = unverified?.resumed ?? "";

  const [muted, setMutedState] = useState(() => {
    try {
      return window.localStorage.getItem(MUTE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const timerRef = useRef(null);
  const blindTimerRef = useRef(null);

  // Whether the third state has already been announced. Drives the one
  // "can be checked again" line: without it, every page would say a camera
  // had recovered the moment it was first opened.
  const blindAnnouncedRef = useRef(false);

  // The interval below outlives any one render; it reads the message
  // through refs so each repeat announces the situation as it stands now,
  // not as it stood when the alert began.
  const messageRef = useRef(message);
  const spokenRef = useRef(spoken);

  useEffect(() => {
    messageRef.current = message;
    spokenRef.current = spoken;
  }, [message, spoken]);

  const setMuted = useCallback((value) => {
    setMutedState(value);
    try {
      window.localStorage.setItem(MUTE_KEY, String(value));
    } catch {
      // Private browsing. The preference simply does not survive a reload.
    }
  }, []);

  useEffect(() => {
    if (!active || muted) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      // Cut a sentence off mid-word rather than let it finish describing a
      // problem that no longer exists.
      if (speechAvailable()) window.speechSynthesis.cancel();
      return undefined;
    }

    const voiced = speechAvailable();

    const sound = () => {
      playAlertTone();
      if (!voiced) return;

      if (spokenRef.current) {
        announceVerbatim(spokenRef.current);
      } else {
        announceAlert(messageRef.current);
      }
    };

    // Once immediately, then repeated: an operator who stepped away needs to
    // hear it when they come back, not only at the moment it started.
    sound();
    timerRef.current = setInterval(sound, voiced ? SPEECH_REPEAT_MS : REPEAT_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (speechAvailable()) window.speechSynthesis.cancel();
    };
  }, [active, muted]);

  /**
   * "I cannot see."
   *
   * Declared after the alert effect so that on a frame where an alert ends
   * and the picture goes unreadable at once, the alarm's `cancel()` runs
   * first and this is what the operator actually hears.
   */
  useEffect(() => {
    const stopRepeating = () => {
      if (blindTimerRef.current) {
        clearInterval(blindTimerRef.current);
        blindTimerRef.current = null;
      }
    };

    if (muted) {
      stopRepeating();
      // Not cleared: muting is not the camera recovering. Unmuting while
      // still blind announces it again, which is what an operator turning
      // the sound back on is asking for.
      return undefined;
    }

    if (!blindActive) {
      stopRepeating();

      // Said once, and only when the caller can confirm the module is
      // watching again — a stopped camera passes no `resumed` line, so
      // switching off is not announced as good news. This closes the loop
      // that "cannot check" opened, so silence means what it used to mean.
      if (blindAnnouncedRef.current && blindResumed) {
        announceVerbatim(blindResumed);
      }

      blindAnnouncedRef.current = false;
      return undefined;
    }

    const say = () => {
      playNoticeTone();
      announceVerbatim(blindSpoken);
    };

    // Immediately, then rarely. Re-runs — and so speaks again at once —
    // whenever the reason itself changes, because a camera that went from
    // dark to blurred is new information.
    say();
    blindAnnouncedRef.current = true;
    blindTimerRef.current = setInterval(say, UNVERIFIED_REPEAT_MS);

    return stopRepeating;
  }, [blindActive, blindSpoken, blindResumed, muted]);

  const test = useCallback(() => {
    playAlertTone();
    announceAlert("This is a test announcement");
  }, []);

  return {
    muted,
    setMuted,
    supported: Boolean(audioContext()) || speechAvailable(),
    test,
  };
}

export default useAlertSound;
