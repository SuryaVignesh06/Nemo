"""
NEMO — controlled Manim / ManimGL compiler.

This is the ADVANCED VISUAL BACKEND, not the live presentation path. The browser
owns the live board (that is what makes the demo feel like a teacher drawing);
this compiler exists to render the same validated lesson plan to a Manim scene
for offline/high-fidelity output.

The security property is the same on both paths and is the whole point:

    The model never emits Python. It emits semantic actions from a closed
    registry. This file maps each allowlisted action type to a Mobject and an
    animation. An action type without an entry in ADAPTERS is refused, loudly.

There is no eval, no exec, no import of anything the plan names, and no code
path where a string from the model becomes Python.

Usage
-----
    # 1. capture a validated plan from the running app
    curl -sN -X POST http://localhost:5173/api/lesson \\
      -H 'Content-Type: application/json' \\
      -d '{"question":"Explain binary search.","provider":{"provider":"mock"}}' \\
      | python manim/extract_plan.py > plan.json

    # 2. render it
    manim -qm manim/nemo_compiler.py NemoLesson
    #    (the scene reads plan.json from the working directory,
    #     or the path in the NEMO_PLAN environment variable)

Requires: Python 3.10+, `pip install manim` (Community edition) and FFmpeg.
Manim is OPTIONAL — the browser demo does not need it.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any, Callable

try:
    from manim import (  # type: ignore
        BLUE,
        DOWN,
        GREEN,
        LEFT,
        RIGHT,
        UP,
        WHITE,
        YELLOW,
        Arrow,
        Circle,
        Create,
        Ellipse,
        FadeIn,
        FadeOut,
        Indicate,
        Line,
        MathTex,
        Polygon,
        Rectangle,
        Scene,
        Square,
        SurroundingRectangle,
        Text,
        Transform,
        VGroup,
        Write,
    )

    MANIM_AVAILABLE = True
except ImportError:  # pragma: no cover - depends on the local environment
    MANIM_AVAILABLE = False
    Scene = object  # type: ignore


# ---------------------------------------------------------------- guard rails

#: Registry action types this compiler can render. Anything else is refused.
#: Mirrors the `implemented` subset of shared/registry.ts, narrowed to what
#: Manim can express directly.
SUPPORTED = {
    "WRITE_TITLE",
    "WRITE_SUBTITLE",
    "DRAW_TEXT",
    "WRITE_HANDWRITING",
    "WRITE_LABEL",
    "WRITE_EQUATION",
    "WRITE_FORMULA",
    "SHOW_FINAL_ANSWER",
    "SUMMARIZE",
    "DRAW_CIRCLE",
    "DRAW_ELLIPSE",
    "DRAW_RECTANGLE",
    "DRAW_SQUARE",
    "DRAW_TRIANGLE",
    "DRAW_POLYGON",
    "DRAW_LINE",
    "DRAW_ARROW",
    "DRAW_VECTOR",
    "DRAW_ARRAY",
    "MARK_LOW",
    "MARK_HIGH",
    "MARK_MIDPOINT",
    "HIGHLIGHT_ARRAY_RANGE",
    "CAMERA_FIT",
    "CAMERA_FOCUS",
    "CAMERA_ESTABLISH",
    "CAMERA_RESET",
    "HIGHLIGHT",
    "CIRCLE_TERM",
    "UNDERLINE_TEXT",
    "FADE_IN",
    "FADE_OUT",
    "TRANSFORM",
    "WAIT",
    "SECTION_END",
}

#: Colour words the model may use, mapped to Manim constants. A colour outside
#: this table falls back to WHITE rather than being passed through.
COLORS = {
    "white": WHITE if MANIM_AVAILABLE else None,
    "chalk": WHITE if MANIM_AVAILABLE else None,
    "blue": BLUE if MANIM_AVAILABLE else None,
    "amber": YELLOW if MANIM_AVAILABLE else None,
    "yellow": YELLOW if MANIM_AVAILABLE else None,
    "green": GREEN if MANIM_AVAILABLE else None,
}

#: Semantic relations, mapped to Manim directions. The model still never gives
#: coordinates; placement is derived here, exactly as in the browser engine.
DIRECTIONS = {
    "ABOVE": lambda: UP,
    "BELOW": lambda: DOWN,
    "LEFT_OF": lambda: LEFT,
    "RIGHT_OF": lambda: RIGHT,
    "BESIDE": lambda: RIGHT,
}

GAPS = {"tight": 0.22, "normal": 0.5, "loose": 1.1}


class UnsupportedAction(Exception):
    """Raised for an action this compiler will not render."""


# ------------------------------------------------------------------ helpers


def _str(params: dict[str, Any], keys: list[str], default: str = "") -> str:
    for key in keys:
        value = params.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, (int, float)):
            return str(value)
    return default


def _num(params: dict[str, Any], keys: list[str], default: float) -> float:
    for key in keys:
        value = params.get(key)
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                continue
    return default


def _color(params: dict[str, Any], default: Any) -> Any:
    return COLORS.get(_str(params, ["color", "colour"]).lower()) or default


@dataclass
class BuildContext:
    """Named nodes built so far, so later actions can refer back to them."""

    nodes: dict[str, Any] = field(default_factory=dict)

    def resolve(self, ref: str | None) -> Any | None:
        if not ref:
            return None
        return self.nodes.get(ref) or self.nodes.get(ref.split(".")[0])


# ------------------------------------------------------------- the adapters


def _text(action: dict, ctx: BuildContext, size: float) -> Any:
    body = _str(
        action.get("parameters", {}),
        ["text", "content", "expression", "answer", "label", "summary"],
    )
    return Text(body, font_size=size, color=_color(action.get("parameters", {}), WHITE))


def _equation(action: dict, ctx: BuildContext) -> Any:
    params = action.get("parameters", {})
    body = _str(params, ["expression", "equation", "text", "answer"])
    # MathTex compiles LaTeX, so only a plain-text rendering is used here: the
    # model's string is content, never a command we hand to a TeX compiler.
    return Text(body, font_size=44, color=_color(params, WHITE))


def _array(action: dict, ctx: BuildContext) -> Any:
    params = action.get("parameters", {})
    values = params.get("values") or params.get("items") or [3, 7, 10, 14, 18, 21, 27]
    cells = []
    for value in values:
        box = Square(side_length=1.0, color=WHITE, stroke_width=2)
        label = Text(str(value), font_size=28, color=WHITE).move_to(box.get_center())
        cells.append(VGroup(box, label))
    group = VGroup(*cells).arrange(RIGHT, buff=0.08)
    return group


def _array_cell(ctx: BuildContext, action: dict) -> tuple[Any | None, int]:
    """Locate the array group and the cell index an annotation refers to."""
    params = action.get("parameters", {})
    array = ctx.resolve(_str(params, ["array", "arrayId"])) or ctx.nodes.get("array")
    index = int(_num(params, ["index", "i", "cell"], 0))
    return array, index


def _pointer(action: dict, ctx: BuildContext) -> Any:
    """An arrow and label pointing at one array cell (MARK_LOW/HIGH/MIDPOINT)."""
    defaults = {
        "MARK_LOW": ("low", BLUE, True),
        "MARK_HIGH": ("high", GREEN, True),
        "MARK_MIDPOINT": ("mid", YELLOW, False),
    }
    name, colour, above = defaults.get(action.get("type", ""), ("mark", YELLOW, False))
    params = action.get("parameters", {})
    label_text = _str(params, ["label", "text"], name)

    array, index = _array_cell(ctx, action)
    direction = DOWN if above else UP
    arrow = Arrow(
        start=direction * -0.9, end=direction * -0.05, color=colour, buff=0
    )
    label = Text(label_text, font_size=24, color=colour)
    label.next_to(arrow, UP if above else DOWN, buff=0.08)
    group = VGroup(arrow, label)

    if array is not None and 0 <= index < len(array.submobjects):
        cell = array.submobjects[index]
        group.next_to(cell, UP if above else DOWN, buff=0.12)
    return group


def _range_band(action: dict, ctx: BuildContext) -> Any:
    """A band over the cells a step kept or discarded."""
    params = action.get("parameters", {})
    array, _ = _array_cell(ctx, action)
    low = int(_num(params, ["low", "from", "start"], 0))
    high = int(_num(params, ["high", "to", "end"], low))
    mode = _str(params, ["mode", "style"], "keep").lower()
    colour = GREEN if mode not in {"discard", "eliminate"} else YELLOW

    if array is None or high >= len(array.submobjects):
        return Rectangle(width=1, height=1, color=colour)
    span = VGroup(*array.submobjects[low : high + 1])
    return SurroundingRectangle(span, color=colour, buff=0.06)


ADAPTERS: dict[str, Callable[[dict, BuildContext], Any]] = {}


def _register() -> None:
    """Populate the adapter table. Called only when Manim is importable."""
    ADAPTERS.update(
        {
            "WRITE_TITLE": lambda a, c: _text(a, c, 54),
            "WRITE_SUBTITLE": lambda a, c: _text(a, c, 30),
            "DRAW_TEXT": lambda a, c: _text(a, c, 32),
            "WRITE_HANDWRITING": lambda a, c: _text(a, c, 32),
            "WRITE_LABEL": lambda a, c: _text(a, c, 26),
            "SUMMARIZE": lambda a, c: _text(a, c, 32),
            "WRITE_EQUATION": _equation,
            "WRITE_FORMULA": _equation,
            "SHOW_FINAL_ANSWER": _equation,
            "DRAW_CIRCLE": lambda a, c: Circle(
                radius=_num(a["parameters"], ["radius", "r"], 90) / 90,
                color=_color(a["parameters"], WHITE),
            ),
            "DRAW_ELLIPSE": lambda a, c: Ellipse(
                width=_num(a["parameters"], ["width"], 220) / 90,
                height=_num(a["parameters"], ["height"], 140) / 90,
                color=_color(a["parameters"], WHITE),
            ),
            "DRAW_RECTANGLE": lambda a, c: Rectangle(
                width=_num(a["parameters"], ["width"], 180) / 90,
                height=_num(a["parameters"], ["height"], 110) / 90,
                color=_color(a["parameters"], WHITE),
            ),
            "DRAW_SQUARE": lambda a, c: Square(
                side_length=_num(a["parameters"], ["side", "width"], 150) / 90,
                color=_color(a["parameters"], WHITE),
            ),
            "DRAW_TRIANGLE": lambda a, c: _triangle(a),
            "DRAW_POLYGON": lambda a, c: _triangle(a),
            "DRAW_LINE": lambda a, c: Line(
                LEFT * _num(a["parameters"], ["length"], 220) / 180,
                RIGHT * _num(a["parameters"], ["length"], 220) / 180,
                color=_color(a["parameters"], WHITE),
            ),
            "DRAW_ARROW": lambda a, c: Arrow(
                LEFT, RIGHT, color=_color(a["parameters"], WHITE), buff=0
            ),
            "DRAW_VECTOR": lambda a, c: Arrow(
                LEFT, RIGHT, color=_color(a["parameters"], BLUE), buff=0
            ),
            "DRAW_ARRAY": _array,
            "MARK_LOW": _pointer,
            "MARK_HIGH": _pointer,
            "MARK_MIDPOINT": _pointer,
            "HIGHLIGHT_ARRAY_RANGE": _range_band,
        }
    )


def _triangle(action: dict) -> Any:
    params = action.get("parameters", {})
    base = _num(params, ["base", "width"], 360) / 120
    height = _num(params, ["height"], 240) / 120
    apex = min(1.0, max(0.0, _num(params, ["apex", "apexRatio"], 0.38)))
    return Polygon(
        [-base / 2, -height / 2, 0],
        [base / 2, -height / 2, 0],
        [-base / 2 + base * apex, height / 2, 0],
        color=_color(params, WHITE),
    )


# ------------------------------------------------------------------- scene


def load_plan(path: str | None = None) -> dict:
    """Read a validated lesson plan produced by the NEMO backend."""
    target = path or os.environ.get("NEMO_PLAN", "plan.json")
    with open(target, encoding="utf-8") as handle:
        return json.load(handle)


class NemoLesson(Scene):  # type: ignore[misc]
    """Renders a validated NEMO lesson plan through the controlled adapters."""

    def construct(self) -> None:  # pragma: no cover - requires Manim
        if not MANIM_AVAILABLE:
            raise RuntimeError("Manim is not installed. pip install manim")
        _register()

        plan = load_plan()
        ctx = BuildContext()
        previous: Any | None = None

        for beat in plan.get("beats", []):
            for action in beat.get("visualActions", []):
                action_type = action.get("type", "")

                if action_type not in SUPPORTED:
                    # Refuse loudly rather than rendering something unrelated.
                    raise UnsupportedAction(
                        f"{action_type} has no Manim adapter. "
                        "Add one to ADAPTERS, or render this lesson in the browser."
                    )

                timing = action.get("timing") or {}
                duration = float(timing.get("duration") or 0.8)

                if action_type == "WAIT":
                    self.wait(duration)
                    continue
                if action_type == "SECTION_END" or action_type.startswith("CAMERA_"):
                    # Framing hints: the browser board pans and zooms, a Manim
                    # render has one fixed frame, so these are intentional no-ops.
                    continue

                if action_type in {"HIGHLIGHT", "CIRCLE_TERM", "UNDERLINE_TEXT"}:
                    target = ctx.resolve(action.get("target"))
                    if target is not None:
                        if action_type == "HIGHLIGHT":
                            self.play(Indicate(target, color=YELLOW), run_time=duration)
                        else:
                            self.play(
                                Create(SurroundingRectangle(target, color=YELLOW)),
                                run_time=duration,
                            )
                    continue

                if action_type == "FADE_OUT":
                    target = ctx.resolve(action.get("target"))
                    if target is not None:
                        self.play(FadeOut(target), run_time=duration)
                    continue

                if action_type == "FADE_IN":
                    target = ctx.resolve(action.get("target"))
                    if target is not None:
                        self.play(FadeIn(target), run_time=duration)
                    continue

                builder = ADAPTERS.get(action_type)
                if builder is None:
                    raise UnsupportedAction(f"No adapter registered for {action_type}")

                mobject = builder(action, ctx)
                if action_type not in {
                    "MARK_LOW",
                    "MARK_HIGH",
                    "MARK_MIDPOINT",
                    "HIGHLIGHT_ARRAY_RANGE",
                }:
                    _place(mobject, action, ctx, previous)

                node_id = action.get("target") or action.get("actionId")
                if node_id and node_id not in ctx.nodes:
                    ctx.nodes[node_id] = mobject

                if action_type == "TRANSFORM" and previous is not None:
                    self.play(Transform(previous, mobject), run_time=duration)
                elif action_type in {"WRITE_EQUATION", "WRITE_FORMULA", "DRAW_TEXT",
                                     "WRITE_TITLE", "WRITE_SUBTITLE", "WRITE_LABEL",
                                     "WRITE_HANDWRITING", "SHOW_FINAL_ANSWER", "SUMMARIZE"}:
                    self.play(Write(mobject), run_time=duration)
                else:
                    self.play(Create(mobject), run_time=duration)

                if action_type not in {
                    "MARK_LOW",
                    "MARK_HIGH",
                    "MARK_MIDPOINT",
                    "HIGHLIGHT_ARRAY_RANGE",
                }:
                    previous = mobject

            self.wait(0.3)

        self.wait(1.5)


def _place(mobject: Any, action: dict, ctx: BuildContext, previous: Any | None) -> None:
    """Resolve placement from semantic relations, never from model coordinates."""
    for relation in action.get("relations") or []:
        target = ctx.resolve(relation.get("target"))
        direction = DIRECTIONS.get(relation.get("type", ""))
        if target is not None and direction is not None:
            mobject.next_to(target, direction(), buff=GAPS.get(relation.get("gap"), 0.5))
            return
    if previous is not None:
        mobject.next_to(previous, DOWN, buff=0.5)


if __name__ == "__main__":  # pragma: no cover
    plan = load_plan()
    total = sum(len(b.get("visualActions", [])) for b in plan.get("beats", []))
    unsupported = sorted(
        {
            a.get("type")
            for b in plan.get("beats", [])
            for a in b.get("visualActions", [])
            if a.get("type") not in SUPPORTED
        }
    )
    print(f"plan: {len(plan.get('beats', []))} beats, {total} actions")
    print(f"manim available: {MANIM_AVAILABLE}")
    if unsupported:
        print("actions with no Manim adapter (render these in the browser):")
        for name in unsupported:
            print(f"  - {name}")
    else:
        print("every action in this plan has a Manim adapter")
