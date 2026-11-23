// ============================================================================
// Core Data Model for 玄锻 ForgeMotion AE-Flavored Motion Design Editor
// ============================================================================

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];
export type ColorRGBA = [number, number, number, number]; // 0..1 linear/sRGB

export type PropValue = number | Vec2 | Vec3 | ColorRGBA | PathData;
export type PropValueType = 'scalar' | 'vec2' | 'vec3' | 'color' | 'path';

export type InterpolationType = 'linear' | 'bezier' | 'hold';

export interface TemporalEase {
  /** Horizontal handle offset in normalized [0..1] of segment duration */
  influence: number; // 0.01..1.0 (default 0.333)
  /** Outgoing or incoming value delta factor / slope */
  speed: number; // scalar slope (units/sec) or normalized factor when useNormalized=true
  /** Normalized cubic bezier control point [x, y] in segment space (0..1) */
  cp?: [number, number];
}

export interface Keyframe<T = any> {
  id: string;
  time: number; // seconds
  value: T;
  inType: InterpolationType;
  outType: InterpolationType;
  /** Cubic bezier control handles in normalized segment space (x in [0,1], y unconstrained for overshoot) */
  outHandle: [number, number]; // default [0.333, 0.333]
  inHandle: [number, number];  // default [0.667, 0.667]
  /** Spatial bezier tangents for vec2/vec3 position paths (world/comp offsets from keyframe value) */
  inSpatialTangent?: Vec3;
  outSpatialTangent?: Vec3;
  spatialBroken?: boolean;
  spatialLinear?: boolean;
}

