# ================================================================
# NEMO
# IMPLEMENTATION SPECIFICATION
# UNIFIED VISUAL INTELLIGENCE + MERMAID INTEGRATION
# ================================================================

You are the primary implementation agent for NEMO.

You are working inside an existing NEMO repository.

NEMO is an AI-powered real-time visual teacher.

The application must understand a learner's question, solve it completely, decide how to teach it, select the most useful visual representation, build that visual deterministically, render it, narrate it, critique it, repair it when necessary, and ask a comprehension question afterward.

The critical objective of this task is:

INTEGRATE MERMAID DEEPLY INTO NEMO WITHOUT BREAKING OR REPLACING MANIM OR MANIMGL.

Mermaid must become a first-class visual capability alongside:

- Mermaid
- Manim
- ManimGL
- NEMO native semantic visual primitives
- retrieved web images
- screenshots / captured references
- optional image annotation layers

The resulting system must choose the right representation for the teaching objective.

Do not force one renderer to do everything.

Do not create disconnected visualization systems.

Create one unified semantic visual architecture.

# ================================================================
# 1. FIRST ACTION — INSPECT THE REPOSITORY
# ================================================================

Before writing code:

1. Inspect the entire repository.
2. Identify the existing:
   - frontend
   - backend
   - API routes
   - model providers
   - LangGraph workflow
   - agent definitions
   - state definitions
   - scene graph
   - visual registry
   - layout system
   - Manim integration
   - ManimGL integration
   - render worker
   - canvas
   - image handling
   - web/resource search
   - screenshot/image processing
   - chat streaming
   - database
   - storage
   - tests
   - environment configuration
3. Identify whether Mermaid is already installed.
4. Inspect package.json / pnpm-lock / package-lock / yarn.lock.
5. Inspect Python dependencies.
6. Reuse existing abstractions.
7. Do not duplicate functionality.
8. Do not rewrite unrelated modules.
9. Do not remove existing Manim or ManimGL functionality.
10. Do not create a second competing scene graph.

Before implementation, create an internal implementation plan based on the real repository.

# ================================================================
# 2. NON-NEGOTIABLE ARCHITECTURAL PRINCIPLE
# ================================================================

NEMO must have ONE semantic visual orchestration architecture.

The model decides:

WHAT should be taught
WHY it should be visualized
WHAT relationship or transformation matters
WHICH visual capability is appropriate

The registry decides:

WHAT visual capabilities actually exist

The renderer selector decides:

WHICH renderer should execute the capability

The layout system decides:

WHERE things go

The timeline decides:

WHEN things happen

The renderers decide:

HOW the visual is rendered

The critic decides:

WHETHER the rendered result is acceptable

The complete architecture:

USER
 ↓
QUESTION ANALYZER
 ↓
SOLVER
 ↓
ANSWER REVIEWER
 ↓
TEACHING DIRECTOR
 ↓
VISUAL DIRECTOR
 ↓
VISUAL CAPABILITY REGISTRY
 ↓
RENDERER SELECTOR
 ├── MERMAID
 ├── MANIM
 ├── MANIMGL
 ├── NEMO NATIVE
 └── RETRIEVED IMAGE / IMAGE ANNOTATION
 ↓
SEMANTIC SCENE
 ↓
DETERMINISTIC LAYOUT
 ↓
RENDER
 ↓
VISUAL CRITIC
 ↓
REPAIR
 ↓
VOICE
 ↓
COMPREHENSION CHECK
 ↓
ADAPTATION

# ================================================================
# 3. MERMAID'S ROLE
# ================================================================

Mermaid is a STRUCTURE AND RELATIONSHIP renderer.

Use Mermaid when the learner benefits from seeing:

- process flow
- decision flow
- software architecture
- sequence of interactions
- protocol communication
- state transitions
- class relationships
- entity relationships
- block relationships
- conceptual hierarchies
- dependency relationships
- system architecture
- data flow
- embedded communication flow
- algorithm overview
- hardware/software interaction

Mermaid must NOT replace Manim for:

- equations
- mathematical derivation
- graph transformations
- Riemann sums
- physics motion
- vectors
- forces
- signal waveforms
- continuous functions
- algorithm execution animation
- semiconductor carrier motion
- electron/hole movement
- charge diffusion
- electric fields
- circuit dynamics
- synchronized code-to-hardware motion
- detailed pedagogical transitions
- 3D geometry

Mermaid must NOT replace ManimGL for:

- silicon lattice
- 3D semiconductor structures
- 3D MOSFET
- 3D chip/package
- 3D hardware
- spatial mathematics
- 3D physics
- wormholes
- spacetime curvature
- other genuinely 3D explanations

# ================================================================
# 4. THE KEY NEW CAPABILITY:
# HYBRID VISUAL LESSONS
# ================================================================

NEMO must support multiple renderers in one lesson.

Example:

User:
"Explain I2C."

Lesson:

BEAT 1:
Mermaid sequence diagram

BEAT 2:
Manim SCL/SDA waveform animation

BEAT 3:
NEMO native ESP32 + sensor circuit

BEAT 4:
voice narration

BEAT 5:
quick check

Another example:

User:
"Explain a MOSFET."

Beat 1:
Mermaid conceptual relationship diagram

MOSFET
 ├── Gate
 ├── Source
 ├── Drain
 └── Channel

Beat 2:
Manim device diagram

Beat 3:
Manim animation of gate voltage and channel formation

Beat 4:
ManimGL optional 3D semiconductor structure

Do NOT make each renderer a separate lesson.

They belong to ONE lesson timeline.

# ================================================================
# 5. INSTALL MERMAID PROPERLY
# ================================================================

Install Mermaid into the actual frontend/application package.

Use the repository's existing package manager.

Prefer the official npm package:

mermaid

Do not use:

