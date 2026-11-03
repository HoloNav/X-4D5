# X-4D5

**A performance-focused virtual synthesizer by S.E.N.S.E.**

X-4D5 is an original browser-based synthesizer project. It is being developed as a playable software instrument, with a tactile hardware-inspired interface and a deep, editable subtractive/wavetable synthesis architecture.

## Run it

Open `index.html` in a modern desktop or mobile browser. For the most reliable audio behavior and deployment, serve the folder from a local or hosted web server. Tap or click a key once to unlock browser audio.

## Current build — 0.1 foundation

- Three independently configurable oscillators (saw, square, triangle, sine)
- 18-voice allocation target with voice stealing
- Noise and sub-oscillator sources
- Oscillator mixer and master level
- Resonant low-pass, band-pass, and high-pass filtering
- Amp ADSR envelope
- LFO with pitch, cutoff, and amplitude destinations
- Chorus and algorithmic reverb
- Touch, mouse, and computer-keyboard performance
- Starter patches and local user patch saving
- Responsive instrument-panel interface

## Development roadmap

1. **Core voice engine:** refine oscillator modes, phase behavior, envelopes, dual filters, voice allocation, and modulation routing.
2. **Oscillator expansion:** wavetable playback, additional digital waveforms, sync, ring modulation, and per-oscillator modulation.
3. **Modulation architecture:** multiple envelopes and LFOs, velocity, key tracking, mod wheel, and a configurable modulation matrix.
4. **Performance system:** arpeggiator, chord memory, performance/animate controls, MIDI input, and patch management.
5. **Effects rack:** expanded insert effects, routing, and per-patch effect chains.
6. **Preset system and polish:** import/export, categorized factory sounds created for X-4D5, accessibility, mobile tuning, and deployment.

## Design principles

- Original S.E.N.S.E. identity, interface artwork, code, and presets.
- No copied proprietary firmware, factory patches, samples, or artwork from other instruments.
- Build the sound engine and signal flow as documented, testable software components.
- Keep the instrument usable on both phones and computers.

## Status

Early playable foundation. The roadmap describes planned work; not every listed feature is implemented yet.
