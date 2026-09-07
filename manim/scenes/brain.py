"""
NEMO — procedural wireframe brain (ManimGL).

A structurally generated brain, not a single AI-drawn image (registry section
23 / brief section 25): two hemispheres built from parametric ellipsoid wire
meshes, hand-authored cortical folds, a longitudinal fissure, a cerebellum,
and a brain stem, all assembled from primitives so the geometry is real and
reproducible rather than baked into one raster asset.

Usage
-----
    # standalone render, camera orbiting
    manimgl manim/scenes/brain.py NemoBrainWireframe -w

    # as a NEMO compiler adapter (see manim/nemo_compiler.py)
    from manim.scenes.brain import create_brain_wireframe
"""

from __future__ import annotations

import math
import numpy as np

try:
    from manimlib import *  # noqa: F401,F403
except ImportError:  # pragma: no cover - depends on the local environment
    from manimlib.imports import *  # noqa: F401,F403

BRAIN_A, BRAIN_B, BRAIN_C = 2.5, 1.75, 1.65
GAP = 0.16


def smooth(points):
    c = VMobject()
    c.set_points_smoothly(points)
    return c


def ellipsoid_point(center, a, b, c, u, v):
    return center + np.array([a * math.cos(v) * math.cos(u), b * math.cos(v) * math.sin(u), c * math.sin(v)])


def ellipsoid_wire(center, a, b, c, usteps=28, vsteps=16):
    g = VGroup()
    for i in range(usteps):
        u = TAU * i / usteps
        pts = [ellipsoid_point(center, a, b, c, u, -PI / 2 + PI * j / vsteps) for j in range(vsteps + 1)]
        g.add(smooth(pts))
    for j in range(1, vsteps):
        v = -PI / 2 + PI * j / vsteps
        pts = [ellipsoid_point(center, a, b, c, TAU * i / usteps, v) for i in range(usteps + 1)]
        g.add(smooth(pts))
    return g


def cortical_folds(center, side):
    g = VGroup()
    a, b, c = BRAIN_A * .92, BRAIN_B * .96, BRAIN_C * .92
    rows, cols = 11, 10
    for r in range(rows):
        y = (-1 + 2 * r / (rows - 1)) * b * .72
        for col in range(cols):
            xn = -1 + 2 * col / (cols - 1)
            x = xn * a * .78
            if x * side < -0.05:
                continue
            q = (x / a) ** 2 + (y / b) ** 2
            if q >= .90:
                continue
            phase = r * .55 + col * .79 + side * .3
            amp = .10 + .045 * math.sin(phase)
            length = .42 + .20 * (.5 + .5 * math.cos(r * .4))
            pts = []
            for k in range(52):
                t = k / 51
                xx = x + (2 * t - 1) * length
                yy = y + amp * math.sin(TAU * 1.15 * t + phase)
                q2 = (xx / a) ** 2 + (yy / b) ** 2
                if q2 >= .96:
                    continue
                zz = c * math.sqrt(max(0, 1 - q2))
                sign = 1 if math.cos(phase + t * PI) > 0 else -1
                pts.append(center + np.array([xx, yy, sign * (.78 * zz + .06 * math.sin(phase * 2 + t * PI))]))
            if len(pts) > 6:
                g.add(smooth(pts))
    return g


def create_hemisphere(center, side):
    c = center + RIGHT * side * GAP / 2
    return VGroup(ellipsoid_wire(c, BRAIN_A * .92, BRAIN_B, BRAIN_C), cortical_folds(c, side))


def create_fissure(center):
    g = VGroup()
    for z0 in [-.65, -.2, .25, .7]:
        pts = []
        for i in range(55):
            t = i / 54
            y = (-1 + 2 * t) * BRAIN_B * .72
            z = z0 + .16 * math.sin(TAU * 1.1 * t)
            pts.append(center + np.array([0, y, z]))
        g.add(smooth(pts))
    return g


def create_cerebellum(center):
    c0 = center + DOWN * 1.55 + OUT * .10
    shell = ellipsoid_wire(c0, .95, .68, .52, 20, 11)
    folds = VGroup()
    for r in range(8):
        y = -.42 + r * .12
        pts = []
        for i in range(65):
            t = i / 64
            x = -.78 + 1.56 * t
            z = .17 * math.sin(TAU * 3.5 * t + r * .35)
            if (x / .95) ** 2 + (y / .68) ** 2 < .94:
                pts.append(c0 + np.array([x, y, z]))
        if len(pts) > 5:
            folds.add(smooth(pts))
    return VGroup(shell, folds)


def create_brain_stem(center):
    c0 = center + DOWN * 2.0
    g = VGroup()
    for j in range(6):
        pts = []
        for i in range(45):
            t = i / 44
            z = .8 - 1.5 * t
            x = .18 * math.sin(t * TAU * 1.5 + j * .4)
            y = .10 * math.cos(t * TAU + j * .4)
            pts.append(c0 + np.array([x, y, z]))
        g.add(smooth(pts))
    return g


def label(text, p):
    return Text(text, font_size=26).move_to(p)


def create_brain_wireframe(center=ORIGIN, labels=True):
    left = create_hemisphere(center, -1)
    right = create_hemisphere(center, 1)
    fiss = create_fissure(center)
    cere = create_cerebellum(center)
    stem = create_brain_stem(center)
    brain = VGroup(left, right, fiss, cere, stem)
    if labels:
        labels_g = VGroup(
            label('Frontal lobe', center + LEFT * 1.55 + UP * .8),
            label('Parietal lobe', center + RIGHT * .8 + UP * 1.35),
            label('Temporal lobe', center + LEFT * 1.55 + DOWN * .55),
            label('Cerebellum', center + RIGHT * 1.05 + DOWN * 1.7),
            label('Brain stem', center + RIGHT * .75 + DOWN * 2.25),
        )
        brain.add(labels_g)
    for m in brain:
        m.set_stroke(width=1.6)
    return brain


class NemoBrainWireframe(ThreeDScene):
    def construct(self):
        self.camera.background_color = '#101010'
        self.set_camera_orientation(phi=72 * DEGREES, theta=-65 * DEGREES)
        brain = create_brain_wireframe()
        self.play(ShowCreation(brain, lag_ratio=.01), run_time=3)
        self.begin_ambient_camera_rotation(rate=.06)
        self.wait(6)
        self.stop_ambient_camera_rotation()


# NEMO registry entry — used directly by a hand-run scene, not by the
# NEMO_PLAN compiler (see manim/nemo_compiler.py for the adapter that reuses
# create_brain_wireframe() through the closed ADAPTERS table instead).
def create_brain_visual(scene, position=ORIGIN, show_labels=True):
    brain = create_brain_wireframe(position, show_labels)
    scene.play(ShowCreation(brain, lag_ratio=.01), run_time=2.5)
    return {'id': 'brain', 'type': 'wireframe_brain', 'renderer': 'manimgl', 'object': brain}