- CDN-only integration
- Mermaid website iframe
- external Mermaid editor
- remote script injection

Use the package locally.

Also inspect the currently installed Mermaid version and pin it through the normal project dependency mechanism.

Do not blindly choose an outdated version.

Use the currently compatible version with the existing application.

Also inspect whether the chosen Mermaid layout functionality requires an additional ELK dependency.

If ELK support is needed and not bundled, install the required package as a real project dependency.

Verify all installation changes in the lockfile.

# ================================================================
# 6. MERMAID CONFIGURATION
# ================================================================

Create one centralized NEMO Mermaid configuration.

Do not scatter Mermaid initialization throughout React components.

Use one controlled initialization path.

Requirements:

- dark NEMO theme
- transparent-compatible background
- readable text
- deterministic IDs where supported
- controlled max text size
- controlled max edges
- safe security configuration
- responsive sizing
- NEMO typography
- NEMO colors
- consistent line widths
- consistent node spacing

Mermaid currently supports configuration for:

- layout
- dark mode
- maxTextSize
- maxEdges
- ELK
- deterministic IDs

Use these capabilities where appropriate.

Use securityLevel conservatively.

Do NOT lower Mermaid security settings merely to enable convenience features.

Default to the safest practical configuration.

# ================================================================
# 7. MERMAID LAYOUT
# ================================================================

Use Mermaid's layout capabilities intelligently.

Supported layout families include:

- Dagre
- ELK
- Tidy Tree
- Cose-Bilkent

Use:

Dagre:
simple layered diagrams

ELK:
complex graph structures
larger diagrams
architecture
dense relationship diagrams

Tidy Tree:
hierarchies

Cose-Bilkent:
relationship-heavy force-directed structures where appropriate

Do not blindly use ELK for everything.

Create deterministic selection logic.

Example:

simple directed flow
→ Dagre

complex architecture
→ ELK

tree hierarchy
→ Tidy Tree

relationship-heavy graph
→ Cose-Bilkent if supported and appropriate

After rendering, NEMO still validates the actual result.

Mermaid layout is NOT the final NEMO layout system.

# ================================================================
# 8. MERMAID ADAPTER
# ================================================================

Create a dedicated Mermaid adapter.

Suggested conceptual structure:

visual/
  renderers/
    mermaid/
      MermaidRenderer
      MermaidAdapter
      MermaidValidator
      MermaidTheme
      MermaidNodeMapper
      MermaidLayoutSelector
      MermaidErrorHandler

Adapt this structure to the existing repository.

The Mermaid adapter converts:

NEMO semantic diagram JSON
→
Mermaid source
→
Mermaid render

Do not make the agents directly construct arbitrary Mermaid source as their primary contract.

# ================================================================
# 9. SEMANTIC MERMAID CONTRACT
# ================================================================

Create structured schemas.

Example:

{
  "type": "flowchart",
  "direction": "LR",
  "nodes": [
    {
      "id": "sensor",
      "label": "Temperature Sensor",
      "kind": "hardware"
    },
    {
      "id": "esp32",
      "label": "ESP32",
      "kind": "microcontroller"
    }
  ],
  "edges": [
    {
      "id": "sensor_to_esp32",
      "from": "sensor",
      "to": "esp32",
      "label": "I2C"
    }
  ]
}

Create Zod schemas.

Validate before rendering.

# ================================================================
# 10. SUPPORTED MERMAID TYPES
# ================================================================

At minimum integrate:

flowchart

sequence diagram

state diagram

class diagram

architecture diagram

block/system diagram

ER diagram

mindmap where supported

timeline where supported

gitgraph only if useful

Do not expose every Mermaid feature automatically.

Only enable features that are useful for NEMO.

# ================================================================
# 11. VISUAL FUNCTION REGISTRY
# ================================================================

Extend the existing VisualFunctionRegistry.

Add:

create_flowchart
create_sequence_diagram
create_state_diagram
create_class_diagram
create_architecture_diagram
create_block_diagram
create_er_diagram
create_mindmap
create_timeline

Each function must contain:

name
description
renderer
domain
category
parameters
examples
constraints
supports_2d
supports_interaction
animation_strategy

Example:

{
  "name": "create_sequence_diagram",
  "renderer": "mermaid",
  "domain": "embedded",
  "category": "protocol",
  "description": "Show ordered interaction between systems or components.",
  "parameters": {
    "participants": "...",
    "messages": "..."
  }
}

# ================================================================
# 12. DO NOT MAKE THE REGISTRY AN AGENT
# ================================================================

The registry is deterministic.

It is not an LLM.

It contains trusted capabilities.

The model receives:

function names
descriptions
schemas
examples
constraints

The model does not receive:

implementation source code
filesystem paths
shell commands
arbitrary executable code

# ================================================================
# 13. RENDERER SELECTOR
# ================================================================

Create a renderer selection system.

The selector considers:

visual purpose
domain
relationships
temporal change
mathematics
physics
3D requirement
interaction
complexity
number of objects
animation requirements
learner level

Example:

"What components exist in NEMO?"
→ Mermaid architecture

"Show what happens when GPIO goes HIGH."
→ Manim

"Show a silicon lattice."
→ ManimGL

"Show I2C communication."
→ Mermaid + Manim

"Show binary search."
→ Mermaid + Manim

"Show MOSFET concept."
→ Mermaid + Manim
possibly ManimGL

# ================================================================
# 14. DO NOT DISTURB MANIM OR MANIMGL
# ================================================================

Existing Manim functionality is protected.

Existing ManimGL functionality is protected.

Do not:

- replace imports
- migrate scenes unnecessarily
- rewrite working visual functions
- remove Manim dependencies
- remove ManimGL dependencies
- convert existing scenes to Mermaid
- route everything through Mermaid

Add Mermaid as a sibling renderer.

