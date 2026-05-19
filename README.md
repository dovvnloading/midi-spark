

# Midi Spark

<img width="1568" height="891" alt="image" src="https://github.com/user-attachments/assets/be62c0bd-ae6c-47f6-bde2-9f0f0e0cb93a" />



Midi Spark is a mathematical MIDI generation tool for exploring chord progressions, rhythmic complexity, and dissonance. It lets you generate, edit, preview, import, and export rich MIDI sequences using built-in synthesizers and an interactive piano roll.

## Features

### Algorithmic MIDI Generation

Generate unique chord progressions by adjusting musical parameters such as:

* Root key
* Scale or mode
* Chord tension
* Dissonance
* Groove complexity

### Interactive Piano Roll

Edit MIDI sequences directly on a grid-based piano roll with support for:

* Drawing notes
* Selecting notes
* Chopping notes
* Stamping common chords and scales
* Fine-tuning timing and pitch

### Advanced Editing Tools

Midi Spark includes editing features designed for fast musical iteration:

* Drag notes to move them
* Resize note durations
* Slice note segments
* Use lasso selection for batch edits
* Safely experiment with undo and redo

### Built-In Sound Engine

Preview your sequences using a built-in Tone.js sound engine with five synthesizer presets:

* Classic Analog
* Electric Piano
* Atmospheric Pad
* Modern Pluck
* Dreamwave

Each preset includes its own effect chain for polished playback inside the browser.

### MIDI Import and Export

Midi Spark supports standard MIDI workflows:

* Drag and drop existing MIDI files into the app
* Analyze and modify imported MIDI sequences
* Export generated sequences as `.mid` files
* Use exported MIDI files in your preferred DAW

## Technology Stack

* **Frontend:** React 19, Vite
* **Styling:** Tailwind CSS 4
* **Audio Engine:** Tone.js
* **Music Theory:** Tonal.js
* **MIDI Handling:** midi-writer-js, @tonejs/midi

## Getting Started

### Prerequisites

Make sure you have the following installed:

* Node.js 20 or higher
* npm

### Installation

Clone the repository:

```bash
git clone <repository-url>
cd midi-spark
```

Install dependencies:

```bash
npm install
```

### Running the Development Server

Start the local development server:

```bash
npm run dev
```

Open the app in your browser:

```text
http://localhost:3000
```

### Building for Production

Create a production build:

```bash
npm run build
```

The compiled files will be generated in the `dist` directory.

Preview the production build locally:

```bash
npm run preview
```

## Usage

### 1. Choose a Musical Foundation

Use the left sidebar to select the root key and mode, such as major or minor.

### 2. Adjust Generation Parameters

Use the available controls to shape the generated MIDI sequence:

* Increase **Chord Tension** to introduce more harmonic complexity and dissonance.
* Increase **Groove Complexity** to add rhythmic syncopation and variation.

### 3. Generate a Progression

Click **Generate Chord Progression** to create a base sequence.

Use **Add Rhythmic Variation** to evolve the progression and introduce additional movement.

### 4. Edit in the Piano Roll

Use the top toolbar to switch between editing modes:

* Draw
* Select
* Stamp
* Cut

Interact directly with the piano roll to modify notes, timing, rhythm, and harmony.

### 5. Preview Playback

Use the transport controls to listen to your sequence:

* Play
* Stop
* Loop
* Timeline scrubbing

You can also switch instruments from the preset dropdown to preview different sound palettes.

### 6. Export MIDI

Click the download button in the piano roll sidebar to export the current sequence as a `.mid` file.

The exported file can be imported into a DAW for further arrangement, production, or mixing.

## Project Scripts

### `npm run dev`

Starts the local development server.

### `npm run build`

Builds the app for production.

### `npm run preview`

Previews the production build locally.

## License

MIT License

Designed and developed by Matthew Wensey.
