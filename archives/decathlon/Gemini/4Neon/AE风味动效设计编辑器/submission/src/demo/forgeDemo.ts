import { Composition, Project } from '../core/types';
import {
  createDeformer, createDefaultEmitter, createEffect, createEmptyComposition,
  createGraphNode, createLayer, createShapeItem,
} from '../core/project';
import { makeKeyframe, makeProp } from '../core/animation';
import { genId } from '../core/math';

/**
 * Build the default 15-second 「锻字」 masterpiece project.
 * 100% built from real, editable layers, procedural nodes, keyframes, spatial curves,
 * expressions, space fields, PBR materials, shadow lights, DoF camera, colliding particles, and synth audio.
 */
export function createForgeDemoProject(): Project {
  const mainComp = createEmptyComposition('锻字 · 主合成', 1280, 720, 30, 15);
  mainComp.bgColor = [0.028, 0.032, 0.044, 1];
  mainComp.bgTransparent = false;
  mainComp.workAreaStart = 0;
  mainComp.workAreaEnd = 15;
  mainComp.motionBlur = true;
  mainComp.shutterAngle = 150;
  mainComp.shutterPhase = -75;
  mainComp.motionBlurSamples = 5;

  // =========================================================================
  // 1) Hero Source Text Layer: 「锻」 (2D calligraphic write-on in Phase 1,
  //    AND live vector source for the 3D Extruded Metal Block via Node Graph!)
  // =========================================================================
  const textLayer = createLayer(mainComp, 'text', '主字形「锻」', { text: '锻' });
  textLayer.is3D = true; // Lives cleanly in 3D space right on the forge plane!
  textLayer.motionBlur = false;
  textLayer.inPoint = 0;
  textLayer.outPoint = 15;
  textLayer.transform.position.value = [0, 0, 2];
  textLayer.transform.scale.value = [100, 100, 100];
  // Fade out 2D write-on strokes smoothly right as 3D solid block emerges at 3.7s..4.3s
  textLayer.transform.opacity.animated = true;
  textLayer.transform.opacity.keyframes = [
    makeKeyframe(0.0, 100, 'linear'),
    makeKeyframe(3.65, 100, 'ease'),
    makeKeyframe(4.25, 0, 'ease'),
    makeKeyframe(15.0, 0, 'linear'),
  ];
  textLayer.text!.fontId = 'noto-serif-sc';
  textLayer.text!.fontSize.value = 285;
  textLayer.text!.fillEnabled = true;
  textLayer.text!.fillColor.animated = true;
  textLayer.text!.fillColor.keyframes = [
    makeKeyframe(0.0, [1.0, 0.88, 0.66, 1], 'ease'),
    makeKeyframe(2.8, [1.0, 0.72, 0.34, 1], 'ease'),
    makeKeyframe(4.0, [1.0, 0.45, 0.12, 1], 'ease'),
  ];
  textLayer.text!.strokeEnabled = true;
  textLayer.text!.strokeColor.value = [1.0, 0.62, 0.18, 1];
  textLayer.text!.strokeWidth.value = 3.5;
  textLayer.text!.writeOnEnabled = true;
  textLayer.text!.writeOnFeather.value = 0.28;
  // Frame 0 already starts with bold first strokes visible (14%) so frame 0 composition stands strong!
  textLayer.text!.writeOnProgress.animated = true;
  textLayer.text!.writeOnProgress.keyframes = [
    makeKeyframe(0.0, 14, 'easeOut'),
    makeKeyframe(1.2, 46, 'ease'),
    makeKeyframe(2.5, 80, 'ease'),
    makeKeyframe(3.45, 100, 'easeIn'),
    makeKeyframe(15.0, 100, 'linear'),
  ];

  // =========================================================================
  // 2) Space Fields (2.8): Impact Dent Field + Rising Thermal Vortex Field
  //    Shared by BOTH 3D Metal Block vertex deformation AND Spark particles!
  // =========================================================================
  const impactField = createLayer(mainComp, 'field', '锤击冲击场', { fieldKind: 'distance' });
  impactField.transform.position.animated = true;
  impactField.transform.position.keyframes = [
    makeKeyframe(0.0, [32, 36, 48], 'hold'),
    makeKeyframe(7.05, [32, 36, 46], 'hold'),
    makeKeyframe(8.55, [-18, -2, 46], 'ease'),
  ];
  impactField.field!.radius.animated = true;
  impactField.field!.radius.keyframes = [
    makeKeyframe(0.0, 96, 'linear'),
    makeKeyframe(7.10, 108, 'ease'),
    makeKeyframe(8.65, 118, 'ease'),
  ];
  impactField.field!.falloff.value = 1.65;
  impactField.field!.direction.value = [0.06, -0.18, -1.0];
  // Permanent forged dent accumulates across strike 1 (7.10s) and climax strike 2 (8.65s)!
  impactField.field!.strength.animated = true;
  impactField.field!.strength.keyframes = [
    makeKeyframe(0.0, 0, 'hold'),
    makeKeyframe(7.04, 0, 'linear'),
    makeKeyframe(7.13, 30, 'easeOut'),
    makeKeyframe(7.35, 21, 'ease'),
    makeKeyframe(8.58, 21, 'linear'),
    makeKeyframe(8.68, 44, 'easeOut'),
    makeKeyframe(9.05, 34, 'ease'),
    makeKeyframe(15.0, 34, 'linear'),
  ];
  impactField.field!.showGizmo = true;

  const vortexField = createLayer(mainComp, 'field', '热浪旋涡场', { fieldKind: 'vortex' });
  vortexField.transform.position.value = [0, 70, 20];
  vortexField.field!.radius.value = 460;
  vortexField.field!.falloff.value = 1.1;
  vortexField.field!.direction.value = [0.1, 1.0, 0.15];
  vortexField.field!.swirlAngle.value = 1.25;
  vortexField.field!.pullInward.value = -0.35; // gentle outward convective draft
  vortexField.field!.strength.animated = true;
  vortexField.field!.strength.keyframes = [
    makeKeyframe(0.0, 6, 'linear'),
    makeKeyframe(7.08, 12, 'ease'),
    makeKeyframe(7.18, 42, 'easeOut'),
    makeKeyframe(8.62, 18, 'ease'),
    makeKeyframe(8.72, 62, 'easeOut'),
    makeKeyframe(11.5, 12, 'ease'),
    makeKeyframe(15.0, 4, 'ease'),
  ];
  vortexField.field!.showGizmo = false;

  // =========================================================================
  // 3) Procedural Node Graph (2.7):
  //    SourceText("主字形「锻」") -> Extrude3D -> DeformMesh(ImpactField) -> Output
  //    ImpactField + VortexField -> FieldBlend -> Output
  // =========================================================================
  const nText = createGraphNode('sourceText', 16, 16, '文字字形源');
  nText.params.layerId = textLayer.id;

  const nExtrude = createGraphNode('extrude3d', 236, 14, '三维金属挤出');
  nExtrude.params.depth = 76;
  nExtrude.params.bevel = 7.2;
  nExtrude.params.bevelSegments = 3;
  nExtrude.params.interiorSubdiv = 26;
  nExtrude.animParams = {
    depth: makeProp('depth', '挤出深度', 'scalar', 76, {
      animated: true,
      keyframes: [
        makeKeyframe(3.60, 4, 'easeOut'),
        makeKeyframe(5.35, 76, 'ease'),
        makeKeyframe(15.0, 76, 'linear'),
      ],
    }),
    bevel: makeProp('bevel', '倒角尺寸', 'scalar', 7.2, {
      animated: true,
      keyframes: [
        makeKeyframe(3.60, 1.0, 'easeOut'),
        makeKeyframe(5.35, 7.2, 'ease'),
        makeKeyframe(15.0, 7.2, 'linear'),
      ],
    }),
  };

  const nImpactField = createGraphNode('fieldGenerator', 16, 134, '锤击冲击场节点');
  nImpactField.params.layerId = impactField.id;
  nImpactField.params.fieldKind = 'distance';

  const nVortexField = createGraphNode('fieldGenerator', 236, 144, '热浪旋涡场节点');
  nVortexField.params.layerId = vortexField.id;
  nVortexField.params.fieldKind = 'vortex';

  const nFieldBlend = createGraphNode('fieldBlend', 460, 134, '复合空间场');
  nFieldBlend.params.mode = 'add';
  nFieldBlend.params.mix = 0.5;

  const nDeform = createGraphNode('deformMesh', 460, 14, '锻打压痕变形');
  nDeform.params.mode = 'field';
  nDeform.params.displaceMode = 'dent';
  nDeform.params.amount = 1.0;

  const nOutput = createGraphNode('output', 686, 68, '锻字主输出');
  nOutput.params.label = '锻字三维实体';

  mainComp.nodeGraph = {
    nodes: [nText, nExtrude, nImpactField, nVortexField, nFieldBlend, nDeform, nOutput],
    edges: [
      { id: genId('edg'), fromNodeId: nText.id, fromPortId: 'path', toNodeId: nExtrude.id, toPortId: 'path' },
      { id: genId('edg'), fromNodeId: nExtrude.id, fromPortId: 'mesh', toNodeId: nDeform.id, toPortId: 'mesh' },
      { id: genId('edg'), fromNodeId: nImpactField.id, fromPortId: 'field', toNodeId: nDeform.id, toPortId: 'field' },
      { id: genId('edg'), fromNodeId: nDeform.id, fromPortId: 'mesh', toNodeId: nOutput.id, toPortId: 'mesh' },
      { id: genId('edg'), fromNodeId: nImpactField.id, fromPortId: 'field', toNodeId: nFieldBlend.id, toPortId: 'a' },
      { id: genId('edg'), fromNodeId: nVortexField.id, fromPortId: 'field', toNodeId: nFieldBlend.id, toPortId: 'b' },
      { id: genId('edg'), fromNodeId: nFieldBlend.id, fromPortId: 'field', toNodeId: nOutput.id, toPortId: 'field' },
    ],
  };

  // =========================================================================
  // 4) Hero 3D Solid Layer: 「锻造金属字块」
  //    Bound directly to the Text Layer + Space Field Deformer!
  //    (Swapping text in 主字形「锻」 immediately updates this 3D block,
  //     its bevels, its holes, its hammer dent, its shadows, and its sparks!)
  // =========================================================================
  const heroMesh = createLayer(mainComp, 'mesh3d', '锻造金属字块', { sourceLayerId: textLayer.id });
  heroMesh.mesh3d!.sourceType = 'node';
  heroMesh.mesh3d!.sourceNodeRef = { nodeId: nOutput.id, portId: 'mesh' };
  heroMesh.inPoint = 3.55;
  heroMesh.outPoint = 15.0;
  heroMesh.motionBlur = true;
  heroMesh.transform.position.animated = true;
  heroMesh.transform.position.keyframes = [
    makeKeyframe(3.55, [0, 0, 0], 'ease'),
    makeKeyframe(4.80, [0, 0, 0], 'ease'),
    // Subtle heavy settle downward on strikes 1 & 2 (real mass & anvil reaction!)
    makeKeyframe(7.08, [0, 0, 0], 'linear'),
    makeKeyframe(7.14, [0, -7, -5], 'easeOut'),
    makeKeyframe(7.35, [0, -1, -1], 'ease'),
    makeKeyframe(8.62, [0, -1, -1], 'linear'),
    makeKeyframe(8.69, [0, -11, -8], 'easeOut'),
    makeKeyframe(8.98, [0, -2, -2], 'ease'),
    makeKeyframe(11.8, [0, 0, 0], 'ease'),
    makeKeyframe(15.0, [0, 0, 0], 'linear'),
  ];
  heroMesh.transform.scale.animated = true;
  heroMesh.transform.scale.keyframes = [
    makeKeyframe(3.55, [100, 100, 100], 'linear'),
    makeKeyframe(7.08, [100, 100, 100], 'linear'),
    makeKeyframe(7.14, [103.5, 96.8, 95], 'easeOut'),
    makeKeyframe(7.38, [100.5, 99.6, 99], 'ease'),
    makeKeyframe(8.62, [100.5, 99.6, 99], 'linear'),
    makeKeyframe(8.69, [106, 94.5, 91], 'easeOut'),
    makeKeyframe(9.05, [101.2, 99.2, 97], 'ease'),
    makeKeyframe(15.0, [101.2, 99.2, 97], 'linear'),
  ];
  heroMesh.transform.opacity.animated = true;
  heroMesh.transform.opacity.keyframes = [
    makeKeyframe(3.55, 0, 'easeOut'),
    makeKeyframe(4.05, 100, 'ease'),
    makeKeyframe(15.0, 100, 'linear'),
  ];

  // Animated Extrusion & Bevel emergence in Phase 2 (成块)!
  heroMesh.mesh3d!.extrudeDepth.animated = true;
  heroMesh.mesh3d!.extrudeDepth.keyframes = [
    makeKeyframe(3.60, 4, 'easeOut'),
    makeKeyframe(5.35, 76, 'ease'),
    makeKeyframe(15.0, 76, 'linear'),
  ];
  heroMesh.mesh3d!.bevelSize.animated = true;
  heroMesh.mesh3d!.bevelSize.keyframes = [
    makeKeyframe(3.60, 1.0, 'easeOut'),
    makeKeyframe(5.35, 7.2, 'ease'),
    makeKeyframe(15.0, 7.2, 'linear'),
  ];
  heroMesh.mesh3d!.bevelSegments = 3;
  heroMesh.mesh3d!.interiorSubdiv = 26;
  heroMesh.mesh3d!.castShadow = true;
  heroMesh.mesh3d!.receiveShadow = true;

  // Node Graph already applies the Impact Space Field Deformer (`nDeform`),
  // while keeping an optional disabled extra deformer slot ready for user experimentation!
  const dentDef = createDeformer('bend');
  dentDef.name = '附加弯曲(可启用)';
  dentDef.enabled = false;
  dentDef.amount!.value = 18;
  heroMesh.mesh3d!.deformers = [dentDef];

  // PBR Material Evolution: Dark Iron -> Incandescent Molten Glow -> Quenched Brushed Damascus Steel!
  const mat = heroMesh.mesh3d!.material;
  mat.baseColor.animated = true;
  mat.baseColor.keyframes = [
    makeKeyframe(3.6, [0.32, 0.24, 0.20, 1], 'ease'),
    makeKeyframe(5.5, [0.46, 0.25, 0.16, 1], 'ease'),
    makeKeyframe(8.7, [0.52, 0.30, 0.20, 1], 'ease'),
    makeKeyframe(11.4, [0.62, 0.66, 0.72, 1], 'ease'),
    makeKeyframe(13.2, [0.68, 0.73, 0.80, 1], 'ease'),
    makeKeyframe(15.0, [0.68, 0.73, 0.80, 1], 'linear'),
  ];
  mat.metallic.animated = true;
  mat.metallic.keyframes = [
    makeKeyframe(3.6, 0.78, 'ease'),
    makeKeyframe(5.5, 0.84, 'ease'),
    makeKeyframe(10.8, 0.90, 'ease'),
    makeKeyframe(13.0, 0.96, 'ease'),
    makeKeyframe(15.0, 0.96, 'linear'),
  ];
  mat.roughness.animated = true;
  mat.roughness.keyframes = [
    makeKeyframe(3.6, 0.44, 'ease'),
    makeKeyframe(5.5, 0.38, 'ease'),
    makeKeyframe(10.6, 0.30, 'ease'),
    makeKeyframe(13.2, 0.20, 'ease'),
    makeKeyframe(15.0, 0.20, 'linear'),
  ];
  mat.emissiveColor.animated = true;
  mat.emissiveColor.keyframes = [
    makeKeyframe(3.6, [1.0, 0.22, 0.02, 1], 'ease'),
    makeKeyframe(5.6, [1.0, 0.28, 0.03, 1], 'ease'),
    makeKeyframe(8.68, [1.0, 0.36, 0.05, 1], 'ease'),
    makeKeyframe(10.8, [0.85, 0.14, 0.01, 1], 'ease'),
    makeKeyframe(12.6, [0.12, 0.02, 0.01, 1], 'ease'),
  ];
  mat.emissiveIntensity.animated = true;
  mat.emissiveIntensity.keyframes = [
    makeKeyframe(3.6, 0.35, 'ease'),
    makeKeyframe(5.5, 1.15, 'ease'),
    makeKeyframe(7.12, 1.48, 'easeOut'),
    makeKeyframe(8.20, 1.05, 'ease'),
    makeKeyframe(8.68, 1.75, 'easeOut'),
    makeKeyframe(10.2, 0.72, 'ease'),
    makeKeyframe(11.6, 0.18, 'ease'),
    makeKeyframe(12.8, 0.0, 'ease'),
    makeKeyframe(15.0, 0.0, 'linear'),
  ];
  mat.heatFieldLayerId = impactField.id;
  mat.heatColor!.value = [1.0, 0.56, 0.12, 1];
  mat.heatIntensity!.animated = true;
  mat.heatIntensity!.keyframes = [
    makeKeyframe(0.0, 0.0, 'hold'),
    makeKeyframe(7.05, 0.0, 'linear'),
    makeKeyframe(7.13, 1.9, 'easeOut'),
    makeKeyframe(8.40, 0.85, 'ease'),
    makeKeyframe(8.67, 2.35, 'easeOut'),
    makeKeyframe(10.5, 0.85, 'ease'),
    makeKeyframe(12.4, 0.0, 'ease'),
    makeKeyframe(15.0, 0.0, 'linear'),
  ];

  // =========================================================================
  // 5) Sculpted Forging Hammer: 「锻造重锤」
  //    Clear Anticipation -> Rapid Acceleration -> Crisp Strike -> Rebound Follow-Through!
  // =========================================================================
  const hammerLayer = createLayer(mainComp, 'mesh3d', '锻造重锤', { primitiveKind: 'hammer' });
  hammerLayer.inPoint = 5.85;
  hammerLayer.outPoint = 10.65;
  hammerLayer.motionBlur = true;
  hammerLayer.mesh3d!.primitiveSize!.value = [90, 96, 86];
  hammerLayer.mesh3d!.material.baseColor.value = [0.24, 0.27, 0.32, 1];
  hammerLayer.mesh3d!.material.metallic.value = 0.90;
  hammerLayer.mesh3d!.material.roughness.value = 0.34;
  hammerLayer.mesh3d!.castShadow = true;
  hammerLayer.mesh3d!.receiveShadow = true;

  // Spatial curved swing arc for the Hammer with crisp Anticipation -> Whip Acceleration -> Snap Rebound!
  const kStrike1Windup = makeKeyframe(6.88, [108, 254, 278] as [number, number, number], 'ease');
  kStrike1Windup.outType = 'bezier'; kStrike1Windup.outHandle = [0.78, 0.02];
  const kStrike1Hit = makeKeyframe(7.10, [48, 42, 66] as [number, number, number], 'ease');
  kStrike1Hit.inType = 'bezier'; kStrike1Hit.inHandle = [0.95, 0.48];
  kStrike1Hit.outType = 'bezier'; kStrike1Hit.outHandle = [0.14, 0.88];

  const kStrike2Windup = makeKeyframe(8.42, [98, 322, 344] as [number, number, number], 'ease');
  kStrike2Windup.outType = 'bezier'; kStrike2Windup.outHandle = [0.80, 0.02];
  const kStrike2Hit = makeKeyframe(8.65, [12, 8, 64] as [number, number, number], 'ease');
  kStrike2Hit.inType = 'bezier'; kStrike2Hit.inHandle = [0.96, 0.50];
  kStrike2Hit.outType = 'bezier'; kStrike2Hit.outHandle = [0.12, 0.90];

  hammerLayer.transform.position.animated = true;
  hammerLayer.transform.position.keyframes = [
    makeKeyframe(5.85, [300, 390, 290], 'ease', { outTan: [-40, 60, -30] }),
    makeKeyframe(6.65, [120, 215, 245], 'ease', { inTan: [30, 40, 20], outTan: [-15, 45, 25] }),
    kStrike1Windup,
    kStrike1Hit,
    makeKeyframe(7.42, [105, 175, 200], 'ease'),
    makeKeyframe(8.22, [110, 292, 318], 'ease'),
    kStrike2Windup,
    kStrike2Hit,
    makeKeyframe(8.92, [96, 155, 205], 'ease'),
    makeKeyframe(10.55, [360, 420, 360], 'ease'),
  ];
  hammerLayer.transform.rotation.animated = true;
  hammerLayer.transform.rotation.keyframes = [
    makeKeyframe(5.85, [-78, -12, 32], 'ease'),
    makeKeyframe(6.65, [-72, -10, 26], 'ease'),
    makeKeyframe(6.88, [-64, -14, 34], 'easeOut'),
    makeKeyframe(7.10, [-94, -4, 4], 'linear'), // striking face squarely parallel to front of glyph!
    makeKeyframe(7.42, [-76, -8, 18], 'easeOut'),
    makeKeyframe(8.22, [-58, -16, 38], 'ease'),
    makeKeyframe(8.42, [-54, -18, 42], 'easeOut'),
    makeKeyframe(8.65, [-96, 4, -6], 'linear'),
    makeKeyframe(9.05, [-78, -6, 16], 'easeOut'),
    makeKeyframe(10.55, [-55, -20, 45], 'ease'),
  ];

  // =========================================================================
  // 6) Sculpted Heavy Forge Anvil Platform: 「锻造铁砧」
  //    Receives real crisp shadows (including the 3 interior holes of 「锻」!)
  //    AND acts as real 3D physical collider for bouncing sparks!
  // =========================================================================
  const anvilLayer = createLayer(mainComp, 'mesh3d', '锻造铁砧', { primitiveKind: 'anvil' });
  anvilLayer.motionBlur = false;
  anvilLayer.transform.position.value = [0, -142, 0];
  anvilLayer.mesh3d!.primitiveSize!.value = [620, 155, 380];
  anvilLayer.mesh3d!.material.baseColor.value = [0.22, 0.25, 0.30, 1];
  anvilLayer.mesh3d!.material.metallic.value = 0.80;
  anvilLayer.mesh3d!.material.roughness.value = 0.39;
  anvilLayer.mesh3d!.castShadow = false;
  anvilLayer.mesh3d!.receiveShadow = true;

  // =========================================================================
  // 7) Particle System: 「锻打火星」
  //    - Emitter 1: Surface emitter bound to DEFORMED 锻造金属字块 + weighted by 锤击冲击场!
  //    - Emitter 2: Gentle ambient rising forge embers + stroke sparks!
  //    - Forces: Gravity + 熱浪旋涡场 (same 2.8 field!)
  //    - Colliders: 锻造铁砧 + 锻造金属字块 (bounces, shifts color, splits into secondary micro-sparks!)
  //    - 3D Trajectory Trails participating in unified depth occlusion!
  // =========================================================================
  const particleLayer = createLayer(mainComp, 'particle', '锻打火星');
  particleLayer.motionBlur = false; // Crisp bright glowing trails already encode velocity
  const pc = particleLayer.particle!;

  const strikeEmitter = createDefaultEmitter('受击变形处火星爆发');
  strikeEmitter.sourceKind = 'surface';
  strikeEmitter.sourceLayerId = heroMesh.id;
  strikeEmitter.sourceNodeRef = { nodeId: nOutput.id, portId: 'mesh' };
  strikeEmitter.weightFieldLayerId = impactField.id; // Emits directly from the deformed dent zone!
  strikeEmitter.normalBoost = 1.15;
  strikeEmitter.direction.value = [0.05, 0.52, 0.85];
  strikeEmitter.spread.value = 72;
  strikeEmitter.speed.animated = true;
  strikeEmitter.speed.keyframes = [
    makeKeyframe(0.0, 260, 'linear'),
    makeKeyframe(7.05, 360, 'linear'),
    makeKeyframe(8.55, 450, 'linear'),
  ];
  strikeEmitter.speedVar = 0.48;
  strikeEmitter.life.value = 1.85;
  strikeEmitter.lifeVar = 0.35;
  strikeEmitter.sizeStart.value = 3.8;
  strikeEmitter.sizeEnd.value = 0.9;
  strikeEmitter.colorStart.value = [1.0, 0.98, 0.88, 1];
  strikeEmitter.colorMid.value = [1.0, 0.52, 0.10, 1];
  strikeEmitter.colorEnd.value = [0.55, 0.08, 0.01, 1];
  strikeEmitter.emissiveBoost = 2.4;
  strikeEmitter.seed = 2026;
  strikeEmitter.rate.animated = true;
  strikeEmitter.rate.keyframes = [
    makeKeyframe(0.0, 0, 'hold'),
    makeKeyframe(7.08, 0, 'linear'),
    makeKeyframe(7.12, 220, 'easeOut'),
    makeKeyframe(7.45, 25, 'ease'),
    makeKeyframe(8.62, 12, 'linear'),
    makeKeyframe(8.67, 360, 'easeOut'),
    makeKeyframe(9.20, 48, 'ease'),
    makeKeyframe(10.8, 0, 'ease'),
    makeKeyframe(15.0, 0, 'linear'),
  ];
  // Crisp rising-edge deterministic bursts on BOTH hammer strikes!
  strikeEmitter.burst.animated = true;
  strikeEmitter.burst.keyframes = [
    makeKeyframe(0.0, 0, 'hold'),
    makeKeyframe(7.09, 0, 'hold'),
    makeKeyframe(7.11, 210, 'hold'),
    makeKeyframe(7.22, 0, 'hold'),
    makeKeyframe(8.64, 0, 'hold'),
    makeKeyframe(8.66, 340, 'hold'),
    makeKeyframe(8.80, 0, 'hold'),
  ];

  // Emitter 2: Ambient rising calligraphic/forge micro-embers (subtle atmosphere from frame 0 -> cool down)
  const emberEmitter = createDefaultEmitter('炉火微烬');
  emberEmitter.sourceKind = 'curve';
  emberEmitter.sourceLayerId = textLayer.id;
  emberEmitter.direction.value = [0, 1, 0.15];
  emberEmitter.spread.value = 55;
  emberEmitter.speed.value = 68;
  emberEmitter.speedVar = 0.45;
  emberEmitter.life.value = 2.1;
  emberEmitter.sizeStart.value = 3.6;
  emberEmitter.sizeEnd.value = 0.7;
  emberEmitter.colorStart.value = [1.0, 0.78, 0.32, 1];
  emberEmitter.colorMid.value = [1.0, 0.36, 0.05, 1];
  emberEmitter.colorEnd.value = [0.32, 0.04, 0.01, 1];
  emberEmitter.emissiveBoost = 1.9;
  emberEmitter.seed = 4099;
  emberEmitter.rate.animated = true;
  emberEmitter.rate.keyframes = [
    makeKeyframe(0.0, 16, 'ease'),
    makeKeyframe(3.6, 22, 'ease'),
    makeKeyframe(6.2, 28, 'ease'),
    makeKeyframe(9.5, 34, 'ease'),
    makeKeyframe(11.6, 6, 'ease'),
    makeKeyframe(12.6, 0, 'ease'),
    makeKeyframe(15.0, 0, 'linear'),
  ];

  pc.emitters = [strikeEmitter, emberEmitter];
  pc.gravity.value = [0, -490, 0];
  pc.drag.value = 0.28;
  pc.fieldLayerIds = [vortexField.id]; // Driven by real 2.8 Space Field!
  pc.fieldNodeRef = { nodeId: nOutput.id, portId: 'field' };
  pc.colliderLayerIds = [anvilLayer.id, heroMesh.id]; // Real 3D surface collisions!
  pc.restitution.value = 0.56;
  pc.friction.value = 0.22;
  pc.onCollisionColor = [1.0, 0.96, 0.72, 1];
  pc.onCollisionColorMix = 0.7;
  pc.onCollisionLifeMult = 0.82;
  pc.subEmitOnCollision = true;
  pc.subEmitCount = 2;
  pc.subEmitSpeed = 145;
  pc.subEmitLife = 0.42;
  pc.subEmitSize = 2.0;
  pc.trailsEnabled = true;
  pc.trailLength.value = 0.15;
  pc.trailWidth.value = 1.9;
  pc.trailFade = 1.65;
  pc.maxParticles = 1400;
  pc.simFps = 60;

  // =========================================================================
  // 8) Expression Rig Controller Null: 「冲击震动控制」
  //    Drives camera micro-impact shockwave via real cross-layer expression!
  // =========================================================================
  const shakeNull = createLayer(mainComp, 'null', '冲击震动控制');
  shakeNull.is3D = true;
  shakeNull.transform.position.animated = true;
  shakeNull.transform.position.keyframes = [
    makeKeyframe(0.0, [0, 0, 0], 'hold'),
    makeKeyframe(7.09, [0, 0, 0], 'linear'),
    makeKeyframe(7.13, [14, -18, 22], 'easeOut'),
    makeKeyframe(7.22, [-9, 11, -10], 'ease'),
    makeKeyframe(7.34, [4, -4, 4], 'ease'),
    makeKeyframe(7.52, [0, 0, 0], 'ease'),
    makeKeyframe(8.64, [0, 0, 0], 'linear'),
    makeKeyframe(8.68, [-22, -28, 36], 'easeOut'),
    makeKeyframe(8.79, [15, 16, -16], 'ease'),
    makeKeyframe(8.95, [-7, -8, 8], 'ease'),
    makeKeyframe(9.22, [0, 0, 0], 'ease'),
    makeKeyframe(15.0, [0, 0, 0], 'linear'),
  ];

  // =========================================================================
  // 9) Cinematic Camera with Animated Angles, Framing, DoF & Expression Shake!
  //    Shot design reveals EVERY state transition of 「锻」 clearly:
  //    - 0.0..3.8s: Clean frontal-slight-3/4 write-on framing
  //    - 3.8..6.6s: Hero 3/4 orbit revealing extruded thickness, bevels & holes
  //    - 6.6..10.6s: Dramatic low-angle climax close-up on impact & sparks
  //    - 10.6..15.0s: Noble settling pull-back, rock steady final 1.6s!
  // =========================================================================
  const cameraLayer = createLayer(mainComp, 'camera', '主摄像机');
  cameraLayer.motionBlur = false;
  cameraLayer.transform.position.animated = true;
  cameraLayer.transform.position.keyframes = [
    makeKeyframe(0.0, [-26, 36, 735], 'ease', { outTan: [30, 0, -25] }),
    makeKeyframe(3.6, [36, 32, 690], 'ease', { inTan: [-30, 5, 25], outTan: [95, 15, -35] }),
    // Orbit cleanly to 3/4 angle to showcase extrusion thickness, bevels & interior holes with breathing room!
    makeKeyframe(5.8, [265, 86, 650], 'ease', { inTan: [-55, 10, 45], outTan: [-40, -15, -25] }),
    // Dramatic forging impact angle (hero 3/4 seeing hammer + dent + full character + anvil sparks!)
    makeKeyframe(7.1, [225, 58, 635], 'ease'),
    makeKeyframe(8.65, [-185, 42, 625], 'ease', { inTan: [120, 20, -35], outTan: [-45, 20, 45] }),
    makeKeyframe(10.6, [-185, 62, 670], 'ease'),
    // Graceful pull-back & frontal-hero settle (final 1.6s completely steady!)
    makeKeyframe(13.3, [86, 46, 710], 'ease'),
    makeKeyframe(15.0, [86, 46, 710], 'linear'),
  ];
  // Cross-layer expression referencing 冲击震动控制 with valueAtTime(time)! (2.4)
  cameraLayer.transform.position.expressionEnabled = true;
  cameraLayer.transform.position.expression =
    'add(value, thisComp.layer("冲击震动控制").transform.position.valueAtTime(time))';

  cameraLayer.camera!.target.animated = true;
  cameraLayer.camera!.target.keyframes = [
    makeKeyframe(0.0, [0, -16, 0], 'ease'),
    makeKeyframe(5.8, [0, -22, 0], 'ease'),
    makeKeyframe(8.65, [0, -24, 0], 'ease'),
    makeKeyframe(13.3, [0, -18, 0], 'ease'),
    makeKeyframe(15.0, [0, -18, 0], 'linear'),
  ];
  cameraLayer.camera!.fov.value = 36;
  cameraLayer.camera!.dofEnabled = true;
  cameraLayer.camera!.focalDistance.animated = true;
  cameraLayer.camera!.focalDistance.keyframes = [
    makeKeyframe(0.0, 738, 'ease'),
    makeKeyframe(3.6, 692, 'ease'),
    makeKeyframe(5.8, 706, 'ease'),
    makeKeyframe(8.65, 654, 'ease'),
    makeKeyframe(13.3, 718, 'ease'),
    makeKeyframe(15.0, 718, 'linear'),
  ];
  cameraLayer.camera!.aperture.animated = true;
  cameraLayer.camera!.aperture.keyframes = [
    makeKeyframe(0.0, 6, 'ease'),
    makeKeyframe(5.8, 18, 'ease'),
    makeKeyframe(8.65, 26, 'ease'),
    makeKeyframe(13.3, 12, 'ease'),
    makeKeyframe(15.0, 12, 'linear'),
  ];

  // =========================================================================
  // 10) Dramatic 3-Point Studio + Forge Lighting Rig (Directional Shadow + 2 Point Lights!)
  // =========================================================================
  // Key Shadow Light angled high-back-right so the crisp shadow of 「锻」 & its 3 holes falls visibly across the front-left anvil top!
  const keyLight = createLayer(mainComp, 'light', '工坊主光(投影)', { lightType: 'directional' });
  keyLight.transform.position.animated = true;
  keyLight.transform.position.keyframes = [
    makeKeyframe(0.0, [280, 460, -140], 'ease'),
    makeKeyframe(6.0, [320, 440, -180], 'ease'),
    makeKeyframe(13.3, [310, 410, -210], 'ease'),
  ];
  keyLight.light!.target.value = [-20, -90, 20];
  keyLight.light!.color.animated = true;
  keyLight.light!.color.keyframes = [
    makeKeyframe(0.0, [1.0, 0.94, 0.86, 1], 'ease'),
    makeKeyframe(8.65, [1.0, 0.90, 0.82, 1], 'ease'),
    makeKeyframe(12.5, [0.95, 0.98, 1.0, 1], 'ease'),
  ];
  keyLight.light!.intensity.animated = true;
  keyLight.light!.intensity.keyframes = [
    makeKeyframe(0.0, 2.7, 'ease'),
    makeKeyframe(6.0, 2.9, 'ease'),
    makeKeyframe(12.8, 3.6, 'ease'),
  ];
  keyLight.light!.castShadow = true;
  keyLight.light!.shadowSoftness = 1.65;

  // Forge Hearth Point Light with wiggle() expression for organic flickering molten fire!
  const forgeLight = createLayer(mainComp, 'light', '炉火热源光', { lightType: 'point' });
  forgeLight.transform.position.value = [-145, 75, 220];
  forgeLight.light!.color.value = [1.0, 0.44, 0.08, 1];
  forgeLight.light!.range.value = 950;
  forgeLight.light!.intensity.animated = true;
  forgeLight.light!.intensity.keyframes = [
    makeKeyframe(0.0, 1.4, 'ease'),
    makeKeyframe(4.5, 4.2, 'ease'),
    makeKeyframe(7.12, 6.2, 'easeOut'),
    makeKeyframe(8.68, 7.6, 'easeOut'),
    makeKeyframe(11.0, 2.2, 'ease'),
    makeKeyframe(13.0, 0.45, 'ease'),
    makeKeyframe(15.0, 0.45, 'linear'),
  ];
  forgeLight.light!.intensity.expressionEnabled = true;
  forgeLight.light!.intensity.expression = 'clamp(value + wiggle(6, 0.38) - value, 0, 10) + value * 0.0 + clamp(wiggle(6, 0.35), 0, 10) * 0.5 + value * 0.5';
  // Cleaner readable expression for users to inspect!
  forgeLight.light!.intensity.expression = 'clamp(wiggle(5.5, 0.45), 0.1, 10)';

  // Cool Studio Front-Left Key Fill Light (sculpts front metallic bevels & hammered crater cleanly!)
  const rimLight = createLayer(mainComp, 'light', '冷钢主补光', { lightType: 'point' });
  rimLight.transform.position.value = [-260, 230, 380];
  rimLight.light!.color.value = [0.68, 0.84, 1.0, 1];
  rimLight.light!.range.value = 1400;
  rimLight.light!.intensity.animated = true;
  rimLight.light!.intensity.keyframes = [
    makeKeyframe(0.0, 1.6, 'ease'),
    makeKeyframe(10.5, 2.6, 'ease'),
    makeKeyframe(13.0, 4.4, 'ease'),
    makeKeyframe(15.0, 4.4, 'linear'),
  ];

  // =========================================================================
  // 11) Adjustment Layer: 「工坊辉光」 (Expanded-Bounds Cinema Bloom!)
  // =========================================================================
  const glowAdj = createLayer(mainComp, 'adjustment', '工坊辉光');
  glowAdj.motionBlur = false;
  const glowFx = createEffect('glow');
  glowFx.name = '炽热辉光';
  glowFx.glowThreshold!.value = 0.86;
  glowFx.glowRadius!.value = 22;
  glowFx.glowColor!.value = [1.0, 0.64, 0.24, 1];
  glowFx.glowIntensity!.animated = true;
  glowFx.glowIntensity!.keyframes = [
    makeKeyframe(0.0, 0.65, 'ease'),
    makeKeyframe(3.8, 0.75, 'ease'),
    makeKeyframe(5.6, 0.85, 'ease'),
    makeKeyframe(7.12, 1.15, 'easeOut'),
    makeKeyframe(8.20, 0.80, 'ease'),
    makeKeyframe(8.68, 1.35, 'easeOut'),
    makeKeyframe(10.8, 0.62, 'ease'),
    makeKeyframe(13.2, 0.38, 'ease'),
    makeKeyframe(15.0, 0.38, 'linear'),
  ];
  glowAdj.effects = [glowFx];

  // =========================================================================
  // 12) Procedural Audio Synth Layers (2.15 & 3.2): Accents strictly locked to strikes!
  // =========================================================================
  const strikeAudio = createLayer(mainComp, 'audio', '音效·锻锤轰鸣', { audioPreset: 'forgeStrike' });
  strikeAudio.audio!.gain.value = 1.0;
  strikeAudio.audio!.decay.value = 2.1;
  strikeAudio.audio!.reverbMix.value = 0.48;
  strikeAudio.audio!.events = [
    { id: genId('snd'), time: 7.10, duration: 2.2, pitch: 92, velocity: 0.92 },
    { id: genId('snd'), time: 8.65, duration: 2.8, pitch: 82, velocity: 1.0 },
  ];

  const brushAndQuenchAudio = createLayer(mainComp, 'audio', '音效·笔锋与淬火', { audioPreset: 'brushStroke' });
  brushAndQuenchAudio.audio!.gain.value = 0.65;
  brushAndQuenchAudio.audio!.decay.value = 0.55;
  brushAndQuenchAudio.audio!.reverbMix.value = 0.42;
  brushAndQuenchAudio.audio!.events = [
    { id: genId('snd'), time: 0.15, duration: 0.45, pitch: 220, velocity: 0.65 },
    { id: genId('snd'), time: 0.72, duration: 0.40, pitch: 247, velocity: 0.70 },
    { id: genId('snd'), time: 1.35, duration: 0.45, pitch: 294, velocity: 0.75 },
    { id: genId('snd'), time: 2.05, duration: 0.50, pitch: 330, velocity: 0.80 },
    { id: genId('snd'), time: 2.75, duration: 0.55, pitch: 392, velocity: 0.85 },
    { id: genId('snd'), time: 3.40, duration: 0.70, pitch: 440, velocity: 0.90 },
  ];

  const quenchAudio = createLayer(mainComp, 'audio', '音效·淬火铁鸣', { audioPreset: 'metalRing' });
  quenchAudio.audio!.gain.value = 0.72;
  quenchAudio.audio!.decay.value = 3.2;
  quenchAudio.audio!.reverbMix.value = 0.58;
  quenchAudio.audio!.events = [
    { id: genId('snd'), time: 4.10, duration: 1.6, pitch: 146, velocity: 0.55 },
    { id: genId('snd'), time: 10.65, duration: 3.6, pitch: 196, velocity: 0.92 },
  ];

  const padAudio = createLayer(mainComp, 'audio', '配乐·工坊暗涌', { audioPreset: 'padDrone' });
  padAudio.audio!.gain.value = 0.48;
  padAudio.audio!.filterCutoff.value = 920;
  padAudio.audio!.decay.value = 4.2;
  padAudio.audio!.reverbMix.value = 0.55;
  padAudio.audio!.events = [
    { id: genId('snd'), time: 0.02, duration: 4.5, pitch: 55, velocity: 0.75 },
    { id: genId('snd'), time: 4.20, duration: 4.4, pitch: 65.4, velocity: 0.85 },
    { id: genId('snd'), time: 8.65, duration: 5.5, pitch: 55, velocity: 0.95 },
  ];

  // =========================================================================
  // Assemble Main Composition Layer Stack (AE Top-to-Bottom Order!)
  // =========================================================================
  mainComp.layers = [
    glowAdj,
    cameraLayer,
    keyLight,
    forgeLight,
    rimLight,
    shakeNull,
    impactField,
    vortexField,
    particleLayer,
    hammerLayer,
    heroMesh,
    textLayer,
    anvilLayer,
    strikeAudio,
    brushAndQuenchAudio,
    quenchAudio,
    padAudio,
  ];

  // =========================================================================
  // Secondary Composition: 「工坊印记·预合成示例」 (demonstrates multi-comp project!)
  // =========================================================================
  const badgeComp = createEmptyComposition('工坊印记 · 矢量合成', 640, 640, 30, 8);
  badgeComp.bgTransparent = true;
  const ringShape = createLayer(badgeComp, 'shape', '双环布尔印章');
  const outerCircle = createShapeItem('ellipse', '外环');
  outerCircle.size.value = [320, 320];
  const innerCut = createShapeItem('rect', '方孔切槽');
  innerCut.size.value = [140, 140];
  ringShape.shape!.items = [outerCircle, innerCut];
  ringShape.shape!.fillColor.value = [0.95, 0.45, 0.14, 1];
  ringShape.shape!.strokeColor.value = [1.0, 0.86, 0.55, 1];
  ringShape.shape!.strokeWidth.value = 5;
  ringShape.shape!.modifiers = [
    { id: genId('mod'), type: 'boolean', name: '差集开孔', enabled: true, boolOp: 'difference' },
  ];
  ringShape.transform.rotation.animated = true;
  ringShape.transform.rotation.keyframes = [
    makeKeyframe(0, [0, 0, 0], 'linear'),
    makeKeyframe(8, [0, 0, 360], 'linear'),
  ];
  const badgeText = createLayer(badgeComp, 'text', '印章文字', { text: '锻' });
  badgeText.text!.fontId = 'ma-shan-zheng';
  badgeText.text!.fontSize.value = 128;
  badgeText.text!.fillColor.value = [1.0, 0.92, 0.72, 1];
  badgeComp.layers = [badgeText, ringShape];

  return {
    version: '1.0',
    name: '锻字 · 15秒示例工程',
    activeCompId: mainComp.id,
    compositions: [mainComp, badgeComp],
  };
}
