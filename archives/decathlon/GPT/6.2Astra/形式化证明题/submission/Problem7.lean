import Mathlib.Analysis.Complex.Schwarz
import Mathlib.Analysis.Complex.Exponential
import Mathlib.Topology.UniformSpace.LocallyUniformConvergence
import Mathlib.Tactic

open Complex Filter Function Metric Set
open scoped Topology ComplexConjugate
namespace DiscIteration
private abbrev D := ball (0:ℂ) 1
private noncomputable def mob (a z : ℂ) := (a-z)/(1-conj a*z)
private lemma identitySq (a z : ℂ) :
    ‖1-conj a*z‖^2 - ‖a-z‖^2 = (1-‖a‖^2)*(1-‖z‖^2) := by
  simp only [Complex.sq_norm,Complex.normSq_apply,sub_re,sub_im,one_re,one_im,mul_re,mul_im,conj_re,conj_im]
  ring
private lemma deficit {z : ℂ} (hz : z ∈ D) : 0 < 1-‖z‖^2 := by
  have h := mem_ball_zero_iff.mp hz
  nlinarith [mul_pos (sub_pos.mpr h) (show 0 < 1+‖z‖ by positivity)]
private lemma den {a z : ℂ} (ha : a ∈ D) (hz : z ∈ D) : 1-conj a*z ≠ 0 := by
  have H := identitySq a z
  intro h; rw [h,norm_zero] at H
  nlinarith [mul_pos (deficit ha) (deficit hz),sq_nonneg ‖a-z‖]
private lemma mob_maps {a : ℂ} (ha : a ∈ D) : MapsTo (mob a) D D := by
  intro z hz
  rw [mem_ball_zero_iff,mob,norm_div,div_lt_one (norm_pos_iff.mpr (den ha hz))]
  nlinarith [identitySq a z,mul_pos (deficit ha) (deficit hz),norm_nonneg (a-z),norm_nonneg (1-conj a*z)]
private lemma mob_inv {a z : ℂ} (ha : a ∈ D) (hz : z ∈ D) : mob a (mob a z) = z := by
  have H := den ha (mob_maps ha hz)
  unfold mob at H ⊢
  apply (div_eq_iff H).mpr
  linear_combination -(div_mul_cancel₀ (a-z) (den ha hz))
private lemma mob_diff {a : ℂ} (ha : a ∈ D) : DifferentiableOn ℂ (mob a) D :=
  by
    unfold mob
    fun_prop (disch := intro z hz; exact den ha hz)
private lemma pick {f : ℂ → ℂ} (hf : DifferentiableOn ℂ f D) (hm : MapsTo f D D)
    {a z : ℂ} (ha : a ∈ D) (hz : z ∈ D) : ‖mob (f a) (f z)‖ ≤ ‖mob a z‖ := by
  let F := mob (f a) ∘ f ∘ mob a
  have H := Complex.norm_le_norm_of_mapsTo_ball (f := F)
    ((mob_diff (hm ha)).comp (hf.comp (mob_diff ha) (mob_maps ha)) (hm.comp (mob_maps ha)))
    (((mob_maps (hm ha)).comp (hm.comp (mob_maps ha))).mono_right ball_subset_closedBall)
    (by simp [F,mob]) (mem_ball_zero_iff.mp (mob_maps ha hz))
  simpa only [F,comp_apply,mob_inv ha hz] using H
private lemma juliaStep {f : ℂ → ℂ} (hf : DifferentiableOn ℂ f D) (hm : MapsTo f D D)
    {a z : ℂ} (ha : a ∈ D) (hz : z ∈ D) (hfix : f a = a) :
    (1-‖z‖^2)*‖1-conj a*f z‖^2 ≤ (1-‖f z‖^2)*‖1-conj a*z‖^2 := by
  have H := pick hf hm ha hz
  rw [hfix,mob,mob,norm_div,norm_div] at H
  have hh := (div_le_div_iff₀ (norm_pos_iff.mpr (den ha (hm hz))) (norm_pos_iff.mpr (den ha hz))).mp H
  have H2 := pow_le_pow_left₀ (by positivity) hh 2
  rw [mul_pow,mul_pow] at H2
  apply le_of_mul_le_mul_left (a := 1-‖a‖^2) _ (deficit ha)
  nlinarith only [H2, congrArg (· * ‖1-conj a*f z‖^2) (identitySq a z),
    congrArg (· * ‖1-conj a*z‖^2) (identitySq a (f z))]
