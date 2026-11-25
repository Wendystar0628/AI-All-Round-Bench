import bpy, sys, time, os, subprocess
argv = sys.argv[sys.argv.index("--") + 1:]
outdir = argv[0]
# baseline script already executed before this one (sets scene)
sc = bpy.context.scene
c = sc.cycles
fog = bpy.data.objects.get("FogTest")
log = open(os.path.join(outdir, "variants.txt"), "a", encoding="utf-8")

def gpu_util():
    try:
        r = subprocess.run(["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=5)
        return r.stdout.strip()
    except Exception:
        return "?"

def run(tag, frames, **kw):
    saved = {}
    for k, v in kw.items():
        if k == "fog":
            fog.hide_render = not v
        else:
            saved[k] = getattr(c, k)
            setattr(c, k, v)
    for fr in frames:
        sc.frame_set(fr)
        sc.render.filepath = os.path.join(outdir, f"{tag}_{fr:04d}.jpg")
        u0 = gpu_util()
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        dt = time.time() - t0
        log.write(f"{tag} frame {fr} {dt:.2f}s gpu_before={u0}\n")
        log.flush()
    for k, v in saved.items():
        setattr(c, k, v)
    fog.hide_render = False

frames = [661, 517]
run("warm", [661], samples=16)
run("s64_vol", frames)
run("s64_novol", frames, fog=False)
run("s64_vol_biased", frames, volume_biased=True)
run("s32_vol", frames, samples=32)
run("s64_vol_b2", frames, diffuse_bounces=2, glossy_bounces=2, max_bounces=6)
log.close()