export interface AnimProp<T = any> {
  id: string;
  label: string;
  type: PropValueType;
  value: T;
  animated: boolean;
  keyframes: Keyframe<T>[];
  expressionEnabled: boolean;
  expression: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

// ============================================================================
// Vector Paths & Shape Operations (2.5)
// ============================================================================

export interface BezierVertex {
  x: number;
  y: number;
  inX: number;  // relative handle offset from (x, y)
  inY: number;
  outX: number; // relative handle offset from (x, y)
  outY: number;
  broken?: boolean;
}

export interface PathContour {
  id: string;
  closed: boolean;
  vertices: BezierVertex[];
  /** Explicit hole hint or determined by winding/containment */
  isHole?: boolean;
}

export interface PathData {
  contours: PathContour[];
}

export type ShapePrimitiveType = 'rect' | 'ellipse' | 'path' | 'star';

export interface ShapeItem {
  id: string;
  name: string;
  kind: ShapePrimitiveType;
  visible: boolean;
  // Rect / Ellipse / Star params
  position: AnimProp<Vec2>;
  size: AnimProp<Vec2>;
  roundness: AnimProp<number>; // for rect
  points?: number; // for star
  innerRadius?: AnimProp<number>;
  // Free bezier path (supports path morphing via keyframed PathData!)
  path: AnimProp<PathData>;
}

export type ShapeModifierType = 'trim' | 'repeater' | 'boolean';
export type BooleanOpMode = 'union' | 'difference' | 'intersect';

export interface ShapeModifier {
  id: string;
  type: ShapeModifierType;
  name: string;
  enabled: boolean;
  // Trim paths
  start?: AnimProp<number>;  // 0..100
  end?: AnimProp<number>;    // 0..100
  offset?: AnimProp<number>; // degrees / %
  // Repeater
  copies?: AnimProp<number>;
  offsetIndex?: AnimProp<number>;
  repPosition?: AnimProp<Vec2>;
  repScale?: AnimProp<Vec2>;
  repRotation?: AnimProp<number>;
  repOpacityStart?: AnimProp<number>;
  repOpacityEnd?: AnimProp<number>;
  // Boolean
  boolOp?: BooleanOpMode;
  targetShapeIndex?: number; // operates on shapes or previous result vs next shape
}

export interface ShapeContent {
  items: ShapeItem[];
  fillEnabled: boolean;
  fillColor: AnimProp<ColorRGBA>;
  fillOpacity: AnimProp<number>;
  strokeEnabled: boolean;
  strokeColor: AnimProp<ColorRGBA>;
  strokeWidth: AnimProp<number>;
  strokeOpacity: AnimProp<number>;
  strokeCap: 'butt' | 'round' | 'square';
  strokeJoin: 'miter' | 'round' | 'bevel';
  modifiers: ShapeModifier[];
  /** Optional puppet pins for 2D shape deformation (2.8) */
  puppetPins?: PuppetPin[];
}

// ============================================================================
// Text & Text Animator (2.6)
// ============================================================================

export type TextAlign = 'left' | 'center' | 'right';
export type TextRangeUnit = 'char' | 'word' | 'line';

export interface TextAnimator {
  id: string;
  name: string;
  enabled: boolean;
  unit: TextRangeUnit;
  start: AnimProp<number>;     // 0..100%
  end: AnimProp<number>;       // 0..100%
  offset: AnimProp<number>;    // -100..100%
  softness: AnimProp<number>;  // 0..100% soft edge
  position: AnimProp<Vec3>;
  scale: AnimProp<Vec2>;       // % default [100,100]
  rotation: AnimProp<number>;  // degrees
  opacity: AnimProp<number>;   // 0..100
}

export interface TextContent {
  text: string;
  fontId: string; // 'noto-serif-sc' | 'noto-sans-sc' | 'ma-shan-zheng'
  fontSize: AnimProp<number>;
  lineHeight: AnimProp<number>;    // multiplier e.g. 1.25
  letterSpacing: AnimProp<number>; // px
  align: TextAlign;
  fillEnabled: boolean;
  fillColor: AnimProp<ColorRGBA>;
  strokeEnabled: boolean;
  strokeColor: AnimProp<ColorRGBA>;
  strokeWidth: AnimProp<number>;
  /** Stroke write-on progress 0..100 (optional direct write-on or via Node) */
  writeOnEnabled: boolean;
  writeOnProgress: AnimProp<number>; // 0..100
  writeOnFeather: AnimProp<number>;  // stroke overlap 0..1
  writeOnGlowColor: AnimProp<ColorRGBA>;
  animators: TextAnimator[];
  puppetPins?: PuppetPin[];
}

// ============================================================================
// Space Fields & Geometry Deformers (2.8)
// ============================================================================

export type FieldKind = 'distance' | 'noise' | 'vortex';
export type FieldBlendMode = 'add' | 'multiply' | 'max' | 'lerp';

export interface FieldContent {
  kind: FieldKind;
  radius: AnimProp<number>;      // influence radius in world units
  falloff: AnimProp<number>;     // curve exponent 0.2..5
  strength: AnimProp<number>;    // magnitude
  direction: AnimProp<Vec3>;     // displacement/force direction for distance field, axis for vortex
  noiseScale: AnimProp<number>;  // frequency for noise
  noiseSpeed: AnimProp<number>;  // temporal evolution speed
  swirlAngle: AnimProp<number>;  // vortex swirl factor
  pullInward: AnimProp<number>;  // vortex radial pull
  invert: boolean;
  showGizmo: boolean;
  gizmoColor: ColorRGBA;
}

export interface PuppetPin {
  id: string;
  name: string;
  restPos: Vec2;              // in layer local 2D space
  position: AnimProp<Vec2>;   // animated target pos
  rotation: AnimProp<number>; // degrees
  scale: AnimProp<number>;    // % default 100
  radius: number;             // influence radius
}

export type DeformerType = 'bend' | 'twist' | 'field' | 'puppet';

export interface MeshDeformer {
  id: string;
  type: DeformerType;
  name: string;
  enabled: boolean;
  // Bend / Twist
  amount?: AnimProp<number>; // degrees
  axis?: 'x' | 'y' | 'z';
  centerOffset?: AnimProp<number>;
  // Field deformer
  fieldLayerIds?: string[];
  fieldNodeRef?: { nodeId: string; portId: string };
  fieldBlend?: FieldBlendMode;
  fieldStrength?: AnimProp<number>;
  // Impact dent mode: directional displacement along field vector or radial push
  displaceMode?: 'vector' | 'normal' | 'radial' | 'dent';
  // Puppet pins
  pins?: PuppetPin[];
}

// ============================================================================
// 3D Solid Mesh, PBR Material, Light & Camera (2.11, 2.12)
// ============================================================================

export interface PBRMaterial {
  baseColor: AnimProp<ColorRGBA>;
  metallic: AnimProp<number>;         // 0..1
  roughness: AnimProp<number>;        // 0.04..1
  emissiveColor: AnimProp<ColorRGBA>;
  emissiveIntensity: AnimProp<number>;// 0..10
  opacity: AnimProp<number>;          // 0..1
  /** Optional thermal/field-driven hot-zone glow boost */
  heatFieldLayerId?: string;
  heatColor?: AnimProp<ColorRGBA>;
  heatIntensity?: AnimProp<number>;
}

export type MeshSourceType = 'layer' | 'node' | 'primitive';
export type PrimitiveMeshKind = 'box' | 'cylinder' | 'sphere' | 'anvil' | 'hammer' | 'plane';

export interface Mesh3DContent {
  sourceType: MeshSourceType;
  sourceLayerId?: string;
  sourceNodeRef?: { nodeId: string; portId: string };
  primitiveKind?: PrimitiveMeshKind;
  primitiveSize?: AnimProp<Vec3>;
  extrudeDepth: AnimProp<number>;
  bevelSize: AnimProp<number>;
  bevelSegments: number;
  curveSubdivisions: number;
  /** Optional stroke-write-on progress on 3D extruded glyph (0..100) */
  revealProgress?: AnimProp<number>;
  material: PBRMaterial;
  castShadow: boolean;
  receiveShadow: boolean;
  deformers: MeshDeformer[];
  /** Interior subdivision grid density for smooth bending/denting */
  interiorSubdiv?: number;
}

export interface LightContent {
  lightType: 'directional' | 'point';
  color: AnimProp<ColorRGBA>;
  intensity: AnimProp<number>;
  target: AnimProp<Vec3>; // for directional light
  range: AnimProp<number>; // for point light
  castShadow: boolean;
  shadowBias: number;
  shadowSoftness: number;
}

export interface CameraContent {
  target: AnimProp<Vec3>;
  fov: AnimProp<number>;           // vertical FOV degrees
  focalDistance: AnimProp<number>; // distance from camera to sharp focus plane
  aperture: AnimProp<number>;      // 0..100 (DoF blur strength)
  dofEnabled: boolean;
  nearClip: number;
  farClip: number;
}

// ============================================================================
// Masks, Track Mattes, Effects & Blend Modes (2.9)
// ============================================================================

export type BlendMode = 'normal' | 'add' | 'screen' | 'multiply' | 'overlay';
export type TrackMatteMode = 'none' | 'alpha' | 'alphaInverted' | 'luma' | 'lumaInverted';
export type MaskMode = 'add' | 'subtract' | 'intersect';

export interface MaskItem {
  id: string;
  name: string;
  enabled: boolean;
  kind: 'rect' | 'ellipse' | 'path';
  mode: MaskMode;
  inverted: boolean;
  opacity: AnimProp<number>;  // 0..100
  feather: AnimProp<number>;  // px
  path: AnimProp<PathData>;
}

export type EffectType = 'gaussianBlur' | 'glow' | 'dropShadow' | 'hsl';

export interface LayerEffect {
  id: string;
  type: EffectType;
  name: string;
  enabled: boolean;
  // Gaussian Blur
  blurRadius?: AnimProp<number>;
  // Glow
  glowThreshold?: AnimProp<number>; // 0..1
  glowRadius?: AnimProp<number>;
  glowIntensity?: AnimProp<number>;
  glowColor?: AnimProp<ColorRGBA>;
  // Drop Shadow
  shadowColor?: AnimProp<ColorRGBA>;
  shadowOpacity?: AnimProp<number>; // 0..100
  shadowAngle?: AnimProp<number>;   // deg
  shadowDistance?: AnimProp<number>;
  shadowBlur?: AnimProp<number>;
  // HSL
  hue?: AnimProp<number>;        // -180..180
  saturation?: AnimProp<number>; // -100..100
  lightness?: AnimProp<number>;  // -100..100
}

// ============================================================================
// Pre-Composition (2.10)
// ============================================================================

export interface PrecompContent {
  compId: string;
  timeRemapEnabled: boolean;
  timeRemap: AnimProp<number>; // seconds in source comp
}

// ============================================================================
// Particle System, Forces & Collisions (2.13)
// ============================================================================

export type EmitterSourceKind = 'point' | 'curve' | 'surface';

export interface ParticleEmitter {
  id: string;
  name: string;
  enabled: boolean;
  sourceKind: EmitterSourceKind;
  sourceLayerId?: string;
  sourceNodeRef?: { nodeId: string; portId: string };
  position: AnimProp<Vec3>;
  rate: AnimProp<number>;         // particles/sec
  burst: AnimProp<number>;        // instant impulse trigger count (when crosses > 0 or animated peak)
  speed: AnimProp<number>;        // initial speed
  speedVar: number;               // 0..1
  direction: AnimProp<Vec3>;      // bias direction
  spread: AnimProp<number>;       // cone half-angle degrees
  normalBoost: number;            // emission along surface normal
  inheritVelocity: number;        // 0..1
  life: AnimProp<number>;         // seconds
  lifeVar: number;                // 0..1
  sizeStart: AnimProp<number>;
  sizeEnd: AnimProp<number>;
  colorStart: AnimProp<ColorRGBA>;
  colorMid: AnimProp<ColorRGBA>;
  colorEnd: AnimProp<ColorRGBA>;
  opacityStart: number;
  opacityEnd: number;
  seed: number;
  /** Optional Space Field weighting: emit preferentially where field strength > 0 */
  weightFieldLayerId?: string;
  emissiveBoost: number;
}

export interface ParticleAttractor {
  id: string;
  name: string;
  enabled: boolean;
  position: AnimProp<Vec3>;
  strength: AnimProp<number>; // positive = attract, negative = repel
  radius: AnimProp<number>;
}

export interface ParticleContent {
  emitters: ParticleEmitter[];
  gravity: AnimProp<Vec3>;
  directionalForce: AnimProp<Vec3>;
  drag: AnimProp<number>;
  attractors: ParticleAttractor[];
  fieldLayerIds: string[];
  fieldNodeRef?: { nodeId: string; portId: string };
  colliderLayerIds: string[];
  colliderNodeRefs?: { nodeId: string; portId: string }[];
  restitution: AnimProp<number>; // bounce 0..1
  friction: AnimProp<number>;    // 0..1
  // Collision triggers
  onCollisionColor: ColorRGBA;
  onCollisionColorMix: number;   // 0..1
  onCollisionLifeMult: number;   // e.g. 0.7
  subEmitOnCollision: boolean;
  subEmitCount: number;
  subEmitSpeed: number;
  subEmitLife: number;
  subEmitSize: number;
  subEmitColor: ColorRGBA;
  // Trails
  trailsEnabled: boolean;
  trailLength: AnimProp<number>; // seconds
  trailWidth: AnimProp<number>;
  trailColor: AnimProp<ColorRGBA>;
  trailFade: number;             // exponent
  maxParticles: number;
  simFps: number;                // fixed sub-step rate e.g. 60 or 120
}

// ============================================================================
// Procedural Audio Synth Layer (2.15)
// ============================================================================

export type AudioPresetKind =
  | 'forgeStrike'
  | 'metalRing'
  | 'brushStroke'
  | 'emberCrackle'
  | 'subBass'
  | 'padDrone'
  | 'synthArp';

export interface AudioEvent {
  id: string;
  time: number;     // seconds
  duration: number; // seconds
  pitch: number;    // Hz or MIDI note
  velocity: number; // 0..1
}

export interface AudioContent {
  preset: AudioPresetKind;
  gain: AnimProp<number>;          // 0..2
  pitchShift: AnimProp<number>;    // semitones -24..24
  filterCutoff: AnimProp<number>;  // Hz 80..12000
  decay: AnimProp<number>;         // seconds 0.05..6
  reverbMix: AnimProp<number>;     // 0..1
  muted: boolean;
  events: AudioEvent[];
}

// ============================================================================
// Transform & Layer
// ============================================================================

export interface TransformData {
  anchor: AnimProp<Vec3>;
  position: AnimProp<Vec3>;
  scale: AnimProp<Vec3>; // percent [100, 100, 100]
  rotation: AnimProp<Vec3>; // [rotX, rotY, rotZ] degrees (2D uses rotZ)
  opacity: AnimProp<number>; // 0..100
}

export type LayerType =
  | 'shape'
  | 'text'
  | 'null'
  | 'adjustment'
  | 'precomp'
  | 'camera'
  | 'light'
  | 'mesh3d'
  | 'particle'
  | 'audio'
  | 'field';

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  solo: boolean;
  is3D: boolean;
  motionBlur: boolean;
  labelColor: string;
  parentId: string | null;
  inPoint: number;    // seconds
  outPoint: number;   // seconds
  startTime: number;  // layer time offset (especially for precomps)
  blendMode: BlendMode;
  trackMatte: TrackMatteMode;
  transform: TransformData;
  masks: MaskItem[];
  effects: LayerEffect[];
  // Type-specific payload (only one populated matching `type`)
  shape?: ShapeContent;
  text?: TextContent;
  precomp?: PrecompContent;
  camera?: CameraContent;
  light?: LightContent;
  mesh3d?: Mesh3DContent;
  particle?: ParticleContent;
  audio?: AudioContent;
  field?: FieldContent;
}