The existing visual functions must continue to pass their tests.

# ================================================================
# 15. NEMO NATIVE VISUALS
# ================================================================

Continue supporting native visual functions.

Use NEMO-native visuals for:

- circuits
- ESP32
- Raspberry Pi
- sensors
- LEDs
- semiconductor devices
- hardware components
- mathematical diagrams
- algorithm animation

Mermaid can show the system relationship.

Native visual functions show the physical object.

Manim animates behavior.

# ================================================================
# 16. WEB IMAGE INTELLIGENCE
# ================================================================

NEMO must also be able to use REAL images from the web when those images materially improve learning.

Examples:

- brain anatomy
- neural network illustrations
- microscope images
- scientific apparatus
- real ESP32 board
- Raspberry Pi board
- semiconductor wafer
- transistor micrograph
- real circuit board
- historical diagram
- astronomy image
- real spacecraft
- real biological structure

The AI must decide:

"Would a real reference image improve this explanation?"

If yes:

perform an actual retrieval/search operation.

Do not fabricate the URL.

Do not fabricate the source.

Do not generate a fake citation.

# ================================================================
# 17. IMAGE RETRIEVAL PIPELINE
# ================================================================

Use:

AI-generated search query
 ↓
real image/web retrieval service
 ↓
candidate images
 ↓
source metadata
 ↓
image download/proxy if permitted
 ↓
content analysis
 ↓
selection
 ↓
canvas placement
 ↓
annotation
 ↓
explanation

The model suggests search intent.

The retrieval subsystem gets real assets.

# ================================================================
# 18. IMAGE SOURCE METADATA
# ================================================================

Create:

interface RetrievedImage {
  id: string;
  title: string;
  sourceName: string;
  sourceUrl: string;
  imageUrl: string;
  thumbnailUrl?: string;
  domain: string;
  license?: string;
  attribution?: string;
}

Do not lose source provenance.

Every externally retrieved image must retain provenance metadata.

# ================================================================
# 19. IMAGE SAFETY / TRUST
# ================================================================

Do not automatically trust arbitrary image URLs.

Validate:

- source
- MIME type
- file size
- image dimensions
- supported formats

Do not render HTML pages where an image is expected.

Prefer proxied/validated image assets where appropriate.

Do not expose unsafe remote HTML.

# ================================================================
# 20. WEB IMAGE + NEMO EXPLANATION
# ================================================================

A retrieved image must never simply be dumped into chat.

NEMO should use it as a teaching object.

Example:

Learner:
"What does a real transistor look like?"

NEMO:

searches real images

retrieves:

[real transistor / microscope image]

then:

- preserves original image
- adds labels
- highlights relevant regions
- draws arrows
- explains the selected region
- optionally connects the real image to a Manim schematic

Example:

REAL IMAGE
 ↓
annotated region
 ↓
schematic representation
 ↓
Manim explanation

This is a powerful NEMO capability.

# ================================================================
# 21. IMAGE ANNOTATION LAYER
# ================================================================

Create a reusable annotation system.

Capabilities:

annotate_point
annotate_region
draw_arrow
draw_circle
draw_box
draw_line
draw_measurement
add_label
add_callout
crop_region
zoom_region
highlight_region
dim_background
compare_regions

The annotation layer must preserve the original image underneath.

# ================================================================
# 22. IMAGE + MANIM HYBRID
# ================================================================

Example:

Real brain image

       ↓

highlight hippocampus

       ↓

NEMO callout

       ↓

Manim wireframe brain diagram

       ↓

show neural signal flow

This must be supported.

# ================================================================
# 23. BRAIN WIREFRAME VISUALS
# ================================================================

NEMO should be able to create wireframe-style conceptual visuals.

Examples:

brain
heart
human body
neuron
cell
chip
CPU
network
solar system
molecule
protein
mechanical system

These should NOT depend exclusively on generated raster images.

Prefer:

semantic geometry
SVG/vector primitives
Manim geometry
3D meshes where appropriate
wireframe structures
point clouds
line networks

For 3D cases use ManimGL or the project's approved 3D renderer.

For 2D schematic cases use Manim/native vector rendering.

# ================================================================
# 24. WORMHOLE VISUALIZATION
# ================================================================

NEMO must support a wormhole visual that is structurally generated.

Do not rely on a single AI-generated wormhole image.

Create semantic functions such as:

create_spacetime_grid
create_warped_grid
create_wormhole_mouth
create_wormhole_throat
create_geodesic
trace_geodesic
animate_traversal
create_event_horizon
create_lensing
create_3d_wormhole

The visual should communicate:

flat spacetime

        ↓

curvature

        ↓

wormhole mouth

        ↓

throat

        ↓

second region

Use Manim / ManimGL.

Mermaid can optionally provide the conceptual relationship:

Region A
 ↓
Wormhole
 ↓
Region B

But the actual wormhole geometry is a Manim/ManimGL responsibility.

# ================================================================
# 25. SCIENTIFIC WIREFRAME ENGINE
# ================================================================

Create / extend a semantic wireframe capability.

Examples:

create_wireframe_brain
create_wireframe_heart
create_wireframe_atom
create_wireframe_molecule
create_wireframe_chip
create_wireframe_machine
create_wireframe_planet
create_wireframe_structure

Each should be based on structured primitives, not one opaque AI image.

# ================================================================
# 26. MODEL DECISION:
# REAL IMAGE VS DRAWING
# ================================================================

The Visual Director must decide:

USE_REAL_IMAGE

when:
- realism matters
- the learner asks for real-world reference
- morphology matters
- hardware identification matters
- historical/scientific reference matters
- the real object is easier to understand visually

USE_MERMAID

when:
- relationships matter
- flow matters
- system structure matters
- sequence matters

USE_MANIM

when:
- change over time matters
- equations matter
- dynamic explanation matters
- physical processes matter

