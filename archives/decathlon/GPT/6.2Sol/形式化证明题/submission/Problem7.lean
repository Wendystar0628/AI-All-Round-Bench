import Mathlib.Analysis.Complex.Schwarz
import Mathlib.Analysis.Complex.OpenMapping
import Mathlib.Analysis.Complex.Harmonic.MeanValue
import Mathlib.Analysis.InnerProductSpace.Harmonic.Constructions
import Mathlib.Topology.MetricSpace.Sequences
import Mathlib.Topology.Order.MonotoneConvergence
import Mathlib.Analysis.SpecificLimits.Basic
import Mathlib.Tactic.FieldSimp
import Mathlib.Tactic.Linarith

open Set Metric Filter Complex InnerProductSpace Real
open scoped Topology ComplexConjugate

private abbrev p7_D := Metric.ball (0 : ℂ) 1

private noncomputable def p7_mob (a z : ℂ) := (z - a) / (1 - conj a * z)

private lemma p7_den {a z : ℂ} (ha : a ∈ p7_D) (hz : z ∈ p7_D) :
    1 - conj a * z ≠ 0 := by
  intro h
  have he := congrArg norm (sub_eq_zero.mp h)
  rw [norm_one, norm_mul, Complex.norm_conj] at he
  have hle : ‖a‖ * ‖z‖ ≤ ‖z‖ := by
    simpa using mul_le_mul_of_nonneg_right (mem_ball_zero_iff.mp ha).le (norm_nonneg z)
  exact (ne_of_lt (hle.trans_lt (mem_ball_zero_iff.mp hz))) he.symm

private lemma p7_identity (a z : ℂ) :
    ‖1 - conj a * z‖ ^ 2 - ‖z - a‖ ^ 2 = (1 - ‖a‖ ^ 2) * (1 - ‖z‖ ^ 2) := by
  simp only [Complex.sq_norm, Complex.normSq_apply, Complex.sub_re, Complex.sub_im,
    Complex.mul_re, Complex.mul_im, Complex.one_re, Complex.one_im, Complex.conj_re,
    Complex.conj_im]
  ring

private lemma p7_mob_maps {a : ℂ} (ha : a ∈ p7_D) : MapsTo (p7_mob a) p7_D p7_D := by
  intro z hz
  have h₁ : 0 < 1 - ‖a‖ ^ 2 := by nlinarith [norm_nonneg a, mem_ball_zero_iff.mp ha]
  have h₂ : 0 < 1 - ‖z‖ ^ 2 := by nlinarith [norm_nonneg z, mem_ball_zero_iff.mp hz]
  have h := p7_identity a z
  rw [mem_ball_zero_iff, p7_mob, norm_div, div_lt_one (norm_pos_iff.mpr (p7_den ha hz))]
  nlinarith [mul_pos h₁ h₂, norm_nonneg (1 - conj a * z), norm_nonneg (z-a)]

private lemma p7_mob_diff {a : ℂ} (ha : a ∈ p7_D) : DifferentiableOn ℂ (p7_mob a) p7_D := by
  intro z hz
  apply DifferentiableWithinAt.div
  · fun_prop
  · fun_prop
  · exact p7_den ha hz

private lemma p7_neg {a : ℂ} (ha : a ∈ p7_D) : -a ∈ p7_D := by
  simpa only [mem_ball_zero_iff, norm_neg] using ha

private lemma p7_cancel {a z : ℂ} (ha : a ∈ p7_D) (hz : z ∈ p7_D) :
    p7_mob a (p7_mob (-a) z) = z := by
  have h₁ := p7_den (p7_neg ha) hz
  have h₂ := p7_den ha (p7_mob_maps (p7_neg ha) hz)
  unfold p7_mob at h₂ ⊢
  apply (div_eq_iff h₂).2
  simp only [map_neg, neg_mul, sub_neg_eq_add] at h₁ ⊢
  let d := 1 + conj a * z
  change (z+a)/d - a = z * (1 - conj a * ((z+a)/d))
  have hd : d ≠ 0 := h₁
  have he := div_mul_cancel₀ (z+a) hd
  apply mul_right_cancel₀ hd
  rw [sub_mul, he, mul_assoc z, sub_mul, one_mul, mul_assoc (conj a), he]
  dsimp [d]
  ring