// ============================================================================
// Procedural Node Graph (2.7)
// ============================================================================

export type PortDataType = 'scalar' | 'vec3' | 'color' | 'path' | 'mesh' | 'field';

export interface NodePort {
  id: string;
  name: string;
  dataType: PortDataType;
  direction: 'in' | 'out';
  defaultValue?: any;
}

export type NodeKind =
  | 'sourceShape'
  | 'sourceText'
  | 'strokeWriteOn'
  | 'primitivePath'
  | 'primitiveMesh'
  | 'pathTransform'
  | 'trimPath'
  | 'repeater'
  | 'booleanOp'
  | 'extrude3d'
  | 'fieldGenerator'
  | 'fieldBlend'
  | 'deformMesh'
  | 'meshTransform'
  | 'mergeMesh'
  | 'scatterPoints'
  | 'valueScalar'
  | 'valueVec3'
  | 'valueColor'
  | 'mathOp'
  | 'group'
  | 'output';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  title: string;
  x: number;
  y: number;
  params: Record<string, any>;
  animParams?: Record<string, AnimProp<any>>;
  inputs: NodePort[];
  outputs: NodePort[];
  /** For encapsulated Node Groups (2.7) */
  subGraph?: NodeGraph;
  collapsed?: boolean;
}

export interface GraphEdge {
  id: string;
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
}