USE_MANIMGL

when:
- 3D spatial reasoning matters

USE_NATIVE_ANNOTATION

when:
- learner supplied an image that needs explanation

# ================================================================
# 27. "WHERE DO I START?" VISUAL GUIDANCE
# ================================================================

NEMO must be able to use an image or screenshot and determine:

- what is visible
- what the major regions are
- where the learner should start
- what is most important
- which labels are relevant
- what the next visual teaching step should be

Example:

User uploads:

[complex circuit diagram]

NEMO analyzes:

1. power source
2. input
3. main component
4. output
5. ground
6. signal path

Then explains:

"Let's start here."

and places a callout on the actual image.

The learner can ask:

"Why does this connect here?"

and NEMO references the selected region.

# ================================================================
# 28. SCREENSHOT PROCESSING
# ================================================================

NEMO should support screenshots as first-class learning objects.

Examples:

- code screenshot
- circuit diagram screenshot
- textbook page
- datasheet
- IDE screenshot
- terminal screenshot
- hardware diagram
- scientific figure

Pipeline:

SCREENSHOT
 ↓
VISION UNDERSTANDING
 ↓
REGION DETECTION
 ↓
SEMANTIC OBJECTS
 ↓
ANNOTATION
 ↓
EXPLANATION

Preserve original screenshot.

Never replace it with a generated approximation unless explicitly required.

# ================================================================
# 29. IMAGE + CANVAS INTERACTION
# ================================================================

Every image region that becomes educationally meaningful should receive a stable NEMO object ID.

Example:

image:
"mosfet_micrograph_1"

region:
"gate_region"

learner selects gate region

then asks:

"Why is this important?"

NEMO context:

selectedObjectId = "gate_region"

Use that in question analysis.

# ================================================================
# 30. MERMAID NODE INTERACTION
# ================================================================

Mermaid nodes must map to stable semantic IDs.

Example:

Mermaid:

ESP32
Sensor
I2C

NEMO IDs:

esp32
sensor
i2c_bus

When learner clicks ESP32:

selectedObjectId = "esp32"

Then:

"Why is this here?"

→ answer about ESP32.

Do not lose this relationship after rendering.

# ================================================================
# 31. UNIFIED VISUAL OBJECT MODEL
# ================================================================

Create a common model.

Example:

interface VisualObject {
  id: string;
  type: string;
  renderer: "mermaid" | "manim" | "manimgl" | "native" | "image";
  label?: string;
  semanticRole?: string;
  parentId?: string;
  sourceId?: string;
  properties?: Record<string, unknown>;
}

All renderers should reference the same semantic IDs.

# ================================================================
# 32. UNIFIED VISUAL RELATIONSHIPS
# ================================================================

Support relationships:

ABOVE
BELOW
LEFT_OF
RIGHT_OF
CENTERED_ON
ATTACHED_TO
CONNECTED_TO
POINTS_TO
FOLLOW
NEAR
FAR
CONTAINS
PART_OF
DEPENDS_ON
CAUSES
SEQUENCE_BEFORE
SEQUENCE_AFTER
CONTROLS
MEASURES
COMMUNICATES_WITH

Mermaid uses these for structural relationships.

Manim uses these for scene composition.

Image annotation uses them for callouts.

# ================================================================
# 33. MERMAID + MANIM OBJECT ID MAPPING
# ================================================================

Example:

Semantic object:

{
  "id": "esp32",
  "type": "microcontroller"
}

Mermaid:
ESP32["ESP32"]

Manim:
object ID:
esp32_board

But the semantic layer should know:

esp32
 ↕
esp32_board

This lets NEMO jump between:

architecture view
physical hardware view
code view

# ================================================================
# 34. MULTI-LEVEL EXPLANATIONS
# ================================================================

A lesson can have:

LEVEL 1:
concept overview

LEVEL 2:
structural relationship diagram

LEVEL 3:
animated process

LEVEL 4:
technical detail

LEVEL 5:
3D / physical detail

Example MOSFET:

Level 1:
Mermaid concept map

Level 2:
Manim schematic

Level 3:
channel formation animation

Level 4:
energy band explanation

Level 5:
3D semiconductor representation

Do not force all levels into every lesson.

Choose based on learner need.

# ================================================================
# 35. VISUAL DIRECTOR RULES
# ================================================================

Update the visual planning prompt.

The Visual Director must reason:

"What representation most efficiently reduces the learner's cognitive load?"

Not:

"What renderer is coolest?"

Use this preference:

RELATIONSHIP
→ Mermaid

DYNAMIC CHANGE
→ Manim

MATHEMATICAL TRANSFORMATION
→ Manim

PHYSICAL PROCESS
→ Manim

3D SPATIAL STRUCTURE
→ ManimGL

REAL-WORLD REFERENCE
→ retrieved image

USER-PROVIDED FIGURE
→ annotate original image

COMBINED STRUCTURE + DYNAMICS
→ Mermaid + Manim

COMBINED REAL IMAGE + SCHEMATIC
→ web/image + Manim

COMBINED 3D + CONCEPT MAP
→ Mermaid + ManimGL

# ================================================================
# 36. EXAMPLE:
# ESP32 + SENSOR
# ================================================================

User:
"How does ESP32 read a temperature sensor?"

Plan:

Mermaid:

Temperature Sensor
        ↓
I2C
        ↓
ESP32
        ↓
Application

Then native/Manim:

ESP32 board
GPIO/I2C pins
sensor
wires

Then Manim:

START
 ↓
ADDRESS
 ↓
ACK
 ↓
DATA
 ↓
STOP

Then code:

sensor.request()

Then real image if useful:

actual ESP32 board image

annotate:

I2C pins

This becomes ONE lesson.

