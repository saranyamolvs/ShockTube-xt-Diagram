# ShockTube-xt-Diagram

A small browser-based GUI for drawing simplified shock-tube x-t diagrams.

## Features

- Interactive inputs for tube lengths, incident shock speed, contact surface speed, expansion fan speeds, and reflected wave speeds.
- Position (`x`) is plotted on the horizontal axis with values increasing to the right; time (`t`) is plotted on the vertical axis with values increasing upward.
- Driven-end boundary selector:
  - **Closed end** plots a reflected shock from the driven end.
  - **Open end** plots a reflected expansion wave from the driven end and does not plot a reflected shock.
- Enter one or more comma-separated sensor locations and plot pressure, temperature, and density histories versus time for every selected sensor.
- Configure initial pressure/temperature/density plus post-shock, contact-region, and reflected-wave property ratios for the time-history plots.
- Download the current x-t diagram and the sensor-history plots as SVG images, or save them as JPG images. Browsers that support the File System Access API prompt for a file or folder location; other browsers fall back to standard downloads.

## Run locally

Open `index.html` directly in a browser, or serve the folder with any static file server:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

## Model notes

This tool is intended for quick x-t diagram construction and visualization. It uses user-supplied characteristic speeds and draws straight characteristic lines from the diaphragm or the driven-end reflection point. Sensor histories are simplified piecewise traces: property values change when the incident shock, contact surface, expansion fan, or reflected wave reaches each sensor location. For design-critical calculations, verify the wave speeds and thermodynamic states with a validated gas-dynamics solver or experiment-specific analysis.