private noncomputable def cay (a z : ℂ) := (a+z)/(a-z)
private lemma cay_real {a z : ℂ} (h : a ≠ z) :
    (cay a z).re * ‖a-z‖^2 = ‖a‖^2 - ‖z‖^2 := by
  rw [cay,Complex.div_re,Complex.sq_norm,← add_div,div_mul_cancel₀ _ (by simpa using sub_ne_zero.mpr h)]
  simp only [Complex.sq_norm,Complex.normSq_apply,add_re,sub_re,add_im,sub_im]; ring
private lemma inner_fixed {g : ℂ → ℂ} (hg : DifferentiableOn ℂ g D)
    {s : ℝ} (hs : 0 < s) (hs1 : s < 1) (hb : ∀ z ∈ D, ‖g z‖ ≤ s) :
    ∃ a ∈ D, g a = a := by
  by_contra! hn
  let R := (1+s)/2
  have hR : s < R := by dsimp [R]; linarith
  have hR1 : R < 1 := by dsimp [R]; linarith
  let G (z : ℂ) := Complex.exp (-(cay z (g z)))
  have hd : DifferentiableOn ℂ G D := by
    apply DifferentiableOn.cexp
    exact ((differentiableOn_id.add hg).div (differentiableOn_id.sub hg)
      (fun z hz => sub_ne_zero.mpr (hn z hz).symm)).neg
  have H : ‖G 0‖ ≤ 1 := by
    apply Complex.norm_le_of_forall_mem_frontier_norm_le (U := ball 0 R) isBounded_ball
      ((hd.mono (closure_ball_subset_closedBall.trans (closedBall_subset_ball hR1))).diffContOnCl)
    · intro z hz
      have he : ‖z‖ = R := mem_sphere_zero_iff_norm.mp (frontier_ball_subset_sphere hz)
      have hzD : z ∈ D := mem_ball_zero_iff.mpr (he ▸ hR1)
      have hh := cay_real (hn z hzD).symm
      have h0 := hb z hzD
      have hlt : ‖g z‖ < ‖z‖ := by linarith
      have hpos : 0 ≤ (cay z (g z)).re := by
        by_contra! h
        nlinarith [mul_nonpos_of_nonpos_of_nonneg h.le (sq_nonneg ‖z-g z‖),
          mul_self_lt_mul_self (norm_nonneg _) hlt]
      simpa [G,Complex.norm_exp] using (Real.exp_le_one_iff.mpr (neg_nonpos.mpr hpos))
    · exact subset_closure (mem_ball_self (by linarith))
  have h0 := hn 0 (mem_ball_self (by norm_num))
  simp [G,cay,h0,Complex.norm_exp] at H
  linarith