# ================================================================
# 37. EXAMPLE:
# RASPBERRY PI
# ================================================================

User:
"How does Raspberry Pi read a button?"

Mermaid:

Button
 ↓
GPIO17
 ↓
Python
 ↓
Decision
 ↓
Action

Then native diagram:

Raspberry Pi
+
button
+
wire

Then Manim:

HIGH / LOW state transition

Then code:

GPIO.input(17)

# ================================================================
# 38. EXAMPLE:
# BINARY SEARCH
# ================================================================

Mermaid:

START
 ↓
MIDPOINT
 ↓
COMPARE
 ├── equal → FOUND
 ├── smaller → LEFT
 └── larger → RIGHT

Manim:

[3][7][10][14][18][21][27][31][36]

target = 31

animate midpoint

animate comparison

eliminate half

repeat

final:

31 found

O(log n)

Do not replace this existing Manim lesson.

Add Mermaid as an overview layer.

# ================================================================
# 39. EXAMPLE:
# SEMICONDUCTOR
# ================================================================

Question:
"Explain a PN junction."

Mermaid:

Semiconductor
 ↓
P-type + N-type
 ↓
Contact
 ↓
Diffusion
 ↓
Depletion Region
 ↓
Electric Field
 ↓
Equilibrium

Manim:

electrons
holes
diffusion
depletion
electric field

ManimGL:

3D lattice if learner asks for deeper visualization.

# ================================================================
# 40. EXAMPLE:
# BRAIN
# ================================================================

Question:
"Explain the parts of the brain."

NEMO may:

1. Retrieve a real educational brain image.
2. Preserve source attribution.
3. Analyze major regions.
4. Annotate selected regions.
5. Create a wireframe/semantic brain representation.
6. Use Manim to explain signal/structural concepts.
7. Use Mermaid for high-level relationships if useful.

Do not generate a fake "real medical image."

If a medical/scientific real image is retrieved, preserve source metadata.

# ================================================================
# 41. EXAMPLE:
# WORMHOLE
# ================================================================

Question:
"Explain a wormhole."

Use:

Mermaid:
Region A → Wormhole → Region B

Manim:
curved grid

ManimGL:
3D throat / spacetime structure

Animation:
particle traverses the throat

Voice:
explain the geometry while the particle moves

Do not use one generic AI image as the complete explanation.

# ================================================================
# 42. RESOURCE / WEB CRAWLING UI
# ================================================================

Integrate this with the NEMO chat processing UI.

When online research actually occurs:

[NEMO] Searching useful resources... >

Expand:

✓ Understanding question
✓ Planning explanation
→ Searching references

[Espressif]
[Arduino]
[Wikipedia]
[YouTube]

Do not display fake sources.

Do not fabricate crawl events.

Do not show websites that were not actually retrieved.

# ================================================================
# 43. SCREENSHOT / RESEARCH ACTIVITY
# ================================================================

If NEMO opens/retrieves a reference and captures an allowed screenshot or preview:

show:

→ Inspecting reference
→ Identifying relevant section
→ Extracting visual context

Then optionally:

[thumbnail]

with:

"Starting here"

NEMO can place a callout around the useful portion.

# ================================================================
# 44. WEB SOURCE LOGOS
# ================================================================

Use actual source favicon/logo metadata when available.

Fallback:

domain monogram

Do not ask the LLM to provide logo URLs.

Store source provenance.

# ================================================================
# 45. OFFLINE MODE
# ================================================================

Everything in this visual architecture must continue working offline except capabilities that inherently require external network access.

Offline supports:

- local model
- Mermaid
- Manim
- ManimGL
- native visuals
- local image assets
- cached resources
- local image analysis
- local vision model
- local screenshot analysis

Online additionally supports:

- cloud models
- live web search
- live image retrieval
- live YouTube retrieval
- cloud voice

Mermaid MUST work offline because it is a local application dependency.

# ================================================================
# 46. OFFLINE TRAINING
# ================================================================

The local model should be trained / fine-tuned / instructed to understand renderer selection.

Training examples:

Question:
"Show the pipeline."

→ Mermaid flowchart

Question:
"Animate the equation."

→ Manim

Question:
"Show this in 3D."

→ ManimGL

Question:
"Find a real photo of an ESP32."

→ web image retrieval in online mode

Question:
"I uploaded this circuit."

→ image analysis + annotation

Question:
"Explain I2C."

→ Mermaid + Manim

The model learns WHAT representation to select.

# ================================================================
# 47. LOCAL VISUAL ASSET LIBRARY
# ================================================================

Offline mode should have a local asset cache.

Examples:

ESP32
Raspberry Pi
Arduino
STM32
MOSFET
BJT
diode
LED
breadboard
sensors
chips
brain wireframe
common scientific diagrams

These assets should have metadata.

Example:

{
  "id": "esp32_board",
  "category": "embedded",
  "visualTypes": [
    "2d",
    "schematic"
  ]
}

# ================================================================
# 48. VISUAL ASSET POLICY
# ================================================================

Prefer reusable semantic assets over giant raster images.

For example:

ESP32

should be:

board geometry
+
pin geometry
+
labels
+
semantic connections

rather than one PNG.

This enables:

clicking GPIO2

animating the signal

highlighting a pin

changing state

connecting an LED

# ================================================================
# 49. DETERMINISTIC RENDERING
# ================================================================

Visual output should be reproducible.

Use deterministic IDs where available.

Use stable semantic IDs.

Do not let the model randomly change object identifiers.

Same semantic lesson should produce broadly stable structure.

# ================================================================
# 50. MERMAID SECURITY
# ================================================================

Treat Mermaid source as untrusted generated content.

Validate and sanitize.

Use conservative security configuration.

Do not enable arbitrary script execution.

Do not allow generated diagrams to inject arbitrary web behavior.

Avoid lowering security level unnecessarily.

