# ShockTube-xt-Diagram

A small browser-based GUI for drawing simplified shock-tube x-t diagrams.

## Features

- Interactive inputs for tube lengths, incident shock speed, contact surface speed, expansion fan speeds, and reflected/release wave speeds.
- Position (`x`) is plotted on the horizontal axis with values increasing to the right; time (`t`) is plotted on the vertical axis with values increasing upward.
- Driven-end boundary selector:
  - **Closed end** plots a reflected shock from the driven end.
  - **Open end** lets the incident shock reach the open boundary and exit to atmosphere; no reflected shock is plotted, only the returning pressure-release expansion characteristic.
- Enter one or more comma-separated sensor locations and plot pressure, temperature, and density histories versus time for every selected sensor.
- Configure initial pressure/temperature/density plus post-shock, contact-region, and closed-reflection/open-release property ratios for the time-history plots.
- Download the current x-t diagram and the sensor-history plots as SVG images, or save them as JPG images. Browsers that support the File System Access API prompt for a file or folder location; other browsers fall back to standard downloads.

## Run locally

Open `index.html` directly in a browser, or serve the folder with any static file server:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

## Model notes

This tool is intended for quick x-t diagram construction and visualization. It uses user-supplied characteristic speeds and draws straight characteristic lines from the diaphragm, closed-end reflection point, or open-end pressure-release point. Sensor histories are simplified piecewise traces: property values change when the incident shock, contact surface, expansion fan, a closed reflected shock or an open-end pressure-release expansion reaches each sensor location. For design-critical calculations, verify the wave speeds and thermodynamic states with a validated gas-dynamics solver or experiment-specific analysis.

## Shadowgraph preprocessing and SPOD workflow

This repository also includes a command-line pipeline for the Mach 1.5 impinging-jet shadowgraph campaign. It is designed for the folder structure:

```text
RP/
  hD2/
    NPR2p5/*.tif
    NPR3p67/*.tif
    NPR5/*.tif
  hD4/
  hD6/
  hD8/
  hD10/
  hD12/
  hD20/
```

The script writes results to a separate output folder so the raw TIFF files are never overwritten.

### Install analysis dependencies

```bash
python3 -m pip install -r requirements-spod.txt
```

### Run the full analysis

Replace the frame rate with the actual high-speed-camera acquisition rate used for the shadowgraph images. The frame rate is required so SPOD frequencies are reported in Hz.

```bash
python3 scripts/shadowgraph_spod_pipeline.py \
  --input-root /path/to/RP \
  --output-root /path/to/SPOD_results \
  --frame-rate 100000 \
  --nperseg 128 \
  --overlap 0.5 \
  --modes 5
```

For a quick dry run on the first 50 frames of every case:

```bash
python3 scripts/shadowgraph_spod_pipeline.py \
  --input-root /path/to/RP \
  --output-root /path/to/SPOD_results_test \
  --frame-rate 100000 \
  --max-frames 50
```

### Outputs saved for each h/D and NPR case

Each case folder, for example `SPOD_results/hD6/NPR3p67/`, contains:

- `preprocessing/mean_raw.png`, `mean_enhanced.png`, `rms_enhanced.png`, `dark_percentile.png`, and `flat_median.png` for documentation of image clarity improvements.
- `enhanced_frames/` and `sample_frames/` with contrast-enhanced TIFF/PNG frames for visual inspection and publication panels.
- `pod_energy.csv` and `pod_modes/` for snapshot POD energy fractions and spatial modes.
- `spod_eigenvalues.csv`, `spod_spectrum.png`, and `spod_modes_at_peak/` for SPOD spectra and leading spatial mode shapes at the dominant mode-1 frequency.
- `metadata.json` recording the case name, image shape, frame rate, SPOD block size, overlap, and dominant frequency.

The output root also contains `case_summary.csv` and `run_metadata.json` so all NPR and h/D conditions can be compared across the full test matrix.

### Preprocessing method

The pipeline converts TIFFs to grayscale, estimates a dark/background percentile image, applies flat-field correction using the temporal median, performs robust percentile normalization, denoises lightly with a Gaussian filter, and applies CLAHE contrast enhancement. This sequence is intended to improve shadowgraph clarity before SPOD without changing the original data.

### Publication checks to report

For a journal-quality dataset, record the camera frame rate, exposure time, pixel scale, number of frames per case, SPOD block length (`--nperseg`), overlap, window type, and whether the saved mode shapes are dimensional or normalized. The script uses a Hann window and Welch-style blocks for SPOD.