private lemma p7_pick {f : ℂ → ℂ} (hf : DifferentiableOn ℂ f p7_D)
    (hm : MapsTo f p7_D p7_D) {a z : ℂ} (ha : a ∈ p7_D) (hz : z ∈ p7_D) :
    ‖p7_mob (f a) (f z)‖ ≤ ‖p7_mob a z‖ := by
  let g := p7_mob (f a) ∘ f ∘ p7_mob (-a)
  have hD := (p7_mob_diff (hm ha)).comp (hf.comp (p7_mob_diff (p7_neg ha))
    (p7_mob_maps (p7_neg ha))) (hm.comp (p7_mob_maps (p7_neg ha)))
  have hM := (p7_mob_maps (hm ha)).comp (hm.comp (p7_mob_maps (p7_neg ha)))
  have h₀ : g 0 = 0 := by
    simp [g, p7_mob]
  have h := Complex.norm_le_norm_of_mapsTo_ball hD (hM.mono_right ball_subset_closedBall)
    h₀ (mem_ball_zero_iff.mp (p7_mob_maps ha hz))
  have he : p7_mob (-a) (p7_mob a z) = z := by simpa using p7_cancel (p7_neg ha) hz
  simpa only [g, Function.comp_apply, he] using h

private lemma p7_cross {f : ℂ → ℂ} (hf : DifferentiableOn ℂ f p7_D)
    (hm : MapsTo f p7_D p7_D) {a z : ℂ} (ha : a ∈ p7_D) (hz : z ∈ p7_D)
    (hfix : f a = a) :
    (1 - ‖z‖ ^ 2) * ‖1 - conj a * f z‖ ^ 2 ≤
      (1 - ‖f z‖ ^ 2) * ‖1 - conj a * z‖ ^ 2 := by
  have H := p7_pick hf hm ha hz
  rw [hfix] at H
  have hi (x : ℂ) (hx : x ∈ p7_D) :
      1 - ‖p7_mob a x‖ ^ 2 = (1 - ‖a‖ ^ 2) * ((1 - ‖x‖ ^ 2) / ‖1 - conj a * x‖ ^ 2) := by
    rw [p7_mob, norm_div, div_pow]
    have hn := pow_ne_zero 2 (norm_ne_zero_iff.mpr (p7_den ha hx))
    rw [← mul_div_assoc, ← p7_identity, sub_div, div_self hn]
  have hs : 1 - ‖p7_mob a z‖ ^ 2 ≤ 1 - ‖p7_mob a (f z)‖ ^ 2 := by
    linarith [pow_le_pow_left₀ (norm_nonneg _) H 2]
  rw [hi z hz, hi (f z) (hm hz)] at hs
  have hpos : 0 < 1 - ‖a‖ ^ 2 := by nlinarith [norm_nonneg a, mem_ball_zero_iff.mp ha]
  exact (div_le_div_iff₀ (pow_pos (norm_pos_iff.mpr (p7_den ha hz)) _)
    (pow_pos (norm_pos_iff.mpr (p7_den ha (hm hz))) _)).mp
      ((mul_le_mul_iff_of_pos_left hpos).mp hs)

private lemma p7_re_div (x y : ℂ) : (x / y).re = (x * conj y).re / ‖y‖ ^ 2 := by
  simp only [Complex.div_re, Complex.sq_norm, Complex.mul_re, Complex.conj_re,
    Complex.conj_im, mul_neg, sub_neg_eq_add, add_div]