Use NEMO's trusted configuration instead of accepting arbitrary configuration directives from model output.

# ================================================================
# 51. FRONTMATTER / CONFIG CONTROL
# ================================================================

Do not allow the LLM to override NEMO's protected rendering/security settings.

If model output contains Mermaid configuration:

strip unsupported configuration

permit only an explicit safe allowlist:

direction
layout request
selected diagram-specific visual hints

Do not permit:

security overrides
external script behavior
unsafe HTML behavior
arbitrary links unless explicitly supported and sanitized

# ================================================================
# 52. DIAGRAM SIZE LIMITS
# ================================================================

NEMO must detect oversized diagrams.

If too many nodes:

DO NOT generate one massive diagram.

Instead:

summarize

then expand

Example:

"NEMO architecture"

Overview:
8 nodes

Then:
Frontend detail

Then:
Agent detail

Then:
Renderer detail

This is a teaching feature.

# ================================================================
# 53. PROGRESSIVE DIAGRAM EXPLANATION
# ================================================================

Mermaid diagrams should support progressive focus.

Example:

Full diagram:

Sensor
 ↓
ADC
 ↓
MCU
 ↓
Application

Step 1:
focus Sensor

Step 2:
focus ADC

Step 3:
focus MCU

Step 4:
focus Application

Use NEMO overlay/selection state.

Do not require Mermaid to animate complex object movement.

# ================================================================
# 54. HYBRID LESSON TIMELINE
# ================================================================

Create a unified timeline schema.

Example:

{
  "beats": [
    {
      "id": "overview",
      "renderer": "mermaid",
      "duration": 5
    },
    {
      "id": "dynamic",
      "renderer": "manim",
      "duration": 12
    },
    {
      "id": "deep",
      "renderer": "manimgl",
      "duration": 10
    }
  ]
}

Narration segments refer to beat IDs.

# ================================================================
# 55. NARRATION
# ================================================================

Voice must understand renderer transitions.

Example:

Beat 1:
"This diagram shows the three main components."

Beat 2:
"Now watch what happens to the signal."

Beat 3:
"Let's look inside the semiconductor."

Do not narrate implementation details.

# ================================================================
# 56. VISUAL CRITIC
# ================================================================

Extend the Visual Critic to inspect:

Mermaid
Manim
ManimGL
images
annotations

Checks:

clipping
overlap
unreadable labels
excessive whitespace
broken connections
incorrect focus
bad composition
wrong diagram scale
low contrast
missing nodes
misaligned annotations
image crop problems
source attribution visibility when required

# ================================================================
# 57. IMAGE CRITIC
# ================================================================

For retrieved image lessons:

check:

is the target object actually visible?
is it too small?
is annotation correctly placed?
is the image blurry?
is source attribution preserved?
is the selected region correct?

If not:

repair by:

crop
zoom
alternate image
move annotation
select different source

Maximum repair attempts:
2

# ================================================================
# 58. MERMAID CRITIC
# ================================================================

Validate:

syntax
node count
edge count
layout
text size
overlap
viewport
semantic correctness
object mapping

Do not accept a Mermaid diagram only because the Mermaid parser succeeds.

It must also be pedagogically readable.

# ================================================================
# 59. FALLBACK STRATEGY
# ================================================================

If Mermaid fails:

Mermaid
 ↓
repair
 ↓
retry
 ↓
if still failing:
native NEMO diagram
or
simplified Manim structure

If web image retrieval fails:

use local asset if available
or
native visual

If Manim fails:

safe fallback to structured diagram / static visual where pedagogically acceptable

The entire lesson must not crash because one renderer fails.

# ================================================================
# 60. ERROR CODES
# ================================================================

Introduce structured visual errors:

MERMAID_PARSE_ERROR
MERMAID_LAYOUT_ERROR
MERMAID_RENDER_ERROR
IMAGE_RETRIEVAL_ERROR
IMAGE_VALIDATION_ERROR
IMAGE_ANNOTATION_ERROR
MANIM_RENDER_ERROR
MANIMGL_RENDER_ERROR
VISUAL_LAYOUT_ERROR
VISUAL_CRITIC_FAILURE

Do not expose raw stack traces to users.

# ================================================================
# 61. CHAT PROCESSING INTEGRATION
# ================================================================

During generation:

[NEMO] Analyzing your question... >

[NEMO] Planning the explanation... >

[NEMO] Choosing visual strategy... >

[NEMO] Building the visual lesson... >

If Mermaid selected:

[NEMO] Building concept diagram... >

If Manim selected:

[NEMO] Creating animated explanation... >

If image search is needed:

[NEMO] Finding a useful real-world reference... >

If hybrid:

[NEMO] Combining structure and animation... >

These must come from actual backend events.

Do not fake progress with setTimeout.

# ================================================================
# 62. EXPANDABLE REASONING PANEL
# ================================================================

Clicking > opens:

✓ Question understood
✓ Answer verified
✓ Teaching strategy selected
✓ Visual strategy selected
→ Building Mermaid overview
→ Creating Manim animation
○ Preparing deeper visualization

If online retrieval:

[Espressif]
[YouTube]
[NVIDIA]
[Wikipedia]

Only actual retrieved sources.

# ================================================================
# 63. RESPONSE CONTAINER
# ================================================================

Final response should appear in:

dark gray rounded container

with:

white text
NEMO avatar
Markdown
code blocks
visual previews
source chips
speaker
like
dislike
share
copy

Do not change this visual direction while integrating Mermaid.

# ================================================================
# 64. MERMAID IN CHAT
# ================================================================

If the lesson has a Mermaid overview:

render it directly as part of the response/lesson.

Do not show raw Mermaid syntax to the learner by default.

Optional:
"View diagram source"
only under advanced/debug mode.

# ================================================================
# 65. CANVAS
# ================================================================

