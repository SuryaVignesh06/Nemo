"""
NEMO — controlled ManimGL compiler.

This targets 3b1b ManimGL (package `manimgl`, module `manimlib`), NOT Manim
Community. The two are source-incompatible in ways that matter here: ManimGL
has ShowCreation where Community has Create, and the CLI and output layout
differ. Every API used below was checked against the installed manimlib 1.7.2.

This is the authoritative renderer for the agent workflow: the Visual Critic
judges frames captured from THIS compiler, so what the critic reviews is what
the compiler actually produced. The browser board remains the live presentation
path for the learner.

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
    manimgl manim/nemo_compiler.py NemoLesson -w -l
    #    (the scene reads plan.json from the working directory,
    #     or the path in the NEMO_PLAN environment variable)

Requires: Python 3.10+, `pip install manimgl`, FFmpeg and working OpenGL.
ManimGL is OPTIONAL — the browser demo does not need it.
"""

from __future__ import annotations

import json
import os
from typing import Any, Callable

try:
    from manimlib import (  # type: ignore
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
        Ellipse,
        FadeIn,
        FadeOut,
        Indicate,
        Line,
        Polygon,
        Rectangle,
        Scene,
        ShowCreation,
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
    "CREATE_WIREFRAME_BRAIN",
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
    "CREATE_ESP32",
    "CREATE_GPIO",
    "SET_GPIO_STATE",
    "CREATE_RESISTOR",
    "CREATE_LED",
    "SET_LED_STATE",
    "CREATE_GROUND",
    "CREATE_WIRE",
    "CREATE_CODE_BLOCK",
    "HIGHLIGHT_CODE_LINE",
    "SHOW_CURRENT_FLOW",
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

#: Colour words the model may use, mapped to ManimGL constants. A colour outside
#: this table falls back to WHITE rather than being passed through.
COLORS = {
    "white": WHITE if MANIM_AVAILABLE else None,
    "chalk": WHITE if MANIM_AVAILABLE else None,
    "blue": BLUE if MANIM_AVAILABLE else None,
    "amber": YELLOW if MANIM_AVAILABLE else None,
    "yellow": YELLOW if MANIM_AVAILABLE else None,
    "green": GREEN if MANIM_AVAILABLE else None,
}

#: Semantic relations, mapped to ManimGL directions. The model still never gives
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


class BuildContext:
    """Named nodes built so far, so later actions can refer back to them.

    Deliberately a plain class, not a dataclass: ManimGL loads scene files
    through its own ModuleLoader, which leaves sys.modules[__module__] as None,
    and dataclass field resolution dereferences that while inspecting
    annotations. A plain __init__ sidesteps the whole interaction.
    """

    def __init__(self) -> None:
        self.nodes: dict[str, Any] = {}

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
    # Rendered as plain Text, never Tex: the model's string is content, and
    # handing it to a TeX compiler would make it a command.
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


def _esp32(action: dict, ctx: BuildContext) -> Any:
    board = Rectangle(width=4.3, height=2.6, color=BLUE, stroke_width=3)
    chip = Rectangle(width=1.75, height=1.08, color=BLUE, stroke_width=2)
    chip_label = Text("CPU + WiFi", font_size=22, color=WHITE).move_to(chip)
    usb = Rectangle(width=0.84, height=0.28, color=WHITE, stroke_width=2)
    usb.next_to(board, DOWN, buff=-0.14)
    label = Text("ESP32", font_size=32, color=BLUE).next_to(board, UP, buff=0.08)
    pins = VGroup(*[
        Circle(radius=0.045, color=YELLOW).move_to([-2.05, 0.9 - i * 0.36, 0])
        for i in range(6)
    ])
    return VGroup(board, chip, chip_label, usb, label, pins)


def _gpio(action: dict, ctx: BuildContext) -> Any:
    params = action.get("parameters", {})
    pin = _str(params, ["pin", "label"], "GPIO2")
    dot = Circle(radius=0.13, color=YELLOW, stroke_width=3)
    label = Text(pin, font_size=22, color=YELLOW).next_to(dot, RIGHT, buff=0.1)
    return VGroup(dot, label)


def _resistor(action: dict, ctx: BuildContext) -> Any:
    params = action.get("parameters", {})
    value = _str(params, ["value", "label"], "220 ohm")
    zigzag = Polygon(
        [-0.9, 0, 0], [-0.65, 0, 0], [-0.48, 0.22, 0], [-0.2, -0.22, 0],
        [0.08, 0.22, 0], [0.36, -0.22, 0], [0.55, 0, 0], [0.9, 0, 0],
        color=YELLOW,
    )
    label = Text(value, font_size=20, color=YELLOW).next_to(zigzag, DOWN, buff=0.12)
    return VGroup(zigzag, label)


def _led(action: dict, ctx: BuildContext) -> Any:
    params = action.get("parameters", {})
    bulb = Circle(radius=0.38, color=_color(params, YELLOW), stroke_width=3)
    bar = Line([0.18, -0.26, 0], [0.18, 0.26, 0], color=WHITE)
    diode = Polygon([-0.18, -0.24, 0], [-0.18, 0.24, 0], [0.16, 0, 0], color=YELLOW)
    label = Text(_str(params, ["label"], "LED"), font_size=20, color=YELLOW)
    label.next_to(bulb, DOWN, buff=0.12)
    return VGroup(bulb, diode, bar, label)


def _ground(action: dict, ctx: BuildContext) -> Any:
    return VGroup(
        Line([0, 0.28, 0], [0, 0, 0], color=WHITE),
        Line([-0.38, 0, 0], [0.38, 0, 0], color=WHITE),
        Line([-0.27, -0.12, 0], [0.27, -0.12, 0], color=WHITE),
        Line([-0.14, -0.24, 0], [0.14, -0.24, 0], color=WHITE),
    )


def _wire(action: dict, ctx: BuildContext) -> Any:
    params = action.get("parameters", {})
    start_node = ctx.resolve(_str(params, ["from", "source"]))
    end_node = ctx.resolve(_str(params, ["to", "destination"]))
    if start_node is None or end_node is None:
        return Line(LEFT, RIGHT, color=WHITE)
    return Line(start_node.get_center(), end_node.get_center(), color=WHITE, stroke_width=3)


def _code_block(action: dict, ctx: BuildContext) -> Any:
    params = action.get("parameters", {})
    code = _str(params, ["code", "text"], "digitalWrite(2, HIGH);")
    language = _str(params, ["language"], "cpp").upper()
    lines = VGroup(*[Text(line, font_size=20, color=WHITE) for line in code.splitlines()[:8]])
    lines.arrange(DOWN, aligned_edge=LEFT, buff=0.12)
    frame = SurroundingRectangle(lines, color=BLUE, buff=0.22)
    tag = Text(language, font_size=15, color=BLUE).next_to(frame, UP, aligned_edge=LEFT, buff=0.06)
    return VGroup(frame, lines, tag)


def _current_flow(action: dict, ctx: BuildContext) -> Any:
    params = action.get("parameters", {})
    refs = params.get("wires") if isinstance(params.get("wires"), list) else []
    marks = []
    for ref in refs:
        wire = ctx.resolve(str(ref))
        if wire is not None:
            marks.append(Arrow(wire.get_start(), wire.get_end(), color=GREEN, buff=0))
    return VGroup(*marks) if marks else Arrow(LEFT, RIGHT, color=GREEN, buff=0)


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
            "CREATE_ESP32": _esp32,
            "CREATE_GPIO": _gpio,
            "CREATE_RESISTOR": _resistor,
            "CREATE_LED": _led,
            "CREATE_GROUND": _ground,
            "CREATE_WIRE": _wire,
            "CREATE_CODE_BLOCK": _code_block,
            "SHOW_CURRENT_FLOW": _current_flow,
            "CREATE_WIREFRAME_BRAIN": _wireframe_brain,
        }
    )