private lemma p7_fixed_smaller {f : ℂ → ℂ} (hf : DifferentiableOn ℂ f p7_D)
    (hm : MapsTo f p7_D p7_D) {t : ℝ} (ht : 0 < t) (ht' : t < 1) :
    ∃ x ∈ p7_D, (t : ℂ) * f x = x := by
  by_contra! h
  let R := (t + 1) / 2
  have hRt : t < R := by dsimp [R]; linarith
  have hR : 0 < R := ht.trans hRt
  have hR1 : R < 1 := by dsimp [R]; linarith
  let g : ℂ → ℂ := fun x => (t : ℂ) * f x
  let F : ℂ → ℂ := fun x => x / (x - g x)
  let H : ℂ → ℝ := fun x => (F x).re
  have hF : DifferentiableOn ℂ F p7_D := by
    intro x hx
    apply DifferentiableWithinAt.div (by fun_prop)
    · exact differentiableWithinAt_id.sub ((hf x hx).const_mul _)
    · exact sub_ne_zero.mpr (h x hx).symm
  have hC : ContinuousOn H (sphere (0 : ℂ) R) :=
    (Complex.continuous_re.comp_continuousOn hF.continuousOn).mono
      (sphere_subset_closedBall.trans (closedBall_subset_ball hR1))
  have hpos (x : ℂ) (hx : x ∈ sphere (0 : ℂ) R) : 0 < H x := by
    have hxR := mem_sphere_zero_iff_norm.mp hx
    have hxD := sphere_subset_closedBall.trans (closedBall_subset_ball hR1) hx
    have hg : ‖g x‖ < ‖x‖ := by
      have hfg := mem_ball_zero_iff.mp (hm hxD)
      rw [hxR, show ‖g x‖ = t * ‖f x‖ by simp [g, abs_of_pos ht]]
      exact (mul_lt_of_lt_one_right ht hfg).trans hRt
    change 0 < (x / (x - g x)).re
    rw [p7_re_div, map_sub, mul_sub, Complex.sub_re, Complex.mul_conj', ← Complex.ofReal_pow,
      Complex.ofReal_re]
    have hle := Complex.re_le_norm (x * conj (g x))
    rw [norm_mul, Complex.norm_conj] at hle
    have hxpos : 0 < ‖x‖ := by rwa [hxR]
    exact div_pos (by nlinarith [mul_lt_mul_of_pos_left hg hxpos])
      (pow_pos (norm_pos_iff.mpr (sub_ne_zero.mpr (h x hxD).symm)) _)
  obtain ⟨x, hx, hmin⟩ := (isCompact_sphere (0 : ℂ) R).exists_isMinOn
    (NormedSpace.sphere_nonempty.mpr hR.le) hC
  have hAve : circleAverage H 0 R = H 0 := by
    apply InnerProductSpace.HarmonicOnNhd.circleAverage_eq
    intro y hy
    rw [abs_of_pos hR] at hy
    exact ((hF.analyticOnNhd isOpen_ball) y (closedBall_subset_ball hR1 hy)).harmonicAt_re
  have hle : H x ≤ circleAverage H 0 R := by
    rw [← circleAverage_const (H x) 0 R]
    exact circleAverage_mono (circleIntegrable_const ..) (hC.circleIntegrable hR.le)
      (fun y hy => hmin (by simpa [abs_of_pos hR] using hy))
  have hzero : H 0 = 0 := by simp [H, F]
  rw [hAve, hzero] at hle
  exact (not_lt_of_ge hle) (hpos x hx)


private noncomputable def p7_C (w z : ℂ) := (w + z) / (w - z)

private lemma p7_re_C {w : ℂ} (hw : ‖w‖ = 1) (z : ℂ) :
    (p7_C w z).re = (1 - ‖z‖ ^ 2) / ‖w-z‖ ^ 2 := by
  rw [p7_C, p7_re_div]
  congr 1
  have h : w.re * w.re + w.im * w.im = 1 := by
    rw [← Complex.normSq_apply, Complex.normSq_eq_norm_sq, hw]
    norm_num
  simp only [Complex.sq_norm, Complex.normSq_apply, map_sub, Complex.add_re,
    Complex.add_im, Complex.mul_re, Complex.sub_re, Complex.sub_im,
    Complex.conj_re, Complex.conj_im]
  linear_combination h

private lemma p7_C_inj {w z z' : ℂ} (hw : w ≠ 0) (hz : z ≠ w) (hz' : z' ≠ w)
    (h : p7_C w z = p7_C w z') : z = z' := by
  have he := (div_eq_div_iff (sub_ne_zero.mpr hz.symm) (sub_ne_zero.mpr hz'.symm)).mp h
  have h₀ : (2 * w) * (z-z') = 0 := by linear_combination he
  exact sub_eq_zero.mp ((mul_eq_zero.mp h₀).resolve_left (mul_ne_zero (by norm_num) hw))

private lemma p7_C_cont {w z : ℂ} (hz : z ≠ w) : ContinuousAt (p7_C w) z :=
  (continuousAt_const.add continuousAt_id).div (continuousAt_const.sub continuousAt_id)
    (sub_ne_zero.mpr hz.symm)

private lemma p7_boundary {f : ℂ → ℂ} (hf : DifferentiableOn ℂ f p7_D)
    (hm : MapsTo f p7_D p7_D) (hfix : ∀ z ∈ p7_D, f z ≠ z) :
    ∃ w : ℂ, ‖w‖ = 1 ∧ ∀ z ∈ p7_D, (p7_C w z).re ≤ (p7_C w (f z)).re := by
  classical
  let t : ℕ → ℝ := fun n => 1 - (1 / ((n : ℝ) + 1)) / 2
  have ht (n : ℕ) : 0 < t n := by
    have hh : (1 : ℝ) / ((n : ℝ) + 1) ≤ 1 := (div_le_iff₀ (by positivity)).mpr (by simp)
    dsimp [t]
    linarith
  have ht' (n : ℕ) : t n < 1 := by
    have hh : 0 < (1 : ℝ) / ((n : ℝ) + 1) := by positivity
    dsimp [t]
    linarith
  have htT : Tendsto t atTop (𝓝 1) := by
    have h := (tendsto_const_nhds (x := (1 : ℝ))).sub
      ((tendsto_one_div_add_atTop_nhds_zero_nat (𝕜 := ℝ)).div_const 2)
    simpa [t] using h
  choose a ha hfixa using fun n => p7_fixed_smaller hf hm (ht n) (ht' n)
  obtain ⟨w, hwB, φ, hφ, hlim⟩ := (isCompact_closedBall (0 : ℂ) 1).tendsto_subseq
    (fun n => ball_subset_closedBall (ha n))
  have hwle := mem_closedBall_zero_iff.mp hwB
  have hT : Tendsto (fun n => (t (φ n) : ℂ)) atTop (𝓝 1) := by
    simpa [Function.comp_def] using (Complex.continuous_ofReal.tendsto 1).comp (htT.comp hφ.tendsto_atTop)
  have hw : ‖w‖ = 1 := by
    by_contra! hh
    have hwD := mem_ball_zero_iff.mpr (lt_of_le_of_ne hwle hh)
    have hF := (hf.continuousOn.continuousAt (isOpen_ball.mem_nhds hwD)).tendsto.comp hlim
    have hG : Tendsto (fun n => (t (φ n) : ℂ) * f (a (φ n))) atTop (𝓝 (f w)) := by
      simpa [Function.comp_def] using hT.mul hF
    have hA : Tendsto (fun n => (t (φ n) : ℂ) * f (a (φ n))) atTop (𝓝 w) :=
      hlim.congr (fun n => (hfixa (φ n)).symm)
    exact hfix w hwD (tendsto_nhds_unique hG hA)
  refine ⟨w, hw, ?_⟩
  intro z hz
  have hin (n : ℕ) : MapsTo (fun x => (t n : ℂ) * f x) p7_D p7_D := by
    intro x hx
    rw [mem_ball_zero_iff, norm_mul, Complex.norm_real, Real.norm_eq_abs, abs_of_pos (ht n)]
    exact (mul_le_of_le_one_right (ht n).le (mem_ball_zero_iff.mp (hm hx)).le).trans_lt (ht' n)
  have hcross (n : ℕ) := p7_cross (hf.const_mul (t (φ n) : ℂ)) (hin (φ n))
    (ha (φ n)) hz (hfixa (φ n))
  have hA := Complex.continuous_conj.continuousAt.tendsto.comp hlim
  have hF : Tendsto (fun n => (t (φ n) : ℂ) * f z) atTop (𝓝 (f z)) := by
    simpa using hT.mul_const (f z)
  have hP := (tendsto_const_nhds (x := (1 : ℂ))).sub (hA.mul hF)
  have hQ := (tendsto_const_nhds (x := (1 : ℂ))).sub (hA.mul_const z)
  have hl := (tendsto_const_nhds (x := 1 - ‖z‖ ^ 2)).mul (hP.norm.pow 2)
  have hr := ((tendsto_const_nhds (x := (1 : ℝ))).sub (hF.norm.pow 2)).mul (hQ.norm.pow 2)
  have h := le_of_tendsto_of_tendsto' hl hr hcross
  have hw0 : w ≠ 0 := by intro he; simp [he] at hw
  have hden (x : ℂ) : ‖1 - conj w * x‖ = ‖w-x‖ := by
    have h₁ : conj w * w = 1 := by simp [Complex.conj_mul', hw]
    rw [show 1 - conj w * x = conj w * (w - x) by rw [mul_sub, h₁],
      norm_mul, Complex.norm_conj, hw, one_mul]
  have hn (x : ℂ) (hx : x ∈ p7_D) : 0 < ‖w-x‖ ^ 2 :=
    pow_pos (norm_pos_iff.mpr (sub_ne_zero.mpr (by
      intro he
      have hh := mem_ball_zero_iff.mp hx
      rw [← he, hw] at hh
      exact (lt_irrefl _) hh))) _
  rw [p7_re_C hw, p7_re_C hw]
  apply (div_le_div_iff₀ (hn z hz) (hn (f z) (hm hz))).mpr
  simpa only [hden] using h

private lemma p7_real_part {F : ℂ → ℂ} (hF : AnalyticOnNhd ℂ F p7_D)
    (h : ∀ z ∈ p7_D, 0 ≤ (F z).re) :
    (∃ d, ∀ z ∈ p7_D, F z = d) ∨ ∀ z ∈ p7_D, 0 < (F z).re := by
  rcases hF.is_constant_or_isOpen (convex_ball (0 : ℂ) 1).isPreconnected with hc | ho
  · exact Or.inl hc
  · right
    intro z hz
    by_contra! hn
    have hz0 := le_antisymm hn (h z hz)
    have hi := ho p7_D Subset.rfl isOpen_ball
    obtain ⟨ε, hε, hsub⟩ := Metric.isOpen_iff.mp hi (F z) ⟨z, hz, rfl⟩
    have he : F z - ((ε / 2 : ℝ) : ℂ) ∈ ball (F z) ε := by
      rw [mem_ball, dist_eq_norm]
      have h' : F z - ((ε / 2 : ℝ) : ℂ) - F z = -((ε / 2 : ℝ) : ℂ) := by ring
      rw [h', norm_neg, Complex.norm_real, Real.norm_eq_abs, abs_of_pos (by linarith : 0 < ε / 2)]
      linarith
    obtain ⟨x, hx, hx'⟩ := hsub he
    have hh := h x hx
    rw [hx', Complex.sub_re, Complex.ofReal_re, hz0] at hh
    linarith

private lemma p7_orbit_tendsto {f : ℂ → ℂ} (hf : DifferentiableOn ℂ f p7_D)
    (hm : MapsTo f p7_D p7_D) (hfix : ∀ z ∈ p7_D, f z ≠ z)
    {w : ℂ} (hw : ‖w‖ = 1)
    (hinc : ∀ z ∈ p7_D, (p7_C w z).re ≤ (p7_C w (f z)).re) :
    Tendsto (fun n : ℕ => f^[n] 0) atTop (𝓝 w) := by
  let u : ℕ → ℂ := fun n => f^[n] 0
  let C := p7_C w
  let H := fun n => (C (u n)).re
  have h0 : (0 : ℂ) ∈ p7_D := by simp
  have hu (n : ℕ) : u n ∈ p7_D := hm.iterate n h0
  have hu' (n : ℕ) : u (n+1) = f (u n) := Function.iterate_succ_apply' f n 0
  have hw0 : w ≠ 0 := by intro he; simp [he] at hw
  have hne (z : ℂ) (hz : z ∈ p7_D) : z ≠ w := by
    intro he
    simp [he, hw] at hz
  have hmono : Monotone H := monotone_nat_of_le_succ fun n => by
    dsimp [H]
    rw [hu']
    exact hinc _ (hu n)
  have hH0 : 0 < H 0 := by
    change 0 < (p7_C w 0).re
    simp [p7_C, hw0]
  have hdiff : DifferentiableOn ℂ C p7_D := by
    intro z hz
    apply DifferentiableWithinAt.div (by fun_prop) (by fun_prop)
    exact sub_ne_zero.mpr (hne z hz).symm
  have hF := ((hdiff.comp hf hm).sub hdiff).analyticOnNhd isOpen_ball
  have hFpos : ∀ z ∈ p7_D, 0 ≤ (C (f z) - C z).re := fun z hz =>
    sub_nonneg.mpr (hinc z hz)
  rcases p7_real_part hF hFpos with hc | hp
  · obtain ⟨d, hd⟩ := hc
    have hd0 : d ≠ 0 := by
      intro he
      have h := sub_eq_zero.mp ((hd 0 h0).trans he)
      exact hfix 0 h0 (p7_C_inj hw0 (hne _ (hm h0)) (hne _ h0) h)
    have hseq (n : ℕ) : C (u n) = C 0 + (n : ℂ) * d := by
      induction n with
      | zero => simp [u]
      | succ n ih =>
        rw [hu', Nat.cast_succ]
        have h := hd (u n) (hu n)
        change C (f (u n)) - C (u n) = d at h
        rw [ih] at h
        linear_combination h
    apply (isCompact_closedBall (0 : ℂ) 1).tendsto_nhds_of_unique_mapClusterPt
      (Eventually.of_forall (fun n => ball_subset_closedBall (hu n)))
    intro v hv hvC
    by_contra hvne
    obtain ⟨φ, hφ, hlim⟩ := hvC.tendsto_subseq
    have hClim : Tendsto (fun n => C (u (φ n))) atTop (𝓝 (C v)) :=
      (p7_C_cont hvne).tendsto.comp hlim
    have ht := (hClim.sub (tendsto_const_nhds (x := C 0))).div_const d
    have he (n : ℕ) : (C (u (φ n)) - C 0) / d = (φ n : ℂ) := by
      rw [hseq, add_sub_cancel_left, mul_div_cancel_right₀ _ hd0]
    have hRe : Tendsto (fun n => (φ n : ℝ)) atTop (𝓝 (((C v - C 0) / d).re)) := by
      simpa [Function.comp_def, he] using (Complex.continuous_re.tendsto _).comp ht
    exact not_tendsto_atTop_of_tendsto_nhds hRe (tendsto_natCast_atTop_atTop.comp hφ.tendsto_atTop)
  · apply (isCompact_closedBall (0 : ℂ) 1).tendsto_nhds_of_unique_mapClusterPt
      (Eventually.of_forall (fun n => ball_subset_closedBall (hu n)))
    intro v hv hvC
    by_contra hvne
    obtain ⟨φ, hφ, hlim⟩ := hvC.tendsto_subseq
    have hClim := (p7_C_cont hvne).tendsto.comp hlim
    have hHlim : Tendsto (H ∘ φ) atTop (𝓝 (C v).re) :=
      (Complex.continuous_re.tendsto _).comp hClim
    have hHpos : 0 < (C v).re :=
      hH0.trans_le (ge_of_tendsto' hHlim (fun n => hmono (Nat.zero_le (φ n))))
    have hvD : v ∈ p7_D := by
      have hh := mem_closedBall_zero_iff.mp hv
      apply mem_ball_zero_iff.mpr (lt_of_le_of_ne hh ?_)
      intro h
      rw [show C v = p7_C w v from rfl, p7_re_C hw, h] at hHpos
      norm_num at hHpos
    have hH := (tendsto_iff_tendsto_subseq_of_monotone hmono hφ.tendsto_atTop).mpr hHlim
    have hshift : Tendsto (fun n => H (φ n + 1)) atTop (𝓝 (C v).re) :=
      hH.comp ((tendsto_add_atTop_nat 1).comp hφ.tendsto_atTop)
    have hfL := (hf.continuousOn.continuousAt (isOpen_ball.mem_nhds hvD)).tendsto.comp hlim
    have hC' := (p7_C_cont (hne _ (hm hvD))).tendsto.comp hfL
    have h' : Tendsto (fun n => H (φ n + 1)) atTop (𝓝 (C (f v)).re) := by
      simpa only [Function.comp_def, H, hu'] using (Complex.continuous_re.tendsto _).comp hC'
    have he := tendsto_nhds_unique hshift h'
    exact (ne_of_lt (sub_pos.mp (hp v hvD))) he

private lemma p7_uniform {f : ℂ → ℂ} (hf : DifferentiableOn ℂ f p7_D)
    (hm : MapsTo f p7_D p7_D) {w : ℂ} (hw : ‖w‖ = 1)
    (hl : Tendsto (fun n : ℕ => f^[n] 0) atTop (𝓝 w)) :
    TendstoLocallyUniformlyOn (fun n : ℕ => f^[n]) (fun _ => w) atTop p7_D := by
  apply (tendstoLocallyUniformlyOn_iff_forall_isCompact isOpen_ball).mpr
  intro K hKD hK
  apply Metric.tendstoUniformlyOn_iff.mpr
  intro ε hε
  by_cases hKn : K.Nonempty
  · obtain ⟨x, hx, hmax⟩ := hK.exists_isMaxOn hKn continuous_norm.continuousOn
    let R := ‖x‖
    have hR₀ : 0 ≤ R := norm_nonneg x
    have hR : R < 1 := mem_ball_zero_iff.mp (hKD hx)
    have hR' : 0 < 1 - R := sub_pos.mpr hR
    have h0 : (0 : ℂ) ∈ p7_D := by simp
    let a := fun n : ℕ => f^[n] (0 : ℂ)
    have ha (n : ℕ) : a n ∈ p7_D := hm.iterate n h0
    have hB (n : ℕ) (y : ℂ) (hy : y ∈ K) :
        ‖f^[n] y - a n‖ ≤ (1 - ‖a n‖ ^ 2) / (1 - R) := by
      let b := f^[n] y
      let c := a n
      have hc : c ∈ p7_D := ha n
      have hb : b ∈ p7_D := hm.iterate n (hKD hy)
      have hp := p7_pick (hf.iterate hm n) (hm.iterate n) h0 (hKD hy)
      have hp' : ‖b-c‖ / ‖1 - conj c * b‖ ≤ R := by
        have h := hp.trans (show ‖p7_mob 0 y‖ ≤ R by simpa [p7_mob] using hmax hy)
        simpa only [p7_mob, norm_div] using h
      have hp'' := (div_le_iff₀ (norm_pos_iff.mpr (p7_den hc hb))).mp hp'
      have haux : 0 ≤ 1 - ‖c‖ ^ 2 := by nlinarith [norm_nonneg c, mem_ball_zero_iff.mp hc]
      have ht : ‖1 - conj c * b‖ ≤ (1 - ‖c‖ ^ 2) + ‖b-c‖ := by
        have he : 1 - conj c * b = ((1 - ‖c‖ ^ 2 : ℝ) : ℂ) + conj c * (c - b) := by
          rw [Complex.ofReal_sub, Complex.ofReal_one, Complex.ofReal_pow, ← Complex.conj_mul']
          ring
        rw [he]
        calc
          _ ≤ ‖((1 - ‖c‖ ^ 2 : ℝ) : ℂ)‖ + ‖conj c * (c - b)‖ := norm_add_le _ _
          _ ≤ _ := by
            rw [Complex.norm_real, Real.norm_eq_abs, abs_of_nonneg haux, norm_mul, Complex.norm_conj, norm_sub_rev]
            exact add_le_add_right (mul_le_of_le_one_left (norm_nonneg (b-c)) (mem_ball_zero_iff.mp hc).le) _
      apply (le_div_iff₀ hR').mpr
      have h := hp''.trans (mul_le_mul_of_nonneg_left ht hR₀)
      nlinarith [mul_le_of_le_one_left haux hR.le]
    have hnorm : Tendsto (fun n => (1 - ‖a n‖ ^ 2) / (1 - R)) atTop (𝓝 0) := by
      have h := ((tendsto_const_nhds (x := (1 : ℝ))).sub (hl.norm.pow 2)).div_const (1 - R)
      simpa [hw, a] using h
    have hdist : Tendsto (fun n => dist w (a n)) atTop (𝓝 0) := by
      simpa [a] using (tendsto_const_nhds (x := w)).dist hl
    have hsum : Tendsto (fun n => dist w (a n) + (1 - ‖a n‖ ^ 2) / (1 - R)) atTop (𝓝 0) := by
      simpa only [add_zero] using hdist.add hnorm
    filter_upwards [(tendsto_order.mp hsum).2 ε hε] with n hn y hy
    calc
      dist w (f^[n] y) ≤ dist w (a n) + dist (a n) (f^[n] y) := dist_triangle .. 
      _ ≤ dist w (a n) + (1 - ‖a n‖ ^ 2) / (1 - R) := by
        rw [dist_comm (a n) (f^[n] y), dist_eq_norm (f^[n] y) (a n)]
        exact add_le_add_right (hB n y hy) _
      _ < ε := hn
  · exact Eventually.of_forall (fun n y hy => (hKn ⟨y, hy⟩).elim)

theorem problem7 (f : ℂ → ℂ)
    (hf : DifferentiableOn ℂ f (Metric.ball 0 1))
    (hm : Set.MapsTo f (Metric.ball 0 1) (Metric.ball 0 1))
    (hfix : ∀ z ∈ Metric.ball (0 : ℂ) 1, f z ≠ z) :
    ∃ w : ℂ, ‖w‖ = 1 ∧
      TendstoLocallyUniformlyOn (fun n : ℕ => f^[n]) (fun _ => w)
        Filter.atTop (Metric.ball 0 1) := by
  obtain ⟨w, hw, hW⟩ := p7_boundary hf hm hfix
  exact ⟨w, hw, p7_uniform hf hm hw (p7_orbit_tendsto hf hm hfix hw hW)⟩

#print axioms problem7