The primary visual result belongs to the NEMO canvas.

The chat response should explain it.

Example:

Chat:
"At a high level, the sensor communicates with the ESP32 over I2C."

Canvas:
Mermaid diagram

Then:
Manim animation

Then:
annotated real ESP32 image

All can coexist in one learning canvas.

# ================================================================
# 66. CANVAS OBJECT SELECTION
# ================================================================

Every object must have:

stable ID
renderer
semantic meaning

Selection:

click node/image/component

updates:

selectedObjectId

Then chat can understand:

"Why is this connected?"

"This"

means the selected object.

# ================================================================
# 67. FOLLOW-UP QUESTIONS
# ================================================================

Example:

Initial:

"Explain MOSFET."

NEMO shows:

Mermaid overview
+
Manim animation

Learner clicks:

Gate

asks:

"Why does increasing this voltage form the channel?"

Question Analyzer receives:

selectedObjectId = gate

lessonContext = MOSFET

currentVisualBeat = channel formation

Then it answers in context.

# ================================================================
# 68. DO NOT RESET THE CANVAS
# ================================================================

Follow-up questions should preserve existing objects where possible.

Do not destroy:

MOSFET

and recreate it for every explanation.

Transform existing objects.

Preserve learner context.

# ================================================================
# 69. MERMAID ARCHITECTURE VISUALS FOR NEMO
# ================================================================

NEMO must use Mermaid for its own architecture when useful.

Example:

Frontend
 ↓
API
 ↓
LangGraph
 ↓
Model Router
 ↓
Teaching Director
 ↓
Visual Director
 ↓
Renderer Registry
 ├── Mermaid
 ├── Manim
 └── ManimGL
 ↓
Render Worker
 ↓
Critic
 ↓
Canvas

Then Manim can animate a request moving through the architecture.

This should become a strong NEMO demo.

# ================================================================
# 70. TEST SUITE
# ================================================================

Add tests for:

Mermaid installation
Mermaid initialization
Mermaid schemas
Mermaid adapter
Mermaid rendering
Mermaid layouts
Mermaid theme
Mermaid node mapping
renderer selector
hybrid lessons
image retrieval model
image provenance
image annotation
canvas selection
fallbacks
critic
repair
offline mode
online mode

# ================================================================
# 71. GOLDEN VISUAL TESTS
# ================================================================

Create or preserve golden tests for:

1. Binary search
2. Integral
3. Physics
4. Benzene
5. ESP32 LED
6. Raspberry Pi GPIO
7. I2C
8. SPI
9. UART
10. PN junction
11. MOSFET
12. CMOS
13. voltage divider
14. NEMO architecture
15. brain wireframe
16. wormhole
17. real-image annotation

# ================================================================
# 72. PERFORMANCE
# ================================================================

Do not run all renderers unnecessarily.

Use the minimum visual stack needed for the teaching objective.

Examples:

Simple process:
Mermaid only

Dynamic process:
Manim only

Complex protocol:
Mermaid + Manim

3D device:
ManimGL only or Mermaid + ManimGL

Real image:
image + annotation

Complex scientific lesson:
image + Mermaid + Manim + optional ManimGL

# ================================================================
# 73. CACHING
# ================================================================

Cache deterministic Mermaid diagrams.

Cache key:

semantic diagram hash
+
Mermaid version
+
theme
+
layout
+
renderer configuration

Do NOT globally cache private/personalized content without proper isolation.

Cache retrieved assets according to provenance and storage policy.

# ================================================================
# 74. OFFLINE RESOURCE CACHE
# ================================================================

Offline mode can use previously retrieved resources.

Maintain:

resource cache
image cache
diagram cache
lesson cache

This allows previously accessed material to remain useful without internet.

# ================================================================
# 75. MODEL-PROVIDER INDEPENDENCE
# ================================================================

Gemini
OpenRouter
Local Model

must all be capable of producing the same semantic visual plan.

Do not bake Mermaid-specific logic into one provider.

Do not bake Manim-specific logic into one provider.

Visual semantics remain provider-independent.

# ================================================================
# 76. MODEL OUTPUT EXAMPLE
# ================================================================

For:

"Explain I2C"

The model should return something conceptually similar to:

{
  "visualLesson": {
    "beats": [
      {
        "id": "overview",
        "renderer": "mermaid",
        "type": "sequence"
      },
      {
        "id": "electrical",
        "renderer": "manim",
        "type": "signal"
      }
    ]
  }
}

Then the runtime generates the actual renderer-specific artifacts.

# ================================================================
# 77. DO NOT GENERATE ARBITRARY CODE
# ================================================================

Forbidden:

LLM
 ↓
arbitrary Python
 ↓
shell
 ↓
Manim

Forbidden:

LLM
 ↓
arbitrary JS
 ↓
Mermaid
 ↓
unsafe execution

Preferred:

LLM
 ↓
validated semantic plan
 ↓
trusted registry
 ↓
renderer adapter
 ↓
renderer

# ================================================================
# 78. NEMO VISUAL QUALITY STANDARD
# ================================================================

Visuals should be:

clear
minimal
educational
readable
spatially organized
semantic
deterministic
responsive
consistent

Avoid:

decorative complexity
random objects
giant diagrams
unnecessary 3D
fake image generation
unstructured arrows
overlapping labels
tiny text
renderer-specific visual inconsistency

# ================================================================
# 79. FINAL VISUAL DECISION TABLE
# ================================================================

Use:

MERMAID
for:
- structure
- relations
- architecture
- state
- sequence
- process
- conceptual maps

MANIM
for:
- mathematics
- algorithms
- physics
- circuits
- signals
- code execution
- semiconductor processes
- temporal animation

MANIMGL
for:
- 3D
- spatial geometry
- semiconductor structures
- hardware structure
- wormholes
- crystal lattices