export interface NodeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ============================================================================
// Composition & Project (2.1, 2.14)
// ============================================================================

export interface Composition {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  workAreaStart: number;
  workAreaEnd: number;
  bgColor: ColorRGBA;
  bgTransparent: boolean;
  motionBlur: boolean;
  shutterAngle: number; // default 180
  shutterPhase: number; // default -90
  motionBlurSamples: number; // default 8
  layers: Layer[];
  nodeGraph: NodeGraph;
}

export interface Project {
  version: string;
  name: string;
  activeCompId: string;
  compositions: Composition[];
}

// ============================================================================
// Runtime Evaluated Geometry & Contexts (non-serialized)
// ============================================================================

export interface Poly2D {
  points: Vec2[]; // flattened polyline
  closed: boolean;
  isHole?: boolean;
}

export interface TriMesh3D {
  /** Interleaved or separate Float32Arrays for GPU & raycast/collision */
  positions: Float32Array; // 3 * vertexCount
  normals: Float32Array;   // 3 * vertexCount
  uvs: Float32Array;       // 2 * vertexCount
  /** Per-vertex scalar weight (e.g. heat/deformation intensity for shader glow!) */
  heat: Float32Array;      // 1 * vertexCount
  indices: Uint32Array;    // 3 * triCount
  boundsMin: Vec3;
  boundsMax: Vec3;
}

export interface EvaluatedField {
  sample(p: Vec3, time: number): { weight: number; force: Vec3 };
  debugGizmos: Array<{
    kind: FieldKind;
    center: Vec3;
    radius: number;
    direction: Vec3;
    color: ColorRGBA;
    strength: number;
  }>;
}

export type ActiveTool =
  | 'select'
  | 'anchor'
  | 'rotate'
  | 'scale'
  | 'pen'
  | 'rect'
  | 'ellipse'
  | 'text'
  | 'puppet'
  | 'cameraOrbit';

export interface ExpressionDiagnostic {
  layerId: string;
  propPath: string;
  error: string;
}