private lemma boundary {f : ℂ → ℂ} (hf : DifferentiableOn ℂ f D) (hm : MapsTo f D D)
    (hfix : ∀ z ∈ D, f z ≠ z) :
    ∃ w : ℂ, ‖w‖ = 1 ∧ ∀ z ∈ D, (cay w z).re ≤ (cay w (f z)).re := by
  let s (n : ℕ) := 1 - (1 / ((n:ℝ)+1))/2
  have hs (n) : 0 < s n ∧ s n < 1 := by
    have h : 0 < 1/((n:ℝ)+1) := by positivity
    have h' : 1/((n:ℝ)+1) ≤ 1 := (div_le_one (by positivity)).mpr (by linarith [Nat.cast_nonneg (α := ℝ) n])
    dsimp [s]; constructor <;> linarith
  have hsl : Tendsto s atTop (𝓝 1) := by
    simpa [s] using (tendsto_const_nhds (x := (1:ℝ))).sub
      ((tendsto_one_div_add_atTop_nhds_zero_nat (𝕜 := ℝ)).div_const 2)
  let g (n : ℕ) (z : ℂ) := (s n : ℂ)*f z
  have hd (n) : DifferentiableOn ℂ (g n) D := hf.const_mul _
  have hb (n z) (hz : z ∈ D) : ‖g n z‖ ≤ s n := by
    dsimp only [g]
    rw [norm_mul,Complex.norm_real,Real.norm_eq_abs,abs_of_pos (hs n).1]
    exact mul_le_of_le_one_right (hs n).1.le (mem_ball_zero_iff.mp (hm hz)).le
  have hgm (n) : MapsTo (g n) D D := fun z hz => mem_ball_zero_iff.mpr ((hb n z hz).trans_lt (hs n).2)
  choose a ha he using fun n => inner_fixed (hd n) (hs n).1 (hs n).2 (hb n)
  obtain ⟨w,hw,k,hk,hl⟩ := (isCompact_closedBall (0:ℂ) 1).tendsto_subseq (fun n => ball_subset_closedBall (ha n))
  have hsk : Tendsto (fun n => (s (k n) : ℂ)) atTop (𝓝 1) := by simpa using (hsl.comp hk.tendsto_atTop).ofReal
  have hw1 : ‖w‖ = 1 := by
    apply (mem_closedBall_zero_iff.mp hw).eq_of_not_lt
    intro h
    have hwD := mem_ball_zero_iff.mpr h
    have H := ((hf.continuousOn.continuousAt (isOpen_ball.mem_nhds hwD)).tendsto.comp hl)
    have H' := hsk.mul H
    change Tendsto (fun n => g (k n) (a (k n))) _ _ at H'
    simp only [he,one_mul] at H'
    exact hfix w hwD (tendsto_nhds_unique H' hl)
  refine ⟨w,hw1,?_⟩
  intro z hz
  have hp (n) := juliaStep (hd (k n)) (hgm (k n)) (ha (k n)) hz (he (k n))
  have hzlim : Tendsto (fun n => g (k n) z) atTop (𝓝 (f z)) := by simpa [g] using hsk.mul_const (f z)
  have hc : Tendsto (fun n => conj (a (k n))) atTop (𝓝 (conj w)) := Complex.continuous_conj.continuousAt.tendsto.comp hl
  have H := le_of_tendsto_of_tendsto' (tendsto_const_nhds.mul ((tendsto_const_nhds.sub (hc.mul hzlim)).norm.pow 2))
    ((tendsto_const_nhds.sub (hzlim.norm.pow 2)).mul ((tendsto_const_nhds.sub (hc.mul_const z)).norm.pow 2)) hp
  have hden (u : ℂ) : ‖1-conj w*u‖^2 = ‖w-u‖^2 := by have := identitySq w u; rw [hw1] at this; linarith
  rw [hden,hden] at H
  have hn (u) (hu : u ∈ D) : w ≠ u := by intro h; have := mem_ball_zero_iff.mp hu; rw [← h,hw1] at this; linarith
  have he' (u) (hu : u ∈ D) : (cay w u).re = (1-‖u‖^2)/‖w-u‖^2 :=
    (eq_div_iff (pow_ne_zero _ (norm_ne_zero_iff.mpr (sub_ne_zero.mpr (hn _ hu))))).mpr (by simpa [hw1] using cay_real (hn _ hu))
  rw [he' _ hz,he' _ (hm hz)]
  exact (div_le_div_iff₀ (pow_pos (norm_pos_iff.mpr (sub_ne_zero.mpr (hn _ hz))) _)
    (pow_pos (norm_pos_iff.mpr (sub_ne_zero.mpr (hn _ (hm hz)))) _)).mpr H

private lemma flat {G : ℂ → ℂ} (hd : DifferentiableOn ℂ G D) (hr : ∀ z ∈ D, 0 ≤ (G z).re)
    {u : ℂ} (hu : u ∈ D) (he : (G u).re = 0) : ∀ z ∈ D, G z = G u := by
  let H (z : ℂ) := 1 + G z - G u
  have hb z (hz : z ∈ D) : 1 ≤ ‖H z‖ := by
    apply le_trans _ (Complex.re_le_norm _)
    simpa [H,he] using hr z hz
  have hn z (hz : z ∈ D) : H z ≠ 0 := by have := hb z hz; intro h; simp [h] at this; norm_num at this
  have hd' : DifferentiableOn ℂ (fun z => (H z)⁻¹) D :=
    ((hd.const_add 1).sub_const _).inv (fun z hz => hn z hz)
  have Hmax : IsMaxOn (norm ∘ (fun z => (H z)⁻¹)) D u := by
    intro z hz
    change ‖(H z)⁻¹‖ ≤ ‖(H u)⁻¹‖
    simpa [H, norm_inv] using inv_le_one_of_one_le₀ (hb z hz)
  intro z hz
  have heq := Complex.eq_const_of_exists_max hd' hu Hmax hz
  change (H z)⁻¹ = (H u)⁻¹ at heq
  have heq' := inv_injective heq
  dsimp [H] at heq'
  linear_combination heq'

private lemma orbit {f : ℂ → ℂ} (hf : DifferentiableOn ℂ f D) (hm : MapsTo f D D)
    (hfix : ∀ z ∈ D, f z ≠ z) {w : ℂ} (hw : ‖w‖ = 1)
    (step : ∀ z ∈ D, (cay w z).re ≤ (cay w (f z)).re) {x : ℂ} (hx : x ∈ D) :
    Tendsto (fun n : ℕ => f^[n] x) atTop (𝓝 w) := by
  let X (n : ℕ) := f^[n] x
  have hX n : X n ∈ D := hm.iterate n hx
  have next n : X (n+1) = f (X n) := iterate_succ_apply' ..
  let C := cay w
  have hne z (hz : z ∈ D) : w ≠ z := by intro h; have := mem_ball_zero_iff.mp hz; rw [← h,hw] at this; linarith
  have hc z (hz : z ≠ w) : ContinuousAt C z := by unfold C cay; fun_prop (disch := exact sub_ne_zero.mpr hz.symm)
  have hpos : 0 < (C x).re := by
    have H := cay_real (hne x hx)
    rw [hw,one_pow] at H
    exact pos_of_mul_pos_left (H.trans_gt (deficit hx)) (sq_nonneg _)
  have hmono : Monotone (fun n => (C (X n)).re) := monotone_nat_of_le_succ (fun n => by
    change (C (X n)).re ≤ (C (X (n+1))).re
    rw [next]; exact step _ (hX n))
  apply tendsto_of_subseq_tendsto
  intro k hk
  obtain ⟨u,hu,l,hl,hu'⟩ := (isCompact_closedBall (0:ℂ) 1).tendsto_subseq (fun i => ball_subset_closedBall (hX (k i)))
  refine ⟨l,?_⟩
  change Tendsto (fun n => X (k (l n))) atTop (𝓝 u) at hu'
  suffices u = w by simpa [← this] using hu'
  by_contra hn
  have hK : Tendsto (fun n => k (l n)) atTop atTop := hk.comp hl.tendsto_atTop
  have hCl := (hc u hn).tendsto.comp hu'
  have hRl := Complex.continuous_re.continuousAt.tendsto.comp hCl
  have hupper (n : ℕ) : (C (X n)).re ≤ (C u).re := ge_of_tendsto hRl
    ((hK.eventually_ge_atTop n).mono (fun i hi => hmono hi))
  have hpos' := hpos.trans_le (hupper 0)
  have huD : u ∈ D := by
    rw [mem_ball_zero_iff]
    have H := cay_real (Ne.symm hn)
    rw [hw,one_pow] at H
    have h := mul_pos hpos' (sq_pos_of_pos (norm_pos_iff.mpr (sub_ne_zero.mpr (Ne.symm hn))))
    have hle := mem_closedBall_zero_iff.mp hu
    by_contra! hge
    rw [le_antisymm hle hge] at H
    dsimp [C] at h
    linarith
  have hfu := (hf.continuousOn.continuousAt (isOpen_ball.mem_nhds huD)).tendsto.comp hu'
  have hnext := Complex.continuous_re.continuousAt.tendsto.comp ((hc _ (hne _ (hm huD)).symm).tendsto.comp hfu)
  have hle : (C (f u)).re ≤ (C u).re := le_of_tendsto' hnext (fun n => by
    change (C (f (X (k (l n))))).re ≤ (C u).re
    simpa only [next] using hupper (k (l n)+1))
  let G (z : ℂ) := C (f z) - C z
  have hdC : DifferentiableOn ℂ C D := by unfold C cay; fun_prop (disch := intro z hz; exact sub_ne_zero.mpr (hne _ hz))
  have hflat := flat (G := G) ((hdC.comp hf hm).sub hdC) (fun z hz => sub_nonneg.mpr (step z hz)) huD (sub_eq_zero.mpr (le_antisymm hle (step u huD)))
  have hg : G u ≠ 0 := by
    intro h
    have H := sub_eq_zero.mp h
    change (w+f u)/(w-f u) = (w+u)/(w-u) at H
    have E := (div_eq_div_iff (sub_ne_zero.mpr (hne _ (hm huD))) (sub_ne_zero.mpr (hne _ huD))).mp H
    have E' : w*(f u-u) = 0 := by linear_combination E/2
    have hw' : w ≠ 0 := by intro hh; simp [hh] at hw
    exact hfix _ huD (sub_eq_zero.mp ((mul_eq_zero.mp E').resolve_left hw'))
  have hex n : C (X n) = C x + (n:ℂ)*G u := by
    induction n with
    | zero => simp [X]
    | succ n ih =>
      rw [next,Nat.cast_succ]
      have H := hflat _ (hX n)
      dsimp only [G] at H
      linear_combination H + ih
  have hsmall : Tendsto (fun n => (k (l n) : ℝ)*‖G u‖) atTop (𝓝 ‖C u-C x‖) := by
    simpa only [Function.comp_apply,hex,add_sub_cancel_left,norm_mul,Complex.norm_natCast] using (hCl.sub_const (C x)).norm
  exact not_tendsto_atTop_of_tendsto_nhds hsmall
    (Filter.Tendsto.atTop_mul_const (norm_pos_iff.mpr hg) (tendsto_natCast_atTop_atTop.comp hK))

end DiscIteration
open DiscIteration
theorem problem7 (f : ℂ → ℂ)
    (hf : DifferentiableOn ℂ f (Metric.ball 0 1))
    (hm : Set.MapsTo f (Metric.ball 0 1) (Metric.ball 0 1))
    (hfix : ∀ z ∈ Metric.ball (0 : ℂ) 1, f z ≠ z) :
    ∃ w : ℂ, ‖w‖ = 1 ∧
      TendstoLocallyUniformlyOn (fun n : ℕ => f^[n]) (fun _ => w)
        Filter.atTop (Metric.ball 0 1) := by
  obtain ⟨w,hw,hstep⟩ := boundary hf hm hfix
  refine ⟨w,hw,Metric.tendstoLocallyUniformlyOn_iff.mpr ?_⟩
  intro ε hε x hx
  have hl := orbit hf hm hfix hw hstep hx
  let t := {y ∈ D | ‖mob x y‖ < ε/4}
  refine ⟨t,?_,?_⟩
  · apply Filter.inter_mem self_mem_nhdsWithin
    apply ((mob_diff hx).continuousOn x hx).norm.tendsto.eventually_lt_const
    simp [mob]; positivity
  · filter_upwards [hl.eventually (ball_mem_nhds _ (half_pos hε))] with n hn
    intro y hy
    obtain ⟨hyD,hsmall⟩ := hy
    let a := f^[n] x
    let b := f^[n] y
    have ha := mem_ball_zero_iff.mp (hm.iterate n hx)
    have hb := mem_ball_zero_iff.mp (hm.iterate n hyD)
    have H := (pick (hf.iterate hm n) (hm.iterate n) hx hyD).trans_lt hsmall
    change ‖(a-b)/(1-conj a*b)‖ < ε/4 at H
    rw [norm_div,div_lt_iff₀ (norm_pos_iff.mpr (den (hm.iterate n hx) (hm.iterate n hyD)))] at H
    have hbnd : ‖1-conj a*b‖ ≤ 2 := by
      apply (norm_sub_le ..).trans
      rw [norm_one,norm_mul,Complex.norm_conj]
      have := mul_le_mul ha.le hb.le (norm_nonneg b) zero_le_one
      linarith
    have hxy : dist a b < ε/2 := by
      rw [dist_eq_norm]
      nlinarith [mul_le_mul_of_nonneg_left hbnd (show 0 ≤ ε/4 by positivity)]
    have hh : dist w a < ε/2 := by simpa [dist_comm,a] using mem_ball.mp hn
    exact (dist_triangle w a b).trans_lt (by linarith)

#print axioms problem7