NEMO NATIVE
for:
- hardware components
- reusable educational objects
- circuit elements
- embedded boards
- interactive canvas primitives

WEB IMAGE
for:
- real-world references
- photographs
- micrographs
- actual hardware
- scientific imagery

IMAGE ANNOTATION
for:
- user uploads
- screenshots
- diagrams
- references
- "start here" teaching

# ================================================================
# 80. FINAL TARGET ARCHITECTURE
# ================================================================

                            USER
                              │
                              ▼
                    CHAT + INFINITE CANVAS
                              │
                              ▼
                     QUESTION ANALYZER
                              │
                              ▼
                            SOLVER
                              │
                              ▼
                     ANSWER REVIEWER
                              │
                              ▼
                     TEACHING DIRECTOR
                              │
                              ▼
                      VISUAL DIRECTOR
                              │
                              ▼
               SEMANTIC VISUAL PLAN
                              │
                              ▼
                   VISUAL CAPABILITY
                       REGISTRY
                              │
                              ▼
                   RENDERER SELECTOR
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
     MERMAID                MANIM               MANIMGL
        │                     │                     │
        │                     │                     │
  STRUCTURE              ANIMATION                 3D
  RELATIONSHIPS          MATHEMATICS               SPATIAL
  FLOW                   PHYSICS                   HARDWARE
  SEQUENCE               CIRCUITS                  SEMICONDUCTOR
  STATE                  ALGORITHMS                GEOMETRY
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                 ┌────────────┴────────────┐
                 │                         │
                 ▼                         ▼
          NEMO NATIVE                 WEB / IMAGE
          VISUALS                    RETRIEVAL
                 │                         │
                 │                    IMAGE
                 │                   ANNOTATION
                 │                         │
                 └────────────┬────────────┘
                              ▼
                      UNIFIED SCENE GRAPH
                              │
                              ▼
                    DETERMINISTIC LAYOUT
                              │
                              ▼
                         TIMELINE
                              │
                              ▼
                           RENDER
                              │
                              ▼
                      VISUAL CRITIC
                              │
                         ┌────┴────┐
                         │         │
                       FAIL       PASS
                         │         │
                         ▼         ▼
                      REPAIR     VOICE
                         │         │
                         └────┬────┘
                              ▼
                       QUICK CHECK
                              │
                              ▼
                     LEARNER ANSWER
                              │
                              ▼
                       ADAPTATION
                              │
                              ▼
                     PERSISTENT LESSON

# ================================================================
# 81. CRITICAL NON-REGRESSION REQUIREMENT
# ================================================================

After implementation:

DO NOT claim completion merely because Mermaid renders.

Verify:

- existing application still starts
- existing chat still works
- Gemini still works
- OpenRouter still works
- local model provider still works
- dynamic model discovery still works
- Manim still renders
- ManimGL still renders
- existing visual functions still work
- existing canvas still works
- handwriting context still works
- image upload still works
- Mermaid renders
- Mermaid can coexist with Manim
- Mermaid can coexist with ManimGL
- hybrid lessons work
- real images can be retrieved online
- retrieved image provenance is preserved
- screenshots can be analyzed
- images can be annotated
- clicked visual objects retain semantic IDs
- follow-up questions use selected object context
- offline Mermaid works
- online Mermaid + web retrieval works
- visual critic works
- repair works
- fallback works

# ================================================================
# 82. REQUIRED ACCEPTANCE DEMOS
# ================================================================

DEMO 1:
Binary Search

Expected:
Mermaid overview
+
Manim execution animation

DEMO 2:
ESP32 LED

Expected:
Mermaid software/hardware flow
+
native ESP32
+
GPIO
+
Manim signal flow

DEMO 3:
I2C

Expected:
Mermaid sequence
+
Manim waveform

DEMO 4:
MOSFET

Expected:
Mermaid concept map
+
Manim device explanation
+
optional ManimGL 3D

DEMO 5:
PN Junction

Expected:
Mermaid conceptual flow
+
Manim carriers
+
optional ManimGL lattice

DEMO 6:
Raspberry Pi

Expected:
Mermaid GPIO flow
+
native board
+
Manim state transition

DEMO 7:
Brain

Expected:
real retrieved educational image where available
+
annotation
+
wireframe conceptual visual

DEMO 8:
Wormhole

Expected:
Mermaid conceptual overview
+
Manim curved spacetime
+
ManimGL 3D where useful

DEMO 9:
NEMO Architecture

Expected:
Mermaid architecture diagram
+
optional Manim animation of data flow

# ================================================================
# 83. IMPLEMENTATION PRINCIPLE
# ================================================================

Do not think:

"Add Mermaid."

Think:

"Create a unified multimodal visual intelligence layer."

Mermaid is one renderer.

Manim is one renderer.

ManimGL is one renderer.

Retrieved images are another visual source.

NEMO native primitives are another.

All must share:

semantic IDs
scene state
layout semantics
selection
lesson context
narration beats
critic
repair
canvas integration

# ================================================================
# 84. FINAL RULE
# ================================================================

NEMO must never ask:

"What renderer can I force this into?"

NEMO must ask:

"What visual representation will help this learner understand the concept?"

Then choose:

MERMAID
MANIM
MANIMGL
NATIVE
REAL IMAGE
IMAGE ANNOTATION
or a HYBRID

based on pedagogical need.

The final result must make NEMO feel like a single intelligent visual teacher rather than a collection of unrelated visualization tools.

IMPLEMENT THE COMPLETE INTEGRATION.
DO NOT STOP AT SCAFFOLDING.
DO NOT CREATE A DEMO-ONLY MERMAID PAGE.
DO NOT BREAK EXISTING MANIM / MANIMGL.
VERIFY THE COMPLETE END-TO-END PIPELINE.