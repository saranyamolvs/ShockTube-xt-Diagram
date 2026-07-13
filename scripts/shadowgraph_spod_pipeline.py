#!/usr/bin/env python3
"""Preprocess shadowgraph TIFF image sequences and compute SPOD results.

Expected input layout by default:
  root/hD2/NPR2p5/*.tif
  root/hD2/NPR3p67/*.tif
  root/hD2/NPR5/*.tif
  root/hD4/...

The script writes one result folder per case containing enhanced frames, mean/RMS
images, sample frames, POD/SPOD modal products, spectra, and CSV summaries.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

import imageio.v3 as iio
import numpy as np

try:
    from scipy import signal
except ImportError as exc:  # pragma: no cover
    raise SystemExit("This pipeline requires scipy. Install with: python -m pip install scipy") from exc

try:
    from skimage import exposure, filters, img_as_ubyte
except ImportError as exc:  # pragma: no cover
    raise SystemExit("This pipeline requires scikit-image. Install with: python -m pip install scikit-image") from exc

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
except ImportError as exc:  # pragma: no cover
    raise SystemExit("This pipeline requires matplotlib. Install with: python -m pip install matplotlib") from exc

IMAGE_EXTS = {".tif", ".tiff"}
HD_RE = re.compile(r"^hD(?P<value>\d+(?:p\d+)?)$", re.IGNORECASE)
NPR_RE = re.compile(r"^NPR(?P<value>\d+(?:p\d+)?)$", re.IGNORECASE)


@dataclass(frozen=True)
class Case:
    hd_label: str
    hd: float
    npr_label: str
    npr: float
    path: Path


def label_to_float(label: str) -> float:
    return float(label.replace("p", "."))


def natural_key(path: Path) -> list[object]:
    parts = re.split(r"(\d+)", path.name)
    return [int(part) if part.isdigit() else part.lower() for part in parts]


def discover_cases(root: Path) -> list[Case]:
    cases: list[Case] = []
    for hd_dir in sorted((p for p in root.iterdir() if p.is_dir()), key=natural_key):
        hd_match = HD_RE.match(hd_dir.name)
        if not hd_match:
            continue
        for npr_dir in sorted((p for p in hd_dir.iterdir() if p.is_dir()), key=natural_key):
            npr_match = NPR_RE.match(npr_dir.name)
            if not npr_match:
                continue
            if any(child.suffix.lower() in IMAGE_EXTS for child in npr_dir.iterdir() if child.is_file()):
                cases.append(Case(hd_dir.name, label_to_float(hd_match.group("value")), npr_dir.name, label_to_float(npr_match.group("value")), npr_dir))
    return cases


def read_grayscale(path: Path) -> np.ndarray:
    image = iio.imread(path)
    arr = np.asarray(image)
    if arr.ndim == 3:
        arr = arr[..., :3].astype(np.float32).mean(axis=2)
    return arr.astype(np.float32)


def robust_normalize(image: np.ndarray, low: float, high: float) -> np.ndarray:
    lo, hi = np.percentile(image, (low, high))
    if not np.isfinite(lo) or not np.isfinite(hi) or hi <= lo:
        lo, hi = float(np.min(image)), float(np.max(image))
    if hi <= lo:
        return np.zeros_like(image, dtype=np.float32)
    return np.clip((image - lo) / (hi - lo), 0, 1).astype(np.float32)


def preprocess_stack(raw: np.ndarray, clahe_clip: float) -> tuple[np.ndarray, dict[str, np.ndarray]]:
    dark = np.percentile(raw, 2, axis=0)
    flat = np.median(raw, axis=0)
    flat_safe = np.where(np.abs(flat - dark) < 1e-6, 1.0, flat - dark)
    corrected = (raw - dark) / flat_safe
    corrected = np.asarray([robust_normalize(frame, 1, 99) for frame in corrected], dtype=np.float32)

    enhanced = []
    for frame in corrected:
        denoised = filters.gaussian(frame, sigma=0.65, preserve_range=True)
        equalized = exposure.equalize_adapthist(denoised, clip_limit=clahe_clip)
        enhanced.append(robust_normalize(equalized, 0.5, 99.5))
    enhanced_stack = np.asarray(enhanced, dtype=np.float32)

    diagnostics = {
        "dark_percentile": dark,
        "flat_median": flat,
        "mean_raw": raw.mean(axis=0),
        "mean_enhanced": enhanced_stack.mean(axis=0),
        "rms_enhanced": enhanced_stack.std(axis=0),
    }
    return enhanced_stack, diagnostics


def save_image(path: Path, image: np.ndarray, cmap: str = "gray") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    plt.figure(figsize=(7, 5), dpi=180)
    plt.imshow(image, cmap=cmap, origin="upper")
    plt.axis("off")
    plt.tight_layout(pad=0)
    plt.savefig(path, bbox_inches="tight", pad_inches=0)
    plt.close()


def save_tiff(path: Path, image: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    iio.imwrite(path, img_as_ubyte(np.clip(image, 0, 1)))


def temporal_pod(data: np.ndarray, modes: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    q = data - data.mean(axis=0, keepdims=True)
    u, s, vt = np.linalg.svd(q, full_matrices=False)
    return (s[:modes] ** 2) / max(data.shape[0] - 1, 1), u[:, :modes], vt[:modes]


def compute_spod(data: np.ndarray, fs: float, nperseg: int, overlap: float, modes: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    nt, nspace = data.shape
    nperseg = min(nperseg, nt)
    step = max(1, int(nperseg * (1 - overlap)))
    starts = list(range(0, nt - nperseg + 1, step)) or [0]
    window = signal.windows.hann(nperseg, sym=False)
    freqs = np.fft.rfftfreq(nperseg, d=1 / fs)
    blocks = []
    for start in starts:
        block = data[start:start + nperseg]
        if block.shape[0] < nperseg:
            pad = np.zeros((nperseg - block.shape[0], nspace), dtype=block.dtype)
            block = np.vstack([block, pad])
        block = block - block.mean(axis=0, keepdims=True)
        blocks.append(np.fft.rfft(block * window[:, None], axis=0))
    qhat = np.asarray(blocks)  # blocks, freqs, space

    eigenvalues = np.zeros((len(freqs), modes), dtype=np.float64)
    mode_shapes = np.zeros((len(freqs), modes, nspace), dtype=np.complex64)
    for fi in range(len(freqs)):
        x = qhat[:, fi, :] / math.sqrt(len(starts))
        u, s, vh = np.linalg.svd(x, full_matrices=False)
        keep = min(modes, len(s))
        eigenvalues[fi, :keep] = s[:keep] ** 2
        mode_shapes[fi, :keep, :] = vh[:keep]
    return freqs, eigenvalues, mode_shapes


def write_csv(path: Path, header: Iterable[str], rows: Iterable[Iterable[object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(list(header))
        writer.writerows(rows)


def plot_spectrum(path: Path, freqs: np.ndarray, eigs: np.ndarray, modes: int) -> None:
    plt.figure(figsize=(7, 4.5), dpi=180)
    for idx in range(min(modes, eigs.shape[1])):
        plt.semilogy(freqs, eigs[:, idx] + 1e-30, label=f"SPOD mode {idx + 1}")
    plt.xlabel("Frequency (Hz)")
    plt.ylabel("SPOD eigenvalue")
    plt.grid(True, which="both", alpha=0.3)
    plt.legend()
    plt.tight_layout()
    plt.savefig(path)
    plt.close()


def run_case(case: Case, out_root: Path, args: argparse.Namespace) -> dict[str, object]:
    files = sorted((p for p in case.path.iterdir() if p.suffix.lower() in IMAGE_EXTS), key=natural_key)
    if args.max_frames:
        files = files[:args.max_frames]
    raw = np.asarray([read_grayscale(path) for path in files], dtype=np.float32)
    enhanced, diagnostics = preprocess_stack(raw, args.clahe_clip)
    nt, height, width = enhanced.shape
    case_out = out_root / case.hd_label / case.npr_label
    case_out.mkdir(parents=True, exist_ok=True)

    for name, image in diagnostics.items():
        save_image(case_out / "preprocessing" / f"{name}.png", robust_normalize(image, 1, 99), cmap="magma" if "rms" in name else "gray")
    sample_ids = np.unique(np.linspace(0, nt - 1, min(args.sample_frames, nt), dtype=int))
    for idx in sample_ids:
        save_tiff(case_out / "enhanced_frames" / f"frame_{idx:06d}.tif", enhanced[idx])
        save_image(case_out / "sample_frames" / f"frame_{idx:06d}.png", enhanced[idx])

    data = enhanced.reshape(nt, -1)
    data = data - data.mean(axis=0, keepdims=True)
    pod_energy, _, pod_modes = temporal_pod(data, args.modes)
    total_energy = float(np.sum(pod_energy))
    write_csv(case_out / "pod_energy.csv", ["mode", "energy", "energy_fraction"], ((i + 1, e, e / total_energy if total_energy else 0) for i, e in enumerate(pod_energy)))
    for idx, mode in enumerate(pod_modes[:args.modes]):
        save_image(case_out / "pod_modes" / f"pod_mode_{idx + 1:02d}.png", mode.reshape(height, width), cmap="seismic")

    freqs, eigs, spod_modes = compute_spod(data, args.frame_rate, args.nperseg, args.overlap, args.modes)
    write_csv(case_out / "spod_eigenvalues.csv", ["frequency_hz", *[f"mode_{i + 1}" for i in range(args.modes)]], ([freqs[i], *eigs[i, :args.modes]] for i in range(len(freqs))))
    plot_spectrum(case_out / "spod_spectrum.png", freqs, eigs, args.modes)
    peak_idx = int(np.argmax(eigs[:, 0])) if len(freqs) else 0
    for idx in range(args.modes):
        mode = spod_modes[peak_idx, idx].reshape(height, width)
        save_image(case_out / "spod_modes_at_peak" / f"spod_mode_{idx + 1:02d}_{freqs[peak_idx]:.2f}Hz_real.png", mode.real, cmap="seismic")
        save_image(case_out / "spod_modes_at_peak" / f"spod_mode_{idx + 1:02d}_{freqs[peak_idx]:.2f}Hz_phase.png", np.angle(mode), cmap="twilight")

    metadata = {
        "case": asdict(case) | {"path": str(case.path)},
        "frames": nt,
        "image_shape": [height, width],
        "frame_rate_hz": args.frame_rate,
        "nperseg": min(args.nperseg, nt),
        "overlap": args.overlap,
        "peak_mode1_frequency_hz": float(freqs[peak_idx]) if len(freqs) else None,
        "input_files_first_last": [files[0].name, files[-1].name] if files else [],
    }
    (case_out / "metadata.json").write_text(json.dumps(metadata, indent=2))
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Publication-oriented shadowgraph preprocessing and SPOD pipeline.")
    parser.add_argument("--input-root", type=Path, required=True, help="Root containing hD*/NPR*/TIFF image folders.")
    parser.add_argument("--output-root", type=Path, required=True, help="Separate folder for processed results.")
    parser.add_argument("--frame-rate", type=float, required=True, help="Camera frame rate in Hz; required for physical SPOD frequencies.")
    parser.add_argument("--nperseg", type=int, default=128, help="Frames per SPOD Welch block.")
    parser.add_argument("--overlap", type=float, default=0.5, help="Welch block overlap fraction, e.g. 0.5.")
    parser.add_argument("--modes", type=int, default=5, help="Number of POD/SPOD modes to save.")
    parser.add_argument("--clahe-clip", type=float, default=0.015, help="CLAHE clip limit for shadowgraph contrast enhancement.")
    parser.add_argument("--sample-frames", type=int, default=12, help="Number of enhanced sample frames to export per case.")
    parser.add_argument("--max-frames", type=int, default=0, help="Optional limit for quick testing; 0 uses all frames.")
    args = parser.parse_args()

    if not 0 <= args.overlap < 1:
        raise SystemExit("--overlap must be >= 0 and < 1")
    cases = discover_cases(args.input_root)
    if not cases:
        raise SystemExit(f"No cases found under {args.input_root}. Expected hD*/NPR*/*.tif")
    args.output_root.mkdir(parents=True, exist_ok=True)
    summaries = [run_case(case, args.output_root, args) for case in cases]
    write_csv(args.output_root / "case_summary.csv", ["hD", "NPR", "frames", "height", "width", "peak_mode1_frequency_hz"], ((s["case"]["hd"], s["case"]["npr"], s["frames"], s["image_shape"][0], s["image_shape"][1], s["peak_mode1_frequency_hz"]) for s in summaries))
    (args.output_root / "run_metadata.json").write_text(json.dumps(summaries, indent=2))
    print(f"Processed {len(summaries)} cases into {args.output_root}")


if __name__ == "__main__":
    main()
