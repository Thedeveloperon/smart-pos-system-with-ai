const CONFIRMATION_SOUND_KEY = "smartpos-confirmation-sounds-enabled";
const LEGACY_CART_ADD_SOUND_KEY = "smartpos-cart-add-sound-enabled";

let sharedAudioContext: AudioContext | null = null;
let sharedMasterGain: GainNode | null = null;

function getAudioContext() {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextCtor = window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) {
    return null;
  }

  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContextCtor();
  }

  if (!sharedMasterGain) {
    sharedMasterGain = sharedAudioContext.createGain();
    sharedMasterGain.gain.value = 0.045;
    sharedMasterGain.connect(sharedAudioContext.destination);
  }

  return sharedAudioContext;
}

function ensureEnabledState() {
  if (typeof window === "undefined") {
    return true;
  }

  const stored = window.localStorage.getItem(CONFIRMATION_SOUND_KEY);
  if (stored !== null) {
    return stored === "true";
  }

  const legacyStored = window.localStorage.getItem(LEGACY_CART_ADD_SOUND_KEY);
  if (legacyStored !== null) {
    window.localStorage.setItem(CONFIRMATION_SOUND_KEY, legacyStored);
    return legacyStored === "true";
  }

  return true;
}

export function isConfirmationSoundEnabled() {
  return ensureEnabledState();
}

export function setConfirmationSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CONFIRMATION_SOUND_KEY, String(enabled));
  window.localStorage.setItem(LEGACY_CART_ADD_SOUND_KEY, String(enabled));
}

export async function primeConfirmationSound() {
  if (!ensureEnabledState()) {
    return;
  }

  const audioContext = getAudioContext();
  if (!audioContext || audioContext.state !== "suspended") {
    return;
  }

  try {
    await audioContext.resume();
  } catch {
    // Best effort only. Playback will retry on the next user gesture.
  }
}

export async function primeCartAddSound() {
  await primeConfirmationSound();
}

function createEnvelope(audioContext: AudioContext, startTime: number, duration: number, peak = 0.3) {
  const envelope = audioContext.createGain();
  envelope.gain.setValueAtTime(0.0001, startTime);
  envelope.gain.exponentialRampToValueAtTime(peak, startTime + 0.01);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  envelope.connect(sharedMasterGain!);
  return envelope;
}

function playTone(profile: {
  primaryType: OscillatorType;
  primaryStartFrequency: number;
  primaryEndFrequency: number;
  primaryDuration: number;
  accentType?: OscillatorType;
  accentStartFrequency?: number;
  accentEndFrequency?: number;
  accentOffset?: number;
  accentDuration?: number;
  envelopeDuration?: number;
  peak?: number;
}) {
  if (!ensureEnabledState()) {
    return;
  }

  const audioContext = getAudioContext();
  if (!audioContext || !sharedMasterGain) {
    return;
  }

  if (audioContext.state === "suspended") {
    void audioContext.resume().catch(() => {
      // Best effort only. Playback will retry on the next user gesture.
    });
    return;
  }

  const startTime = audioContext.currentTime;
  const envelope = createEnvelope(audioContext, startTime, profile.envelopeDuration ?? profile.primaryDuration + 0.03, profile.peak ?? 0.3);

  const primary = audioContext.createOscillator();
  primary.type = profile.primaryType;
  primary.frequency.setValueAtTime(profile.primaryStartFrequency, startTime);
  primary.frequency.exponentialRampToValueAtTime(profile.primaryEndFrequency, startTime + profile.primaryDuration);
  primary.connect(envelope);

  let accent: OscillatorNode | null = null;
  if (profile.accentType && profile.accentStartFrequency && profile.accentEndFrequency) {
    accent = audioContext.createOscillator();
    accent.type = profile.accentType;
    accent.frequency.setValueAtTime(profile.accentStartFrequency, startTime + (profile.accentOffset ?? 0.03));
    accent.frequency.exponentialRampToValueAtTime(
      profile.accentEndFrequency,
      startTime + (profile.accentOffset ?? 0.03) + (profile.accentDuration ?? 0.09)
    );
    accent.connect(envelope);
    accent.start(startTime + (profile.accentOffset ?? 0.03));
    accent.stop(startTime + (profile.accentOffset ?? 0.03) + (profile.accentDuration ?? 0.09));
  }

  primary.start(startTime);
  primary.stop(startTime + profile.primaryDuration);

  const cleanup = () => {
    primary.disconnect();
    accent?.disconnect();
    envelope.disconnect();
  };

  primary.onended = cleanup;
}

export async function playCartAddSound() {
  playTone({
    primaryType: "sine",
    primaryStartFrequency: 880,
    primaryEndFrequency: 990,
    primaryDuration: 0.16,
    accentType: "triangle",
    accentStartFrequency: 1320,
    accentEndFrequency: 1760,
    accentOffset: 0.03,
    accentDuration: 0.09,
    envelopeDuration: 0.19,
    peak: 0.28,
  });
}

export async function playSaleCompleteSound() {
  playTone({
    primaryType: "triangle",
    primaryStartFrequency: 784,
    primaryEndFrequency: 1046.5,
    primaryDuration: 0.22,
    accentType: "sine",
    accentStartFrequency: 1174.66,
    accentEndFrequency: 1567.98,
    accentOffset: 0.07,
    accentDuration: 0.09,
    envelopeDuration: 0.24,
    peak: 0.24,
  });
}

export async function playCashCountSound() {
  playTone({
    primaryType: "sine",
    primaryStartFrequency: 659.25,
    primaryEndFrequency: 784,
    primaryDuration: 0.14,
    accentType: "triangle",
    accentStartFrequency: 987.77,
    accentEndFrequency: 1174.66,
    accentOffset: 0.02,
    accentDuration: 0.07,
    envelopeDuration: 0.17,
    peak: 0.22,
  });
}
