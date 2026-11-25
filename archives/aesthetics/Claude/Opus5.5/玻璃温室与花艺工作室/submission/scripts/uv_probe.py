import bpy, sys, math
import numpy as np
out = open(sys.argv[sys.argv.index("--") + 1], "w", encoding="utf-8")
def p(*a):
    out.write(" ".join(str(x) for x in a) + "\n")

names = ["Leaf_FountainFrond", "Leaf_PendantFrond", "Leaf_Ivy", "Leaf_HostaClump03", "Leaf_LilyPad", "Leaf_KentiaPinnae", "Leaf_PhalaenopsisBasal",
         "Leaf_Seedling", "Leaf_DeciduousSprays", "Leaf_HydrangeaOpposite", "Leaf_GeraniumReniform",
         "Petal_Phalaenopsis", "Petal_HydrangeaMophead", "Petal_GeraniumFloret", "Petal_Lily_F1_R1", "Petal_LilyStamen_F1", "Flower_Lavender",
         "Wood_FloorBoard", "Wood_WS_BenchTopPlank", "Wood_PrincipalRafter", "Glass_DomePane_R3_S01", "Glass_DomePane_R5_S10", "Glass_WallPane_B000_r1c1",
         "Glass_FanPane_B120_S3", "Brick_GardenWall", "Brick_DadoInner_North", "Floor_Flag", "Linen_WS_LinenWovenStripe", "Linen_WornDoorRug", "Linen_RugFringe",
         "Wool_FoldedBlanket", "Twine_TwineBall", "Paper_WS_UnfurledKraft", "Paper_SeedEnvelope", "Stem_GeraniumPedicel", "Iron_DomeRib", "Pot_Terracotta_S",
         "Tile_PlainClay", "Plaster_Wall_South", "Stone_Coping", "Water_Pond", "Water_Stream_Lion", "Water_Stream_Overflow", "Water_SplashLion", "Wax_CabinetCandlestick",
         "Lamp_CabinetCandlestick_01_Emitter", "Iron_TeaTable_B090", "Porcelain_TeaPotSpout", "Porcelain_TeaPot", "Stem_Dry01", "Copper_LionNose", "Lawn_GardenTerrain",
         "Gravel_CarriageDrive", "Coir_EntranceMat", "Wicker_BasketUpright", "Rubber_Wellington", "Leather_GardeningGlove", "Moss_Floor", "Pebble_Pond", "Bark_DeciduousForks",
         "Stone_PondLining", "Soil_Bed_NE", "Hedge_BoxwoodBody", "Leaf_Fallen_Paving", "Stove_Fire_Emitter", "Brazier_Fire_Emitter", "Tile_PorchDiamondIvory"]

objs = bpy.data.objects
for nm in names:
    ob = None
    for o in objs:
        if o.name == nm or o.name.startswith(nm + "_") or o.name.startswith(nm):
            if o.type == 'MESH':
                ob = o
                break
    if ob is None:
        p("MISSING", nm)
        continue
    me = ob.data
    loc, rot, sca = ob.matrix_world.decompose()
    nv = len(me.vertices)
    co = np.zeros(nv * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    dims = co.max(0) - co.min(0)
    line = [f"{ob.name}: users={me.users} verts={nv} loc=({loc.x:.2f},{loc.y:.2f},{loc.z:.2f}) rot={tuple(round(math.degrees(a),1) for a in rot.to_euler())} scale={tuple(round(s,3) for s in sca)} localdims={tuple(round(float(d),3) for d in dims)}"]
    if me.uv_layers:
        uvl = me.uv_layers.active
        nl = len(me.loops)
        uv = np.zeros(nl * 2, dtype=np.float32)
        uvl.data.foreach_get("uv", uv)
        uv = uv.reshape(-1, 2)
        vidx = np.zeros(nl, dtype=np.int32)
        me.loops.foreach_get("vertex_index", vidx)
        lc = co[vidx]
        # correlation of u and v with local axes
        corr = []
        for k in range(2):
            c = []
            for a in range(3):
                if np.std(uv[:, k]) > 1e-6 and np.std(lc[:, a]) > 1e-6:
                    c.append(round(float(np.corrcoef(uv[:, k], lc[:, a])[0, 1]), 2))
                else:
                    c.append(0.0)
            corr.append(c)
        line.append(f"   uv_layers={[l.name for l in me.uv_layers]} umin/max=({uv[:,0].min():.3f},{uv[:,0].max():.3f}) vmin/max=({uv[:,1].min():.3f},{uv[:,1].max():.3f}) corr_u(xyz)={corr[0]} corr_v(xyz)={corr[1]}")
        # uv extents relative to geometry: uv units per meter estimate
        ext_uv = uv.max(0) - uv.min(0)
        line.append(f"   uv_extent={ext_uv.round(3).tolist()} geom_dims={dims.round(3).tolist()}")
    else:
        line.append("   NO UV")
    attrs = [a.name for a in me.attributes if not a.name.startswith(".")]
    line.append(f"   attrs={attrs} color_attrs={[c.name for c in me.color_attributes]} mats={[s.material.name if s.material else None for s in ob.material_slots]}")
    p("\n".join(line))
out.close()