def _wireframe_brain(action: dict, ctx: "BuildContext") -> Any:
    try:
        from manim.scenes.brain import create_brain_wireframe
        params = action.get("parameters", {})
        labels = bool(params.get("labels", True))
        return create_brain_wireframe(labels=labels)
    except Exception:
        return Circle(radius=1.8, color=BLUE)


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

    def construct(self) -> None:  # pragma: no cover - requires ManimGL
        if not MANIM_AVAILABLE:
            raise RuntimeError("ManimGL is not installed. pip install manimgl")
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
                        f"{action_type} has no ManimGL adapter. "
                        "Add one to ADAPTERS, or render this lesson in the browser."
                    )

                timing = action.get("timing") or {}
                duration = float(timing.get("duration") or 0.8)

                if action_type == "WAIT":
                    self.wait(duration)
                    continue
                if action_type == "SECTION_END" or action_type.startswith("CAMERA_"):
                    # Framing hints: the browser board pans and zooms, a ManimGL
                    # render has one fixed frame, so these are intentional no-ops.
                    continue

                if action_type in {"HIGHLIGHT", "CIRCLE_TERM", "UNDERLINE_TEXT"}:
                    target = ctx.resolve(action.get("target"))
                    if target is not None:
                        if action_type == "HIGHLIGHT":
                            self.play(Indicate(target, color=YELLOW), run_time=duration)
                        else:
                            self.play(
                                ShowCreation(SurroundingRectangle(target, color=YELLOW)),
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

                if action_type in {"SET_GPIO_STATE", "SET_LED_STATE"}:
                    target = ctx.resolve(action.get("target"))
                    if target is not None:
                        self.play(Indicate(target, color=GREEN), run_time=duration)
                    continue

                if action_type == "HIGHLIGHT_CODE_LINE":
                    target = ctx.resolve(action.get("target"))
                    if target is not None:
                        self.play(Indicate(target, color=YELLOW), run_time=duration)
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
                    "CREATE_WIRE",
                    "SHOW_CURRENT_FLOW",
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
                    self.play(ShowCreation(mobject), run_time=duration)

                if action_type not in {
                    "MARK_LOW",
                    "MARK_HIGH",
                    "MARK_MIDPOINT",
                    "HIGHLIGHT_ARRAY_RANGE",
                }:
                    previous = mobject

            self.wait(0.3)

        self.wait(1.5)
        self._dump_bounds(ctx)

    # -------------------------------------------------------- measurement

    def _dump_bounds(self, ctx: "BuildContext") -> None:  # pragma: no cover
        """Emit the real geometry of the rendered scene for the Visual Critic.

        The critic is only allowed to treat geometry as fact if the geometry was
        measured, and this is the one place that can measure it: after layout,
        inside the renderer that actually drew the frame.

        Manim's world coordinates are centre-origin with y increasing upward.
        They are converted here to the top-left-origin pixel space the
        measurement code uses, so a bound means the same thing whichever
        renderer produced it.
        """
        camera = self.camera
        frame_w = camera.get_frame_width()
        frame_h = camera.get_frame_height()
        px_w = camera.get_pixel_width()
        px_h = camera.get_pixel_height()
        if not frame_w or not frame_h:
            return

        scale_x = float(px_w) / float(frame_w)
        scale_y = float(px_h) / float(frame_h)
        centre = camera.get_frame_center()

        nodes = []
        for node_id, mobject in ctx.nodes.items():
            try:
                cx, cy = mobject.get_center()[0], mobject.get_center()[1]
                w = float(mobject.get_width())
                h = float(mobject.get_height())
            except Exception:
                continue
            # Manim works in numpy floats; json cannot serialise those.
            nodes.append(
                {
                    "id": node_id,
                    # Top-left origin, y down.
                    "x": float(((cx - w / 2) - (centre[0] - frame_w / 2)) * scale_x),
                    "y": float(((centre[1] + frame_h / 2) - (cy + h / 2)) * scale_y),
                    "w": float(w * scale_x),
                    "h": float(h * scale_y),
                }
            )

        payload = {
            "viewport": {"width": int(px_w), "height": int(px_h)},
            "nodes": nodes,
        }
        target = os.environ.get("NEMO_BOUNDS", "bounds.json")
        with open(target, "w", encoding="utf-8") as handle:
            json.dump(payload, handle)


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
    print(f"manimgl available: {MANIM_AVAILABLE}")
    if unsupported:
        print("actions with no ManimGL adapter (render these in the browser):")
        for name in unsupported:
            print(f"  - {name}")
    else:
        print("every action in this plan has a ManimGL adapter")
