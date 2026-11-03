# X-4D5 — S.E.N.S.E. Polyphonic Synthesizer

**[Launch the live browser synthesizer](https://holonav.github.io/X-4D5/)**

An original performance-focused software synthesizer by **S.E.N.S.E.** Built with Web Audio and designed for desktop and touch browsers.

## Current build — 0.2 repaired audio foundation

The original **0.1** implementation has been preserved in the GitHub branch `backup/v0.1-before-audio-repair`. Version 0.2 specifically repairs problems identified in a source-code audit while retaining the existing interface and factory-patch names.

### Repairs

- **Chorus routing:** The dry output now feeds the chorus delay; Rate and Mix controls change the live effect.
- **Filter:** Two cascaded biquad stages provide 24 dB/octave low-pass/high-pass options (plus band-pass); filter cutoff, resonance, type and pitch-based key tracking now update *currently sounding* voices.
- **Distortion:** Drive now uses a waveshaping curve rather than just amplifying volume.
- **Modulation:** LFO Rate, Depth, Wave and Destination can be changed live; modulation wheel adds depth, and portamento glides between notes. The old incorrectly labeled **PULSE WIDTH** destination is now honestly labeled **AMPLITUDE / TREMOLO**; oscillator PWM itself is a future feature.
- **Oscillators:** Waveform, octave and mixer level changes reach held notes.
- **Keyboard:** Repeated key presses make sound normally instead of toggling off; black notes align correctly in both octaves; pointer capture and note releases are more reliable; keyboard octave shifts apply to pointer/touch and computer performance.
- **Sequencer:** Audio notes are now placed on the Web Audio clock with a 120ms lookahead and a 25ms scheduler. Old note-offs and scheduled notes are cancelled/ended when stopping or using PANIC. AS PLAYED maintains chord-entry order. Select Arpeggiator or Step mode, then tap notes before PLAY.
- **18-voice handling:** Release tails count toward voice capacity; stealing uses a short fade; voice cleanup disconnects nodes. Noise uses a shared buffer instead of creating a new second-long buffer per note. Reverb impulse rebuilds on slider **release**, not every movement.
- **Patch library:** Saves and restores 24 controls (including effects, LFO, drive, glide, and performance settings) as well as oscillators. Earlier six-parameter patches remain loadable. Loading a saved patch no longer duplicates it in the preset selector.

### How to play

1. Press the on-screen keyboard, or use computer keys **A–K**. The browser audio engine starts on the first note.
2. Go to **PERFORM** to choose ARPEGGIATOR or 16-STEP SEQUENCER. Tap one or more notes, then select **PLAY**. Use **STOP** or **PANIC** to halt.
3. Switch to **SYNTH**, **MODULATION**, and **EFFECTS** to adjust the sound in real time.
4. Use **SAVE PATCH** to store user sounds in this browser. Saved patches appear under **PERFORM → PATCH MEMORY**.

### Verification and limits

`.github/workflows/engine-test.yml` runs JavaScript syntax checks and headless Chromium tests at **390×844 portrait**, **844×390 landscape**, and **740×360 landscape**. The tests verify repeat key presses, black-key geometry, Web Audio routing, live controls, saved-patch restoration, step/arp playback, PANIC, and voice allocation.

**Not yet implemented:** True wavetable oscillators, oscillator hard sync, ring modulation, native MIDI, a complete user-definable modulation matrix, and true PWM. The LFO amplifier destination is tremolo, not pulse-width modulation. The sequencer supports step enable/disable and a pitch-offset pattern, not full independent per-step note editing. The two cascaded biquads are a digital approximation rather than an analog component-level filter model.

Physical-device testing is still needed to assess latency, audio clicks, battery use, and browser-specific behavior.

This project is an independent original S.E.N.S.E. instrument; no third-party proprietary firmware, samples or patches have been copied.
