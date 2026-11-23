import Mathlib.Analysis.Complex.Schwarz
import Mathlib.Analysis.Complex.AbsMax
import Mathlib.Analysis.SpecialFunctions.Complex.Log
import Mathlib.Analysis.Calculus.MeanValue
import Mathlib.Topology.Sequences
import Mathlib.Topology.MetricSpace.Pseudo.Basic

open Complex Metric Set Filter Topology
open scoped ComplexConjugate

namespace Problem7

lemma key_identity (a z : ℂ) :
    ‖1 - conj a * z‖ ^ 2 - ‖z - a‖ ^ 2 = (1 - ‖a‖ ^ 2) * (1 - ‖z‖ ^ 2) := by
  simp only [Complex.sq_norm, Complex.normSq_apply]
  simp
  ring

lemma one_sub_ne_zero {a z : ℂ} (ha : ‖a‖ ≤ 1) (hz : ‖z‖ < 1) : 1 - conj a * z ≠ 0 := by
  intro h
  have h1 : conj a * z = 1 := (sub_eq_zero.1 h).symm
  have h2 : ‖conj a * z‖ = 1 := by rw [h1, norm_one]
  rw [norm_mul, Complex.norm_conj] at h2
  have h3 : ‖a‖ * ‖z‖ ≤ 1 * ‖z‖ := mul_le_mul_of_nonneg_right ha (norm_nonneg z)
  linarith

lemma norm_lt_of_ball {a z : ℂ} (ha : ‖a‖ < 1) (hz : ‖z‖ < 1) :
    ‖z - a‖ < ‖1 - conj a * z‖ := by
  have h := key_identity a z
  have h1 : 0 < (1 - ‖a‖ ^ 2) * (1 - ‖z‖ ^ 2) :=
    mul_pos (by nlinarith [norm_nonneg a]) (by nlinarith [norm_nonneg z])
  have h2 : ‖z - a‖ ^ 2 < ‖1 - conj a * z‖ ^ 2 := by linarith
  exact lt_of_pow_lt_pow_left₀ 2 (norm_nonneg _) h2

/-- Schwarz–Pick, cross-multiplied. -/
lemma schwarz_pick {g : ℂ → ℂ} (hg : DifferentiableOn ℂ g (ball 0 1))
    (hm : MapsTo g (ball 0 1) (ball 0 1)) {a z : ℂ} (ha : ‖a‖ < 1) (hz : ‖z‖ < 1) :
    ‖g z - g a‖ * ‖1 - conj a * z‖ ≤ ‖z - a‖ * ‖1 - conj (g a) * g z‖ := by
  have hb1 : ‖g a‖ < 1 := mem_ball_zero_iff.1 (hm (mem_ball_zero_iff.2 ha))
  have hgz1 : ‖g z‖ < 1 := mem_ball_zero_iff.1 (hm (mem_ball_zero_iff.2 hz))
  set b := g a with hb
  set ψ : ℂ → ℂ := fun ζ => (ζ + a) / (1 + conj a * ζ) with hψ
  set φ : ℂ → ℂ := fun η => (η - b) / (1 - conj b * η) with hφ
  have hden1 : ∀ ζ : ℂ, ‖ζ‖ < 1 → 1 + conj a * ζ ≠ 0 := by
    intro ζ hζ
    have := one_sub_ne_zero (a := -a) (by rw [norm_neg]; exact ha.le) hζ
    simpa using this
  have hψmaps : MapsTo ψ (ball 0 1) (ball 0 1) := by
    intro ζ hζ
    rw [mem_ball_zero_iff] at hζ ⊢
    have h1 := norm_lt_of_ball (a := -a) (by rw [norm_neg]; exact ha) hζ
    simp only [hψ, norm_div]
    rw [div_lt_one (norm_pos_iff.2 (hden1 ζ hζ))]
    simpa using h1
  have hφmaps : MapsTo φ (ball 0 1) (ball 0 1) := by
    intro η hη
    rw [mem_ball_zero_iff] at hη ⊢
    have h1 := norm_lt_of_ball hb1 hη
    simp only [hφ, norm_div]
    rw [div_lt_one (norm_pos_iff.2 (one_sub_ne_zero hb1.le hη))]
    exact h1
  have hψdiff : DifferentiableOn ℂ ψ (ball 0 1) := by
    apply DifferentiableOn.div
    · exact (differentiable_id.add_const a).differentiableOn
    · exact ((differentiable_const _).add
        ((differentiable_const _).mul differentiable_id)).differentiableOn
    · intro ζ hζ
      exact hden1 ζ (mem_ball_zero_iff.1 hζ)
  have hφdiff : DifferentiableOn ℂ φ (ball 0 1) := by
    apply DifferentiableOn.div
    · exact (differentiable_id.sub_const b).differentiableOn
    · exact ((differentiable_const _).sub
        ((differentiable_const _).mul differentiable_id)).differentiableOn
    · intro η hη
      exact one_sub_ne_zero hb1.le (mem_ball_zero_iff.1 hη)
  set h : ℂ → ℂ := fun ζ => φ (g (ψ ζ)) with hh
  have hdiff : DifferentiableOn ℂ h (ball 0 1) :=
    hφdiff.comp (hg.comp hψdiff hψmaps) (hm.comp hψmaps)
  have hmaps : MapsTo h (ball 0 1) (closedBall 0 1) :=
    fun ζ hζ => ball_subset_closedBall (hφmaps (hm (hψmaps hζ)))
  have h0 : h 0 = 0 := by
    simp [hh, hψ, hφ, hb]
  have hden : 1 - conj a * z ≠ 0 := one_sub_ne_zero ha.le hz
  set ζ := (z - a) / (1 - conj a * z) with hζdef
  have hζ : ‖ζ‖ < 1 := by
    rw [hζdef, norm_div, div_lt_one (norm_pos_iff.2 hden)]
    exact norm_lt_of_ball ha hz
  have hζD : ζ * (1 - conj a * z) = z - a := div_mul_cancel₀ _ hden
  have hψζ : ψ ζ = z := by
    simp only [hψ]
    rw [div_eq_iff (hden1 ζ hζ)]
    apply mul_right_cancel₀ hden
    linear_combination (1 - z * conj a) * hζD
  have hS := Complex.norm_le_norm_of_mapsTo_ball hdiff hmaps h0 hζ
  have hhζ : h ζ = (g z - b) / (1 - conj b * g z) := by
    simp only [hh, hψζ, hφ]
  rw [hhζ, hζdef, norm_div, norm_div,
    div_le_div_iff₀ (norm_pos_iff.2 (one_sub_ne_zero hb1.le hgz1)) (norm_pos_iff.2 hden)] at hS
  exact hS

/-- Schwarz–Pick, in the `1 - ρ²` form. -/
lemma schwarz_pick' {g : ℂ → ℂ} (hg : DifferentiableOn ℂ g (ball 0 1))
    (hm : MapsTo g (ball 0 1) (ball 0 1)) {a z : ℂ} (ha : ‖a‖ < 1) (hz : ‖z‖ < 1) :
    (1 - ‖a‖ ^ 2) * (1 - ‖z‖ ^ 2) * ‖1 - conj (g a) * g z‖ ^ 2
      ≤ (1 - ‖g a‖ ^ 2) * (1 - ‖g z‖ ^ 2) * ‖1 - conj a * z‖ ^ 2 := by
  have h := schwarz_pick hg hm ha hz
  have h2 := mul_self_le_mul_self (by positivity) h
  have i1 := key_identity a z
  have i2 := key_identity (g a) (g z)
  rw [← i1, ← i2]
  nlinarith [h2]

lemma strict_aux {r : ℝ} (hr0 : 0 < r) (hr1 : r < 1) {t : ℂ} (ht : ‖t‖ < 1) :
    r * ‖1 - t‖ < ‖1 - ((r ^ 2 : ℝ) : ℂ) * t‖ := by
  have h1 : ‖1 - ((r ^ 2 : ℝ) : ℂ) * t‖ ^ 2 - r ^ 2 * ‖1 - t‖ ^ 2
      = (1 - r ^ 2) * (1 - r ^ 2 * ‖t‖ ^ 2) := by
    simp only [Complex.sq_norm, Complex.normSq_apply, Complex.sub_re, Complex.sub_im,
      Complex.one_re, Complex.one_im, Complex.re_ofReal_mul, Complex.im_ofReal_mul]
    ring
  have hr2 : r ^ 2 < 1 := by nlinarith
  have ht2 : ‖t‖ ^ 2 < 1 := by nlinarith [norm_nonneg t]
  have h2 : 0 < (1 - r ^ 2) * (1 - r ^ 2 * ‖t‖ ^ 2) := by
    apply mul_pos (by linarith)
    nlinarith [sq_nonneg r, sq_nonneg ‖t‖]
  have h3 : (r * ‖1 - t‖) ^ 2 < ‖1 - ((r ^ 2 : ℝ) : ℂ) * t‖ ^ 2 := by
    rw [mul_pow]; linarith
  exact lt_of_pow_lt_pow_left₀ 2 (norm_nonneg _) h3

/-- A fixed point of `r • f`. -/
lemma exists_fixed (f : ℂ → ℂ) (hf : DifferentiableOn ℂ f (ball 0 1))
    (hm : MapsTo f (ball 0 1) (ball 0 1)) {r : ℝ} (hr0 : 0 < r) (hr1 : r < 1) :
    ∃ z : ℂ, ‖z‖ < 1 ∧ (r : ℂ) * f z = z := by
  set g : ℂ → ℂ := fun z => (r : ℂ) * f z with hg
  have hgK : ∀ z, ‖z‖ < 1 → ‖g z‖ ≤ r := by
    intro z hz
    have h1 := mem_ball_zero_iff.1 (hm (mem_ball_zero_iff.2 hz))
    simp only [hg, norm_mul, Complex.norm_real, Real.norm_eq_abs, abs_of_pos hr0]
    nlinarith
  set ψ : ℂ → ℝ := fun z => ‖z - g z‖ / ‖1 - conj z * g z‖ with hψ
  have hsub : closedBall (0 : ℂ) r ⊆ ball 0 1 := closedBall_subset_ball hr1
  have hgc : ContinuousOn g (closedBall 0 r) :=
    (continuousOn_const.mul hf.continuousOn).mono hsub
  have hcont : ContinuousOn ψ (closedBall 0 r) := by
    apply ContinuousOn.div
    · exact (continuousOn_id.sub hgc).norm
    · exact (continuousOn_const.sub ((Complex.continuous_conj.continuousOn).mul hgc)).norm
    · intro z hz
      have hz1 : ‖z‖ < 1 := lt_of_le_of_lt (mem_closedBall_zero_iff.1 hz) hr1
      exact (norm_pos_iff.2 (one_sub_ne_zero hz1.le (lt_of_le_of_lt (hgK z hz1) hr1))).ne'
  obtain ⟨z0, hz0, hmin⟩ := (isCompact_closedBall (0 : ℂ) r).exists_isMinOn
    (nonempty_closedBall.2 hr0.le) hcont
  have hz0' : ‖z0‖ < 1 := lt_of_le_of_lt (mem_closedBall_zero_iff.1 hz0) hr1
  refine ⟨z0, hz0', ?_⟩
  by_contra hne
  set z1 := g z0 with hz1
  have hz1K : z1 ∈ closedBall (0 : ℂ) r := mem_closedBall_zero_iff.2 (hgK z0 hz0')
  have hz1' : ‖z1‖ < 1 := lt_of_le_of_lt (hgK z0 hz0') hr1
  have hle : ψ z0 ≤ ψ z1 := hmin hz1K
  have ha : ‖f z0‖ < 1 := mem_ball_zero_iff.1 (hm (mem_ball_zero_iff.2 hz0'))
  have hb : ‖f z1‖ < 1 := mem_ball_zero_iff.1 (hm (mem_ball_zero_iff.2 hz1'))
  have hsp := schwarz_pick hf hm hz0' hz1'
  have ht : ‖conj (f z0) * f z1‖ < 1 := by
    rw [norm_mul, Complex.norm_conj]
    nlinarith [norm_nonneg (f z0), norm_nonneg (f z1)]
  have hst := strict_aux hr0 hr1 ht
  have hpos : 0 < ‖z1 - z0‖ := norm_pos_iff.2 (sub_ne_zero.2 hne)
  have e1 : ‖z1 - g z1‖ = r * ‖f z0 - f z1‖ := by
    have : z1 - g z1 = (r : ℂ) * (f z0 - f z1) := by simp only [hz1, hg]; ring
    rw [this, norm_mul, Complex.norm_real, Real.norm_eq_abs, abs_of_pos hr0]
  have e2 : 1 - conj z1 * g z1 = 1 - ((r ^ 2 : ℝ) : ℂ) * (conj (f z0) * f z1) := by
    simp only [hz1, hg, map_mul, Complex.conj_ofReal]
    push_cast
    ring
  have hd0 : 0 < ‖1 - conj z0 * g z0‖ :=
    norm_pos_iff.2 (one_sub_ne_zero hz0'.le hz1')
  have hd1 : 0 < ‖1 - ((r ^ 2 : ℝ) : ℂ) * (conj (f z0) * f z1)‖ := by
    rw [← e2]
    exact norm_pos_iff.2 (one_sub_ne_zero hz1'.le (lt_of_le_of_lt (hgK z1 hz1') hr1))
  have hlt : ψ z1 < ψ z0 := by
    simp only [hψ]
    rw [e1, e2, div_lt_div_iff₀ hd1 hd0]
    calc r * ‖f z0 - f z1‖ * ‖1 - conj z0 * g z0‖
        = r * (‖f z1 - f z0‖ * ‖1 - conj z0 * z1‖) := by rw [norm_sub_rev]; ring
      _ ≤ r * (‖z1 - z0‖ * ‖1 - conj (f z0) * f z1‖) :=
          mul_le_mul_of_nonneg_left hsp hr0.le
      _ = ‖z1 - z0‖ * (r * ‖1 - conj (f z0) * f z1‖) := by ring
      _ < ‖z1 - z0‖ * ‖1 - ((r ^ 2 : ℝ) : ℂ) * (conj (f z0) * f z1)‖ :=
          mul_lt_mul_of_pos_left hst hpos
      _ = ‖z0 - g z0‖ * ‖1 - ((r ^ 2 : ℝ) : ℂ) * (conj (f z0) * f z1)‖ := by
          rw [norm_sub_rev]
  linarith

lemma wolff (f : ℂ → ℂ) (hf : DifferentiableOn ℂ f (ball 0 1))
    (hm : MapsTo f (ball 0 1) (ball 0 1)) (hfix : ∀ z ∈ ball (0 : ℂ) 1, f z ≠ z) :
    ∃ w : ℂ, ‖w‖ = 1 ∧ ∀ z, ‖z‖ < 1 →
      (1 - ‖z‖ ^ 2) * ‖1 - conj w * f z‖ ^ 2 ≤ (1 - ‖f z‖ ^ 2) * ‖1 - conj w * z‖ ^ 2 := by
  set r : ℕ → ℝ := fun k => 1 - 1 / 2 * (1 / ((k : ℝ) + 1)) with hr
  have hq : ∀ k : ℕ, 0 < 1 / ((k : ℝ) + 1) ∧ 1 / ((k : ℝ) + 1) ≤ 1 := by
    intro k
    have hk : (0 : ℝ) < (k : ℝ) + 1 := by positivity
    refine ⟨by positivity, ?_⟩
    rw [div_le_one hk]
    linarith [Nat.cast_nonneg (α := ℝ) k]
  have hr0 : ∀ k, 0 < r k := fun k => by
    simp only [hr]; linarith [(hq k).1, (hq k).2]
  have hr1 : ∀ k, r k < 1 := fun k => by
    simp only [hr]; linarith [(hq k).1]
  have hrlim : Tendsto r atTop (𝓝 1) := by
    have h1 := (tendsto_one_div_add_atTop_nhds_zero_nat (𝕜 := ℝ)).const_mul (1 / 2 : ℝ)
    have h2 := (tendsto_const_nhds (x := (1 : ℝ))).sub h1
    simpa [hr] using h2
  choose zk hzk1 hzkfix using fun k => exists_fixed f hf hm (hr0 k) (hr1 k)
  obtain ⟨w, hw, φ, hφ, hlim⟩ := (isCompact_closedBall (0 : ℂ) 1).tendsto_subseq
    (fun k => mem_closedBall_zero_iff.2 (hzk1 k).le)
  have hlim' : Tendsto (fun k => zk (φ k)) atTop (𝓝 w) := hlim
  have hrc : Tendsto (fun k => ((r (φ k) : ℝ) : ℂ)) atTop (𝓝 1) := by
    have h := (Complex.continuous_ofReal.tendsto 1).comp (hrlim.comp hφ.tendsto_atTop)
    rw [Complex.ofReal_one] at h
    exact h
  have hw1 : ‖w‖ = 1 := by
    by_contra hne
    have hwlt : ‖w‖ < 1 := lt_of_le_of_ne (mem_closedBall_zero_iff.1 hw) hne
    have hcont : ContinuousAt f w :=
      hf.continuousOn.continuousAt (isOpen_ball.mem_nhds (mem_ball_zero_iff.2 hwlt))
    have h1 : Tendsto (fun k => f (zk (φ k))) atTop (𝓝 (f w)) := hcont.tendsto.comp hlim'
    have h2 : Tendsto (fun k => ((r (φ k) : ℝ) : ℂ) * f (zk (φ k))) atTop
        (𝓝 ((1 : ℂ) * f w)) := hrc.mul h1
    have h3 : (fun k => ((r (φ k) : ℝ) : ℂ) * f (zk (φ k))) = fun k => zk (φ k) :=
      funext (fun k => hzkfix (φ k))
    rw [h3, one_mul] at h2
    exact hfix w (mem_ball_zero_iff.2 hwlt) (tendsto_nhds_unique h2 hlim')
  refine ⟨w, hw1, ?_⟩
  intro z hz
  have hk : ∀ k, (1 - ‖z‖ ^ 2) * ‖1 - conj (zk k) * ((r k : ℂ) * f z)‖ ^ 2
      ≤ (1 - ‖(r k : ℂ) * f z‖ ^ 2) * ‖1 - conj (zk k) * z‖ ^ 2 := by
    intro k
    have hgd : DifferentiableOn ℂ (fun z => (r k : ℂ) * f z) (ball 0 1) :=
      (differentiableOn_const _).mul hf
    have hgm : MapsTo (fun z => (r k : ℂ) * f z) (ball 0 1) (ball 0 1) := by
      intro y hy
      have h1 := mem_ball_zero_iff.1 (hm hy)
      rw [mem_ball_zero_iff, norm_mul, Complex.norm_real, Real.norm_eq_abs,
        abs_of_pos (hr0 k)]
      nlinarith [hr0 k, hr1 k, norm_nonneg (f y)]
    have h := schwarz_pick' hgd hgm (hzk1 k) hz
    simp only [hzkfix k] at h
    have hpos : 0 < 1 - ‖zk k‖ ^ 2 := by nlinarith [norm_nonneg (zk k), hzk1 k]
    rw [mul_assoc, mul_assoc] at h
    exact le_of_mul_le_mul_left h hpos
  have hconj : Tendsto (fun k => conj (zk (φ k))) atTop (𝓝 (conj w)) :=
    (Complex.continuous_conj.tendsto w).comp hlim'
  have hL : Tendsto
      (fun k => (1 - ‖z‖ ^ 2) * ‖1 - conj (zk (φ k)) * ((r (φ k) : ℂ) * f z)‖ ^ 2)
      atTop (𝓝 ((1 - ‖z‖ ^ 2) * ‖1 - conj w * ((1 : ℂ) * f z)‖ ^ 2)) :=
    ((tendsto_const_nhds.sub (hconj.mul (hrc.mul tendsto_const_nhds))).norm.pow 2).const_mul _
  have hR : Tendsto
      (fun k => (1 - ‖(r (φ k) : ℂ) * f z‖ ^ 2) * ‖1 - conj (zk (φ k)) * z‖ ^ 2)
      atTop (𝓝 ((1 - ‖(1 : ℂ) * f z‖ ^ 2) * ‖1 - conj w * z‖ ^ 2)) :=
    (tendsto_const_nhds.sub ((hrc.mul tendsto_const_nhds).norm.pow 2)).mul
      ((tendsto_const_nhds.sub (hconj.mul tendsto_const_nhds)).norm.pow 2)
  have hfin := le_of_tendsto_of_tendsto' hL hR (fun k => hk (φ k))
  simp only [one_mul] at hfin
  exact hfin

lemma iterate_diff {f : ℂ → ℂ} (hf : DifferentiableOn ℂ f (ball 0 1))
    (hm : MapsTo f (ball 0 1) (ball 0 1)) (n : ℕ) :
    DifferentiableOn ℂ (f^[n]) (ball 0 1) := by
  induction n with
  | zero => exact differentiableOn_id
  | succ n ih =>
    rw [Function.iterate_succ]
    exact ih.comp hf hm

set_option maxHeartbeats 1000000 in
lemma escape (f : ℂ → ℂ) (hf : DifferentiableOn ℂ f (ball 0 1))
    (hm : MapsTo f (ball 0 1) (ball 0 1)) (hfix : ∀ z ∈ ball (0 : ℂ) 1, f z ≠ z)
    (w : ℂ) (hw1 : ‖w‖ = 1)
    (hwolff : ∀ z, ‖z‖ < 1 →
      (1 - ‖z‖ ^ 2) * ‖1 - conj w * f z‖ ^ 2 ≤ (1 - ‖f z‖ ^ 2) * ‖1 - conj w * z‖ ^ 2) :
    ∀ ε > 0, ∀ᶠ n in atTop, 1 - ‖f^[n] 0‖ < ε := by
  have hden : ∀ z : ℂ, ‖z‖ < 1 → 1 - conj w * z ≠ 0 :=
    fun z hz => one_sub_ne_zero hw1.le hz
  have hmz : ∀ z : ℂ, ‖z‖ < 1 → ‖f z‖ < 1 :=
    fun z hz => mem_ball_zero_iff.1 (hm (mem_ball_zero_iff.2 hz))
  set u : ℂ → ℝ := fun z => (1 - ‖z‖ ^ 2) / ‖1 - conj w * z‖ ^ 2 with hu
  have hupos : ∀ z, ‖z‖ < 1 → 0 < ‖1 - conj w * z‖ ^ 2 := fun z hz => by
    have := norm_pos_iff.2 (hden z hz)
    positivity
  have hu_mono : ∀ z, ‖z‖ < 1 → u z ≤ u (f z) := by
    intro z hz
    simp only [hu]
    rw [div_le_div_iff₀ (hupos z hz) (hupos (f z) (hmz z hz))]
    exact hwolff z hz
  have hit : ∀ (n : ℕ) (z : ℂ), ‖z‖ < 1 → ‖f^[n] z‖ < 1 :=
    fun n z hz => mem_ball_zero_iff.1 ((hm.iterate n) (mem_ball_zero_iff.2 hz))
  have hu_iter : ∀ (n : ℕ) (z : ℂ), ‖z‖ < 1 → u z ≤ u (f^[n] z) := by
    intro n
    induction n with
    | zero => intro z hz; simp
    | succ n ih =>
      intro z hz
      rw [Function.iterate_succ_apply']
      exact (ih z hz).trans (hu_mono _ (hit n z hz))
  set x : ℕ → ℂ := fun n => f^[n] 0 with hx
  have hx1 : ∀ n, ‖x n‖ < 1 := fun n => hit n 0 (by simp)
  have hxs : ∀ n, x (n + 1) = f (x n) := fun n => Function.iterate_succ_apply' f n 0
  have hx0 : x 0 = 0 := rfl
  have hucont : ContinuousOn u (ball 0 1) := by
    apply ContinuousOn.div
    · exact (continuousOn_const.sub ((continuous_norm.pow 2).continuousOn))
    · exact ((continuous_const.sub (continuous_const.mul continuous_id)).norm.pow 2).continuousOn
    · intro z hz
      exact (hupos z (mem_ball_zero_iff.1 hz)).ne'
  have hUmono : Monotone (fun n => u (x n)) :=
    monotone_nat_of_le_succ (fun n => by rw [hxs]; exact hu_mono _ (hx1 n))
  -- the orbit of `0` escapes to the boundary
  have hesc : ∀ ε > 0, ∀ᶠ n in atTop, 1 - ‖x n‖ < ε := by
    intro ε hε
    by_contra hcon
    rw [not_eventually] at hcon
    obtain ⟨ψ1, hψ1, hP⟩ := extraction_of_frequently_atTop hcon
    have hK : ∀ k, x (ψ1 k) ∈ closedBall (0 : ℂ) (1 - ε) :=
      fun k => mem_closedBall_zero_iff.2 (by linarith [not_lt.1 (hP k)])
    obtain ⟨c, hc, ψ2, hψ2, hlim⟩ :=
      (isCompact_closedBall (0 : ℂ) (1 - ε)).tendsto_subseq hK
    have hc1 : ‖c‖ < 1 := lt_of_le_of_lt (mem_closedBall_zero_iff.1 hc) (by linarith)
    have hcm : c ∈ ball (0 : ℂ) 1 := mem_ball_zero_iff.2 hc1
    set ψ : ℕ → ℕ := ψ1 ∘ ψ2 with hψdef
    have hψ : StrictMono ψ := hψ1.comp hψ2
    have hlim' : Tendsto (fun k => x (ψ k)) atTop (𝓝 c) := hlim
    have hfc : ContinuousAt f c := hf.continuousOn.continuousAt (isOpen_ball.mem_nhds hcm)
    have hfcm : f c ∈ ball (0 : ℂ) 1 := hm hcm
    rcases (hu_mono c hc1).lt_or_eq with hlt | heq
    · -- strict case
      have h1 : Tendsto (fun k => u (x (ψ k))) atTop (𝓝 (u c)) :=
        (hucont.continuousAt (isOpen_ball.mem_nhds hcm)).tendsto.comp hlim'
      have h2 : Tendsto (fun k => u (x (ψ k + 1))) atTop (𝓝 (u (f c))) := by
        have h := ((hucont.continuousAt (isOpen_ball.mem_nhds hfcm)).tendsto.comp
          (hfc.tendsto.comp hlim'))
        refine h.congr (fun k => ?_)
        simp only [Function.comp, hxs]
      have h3 : ∀ k, u (x (ψ k + 1)) ≤ u c := fun k =>
        ge_of_tendsto h1 (eventually_atTop.2 ⟨k + 1, fun j hj => hUmono (by
          have h4 := hψ.monotone hj
          have h5 := hψ (Nat.lt_add_one k)
          omega)⟩)
      have h4 : u (f c) ≤ u c := le_of_tendsto' h2 h3
      linarith
    · -- equality case: `f` is "parabolic"
      set F : ℂ → ℂ := fun z => (1 + conj w * z) / (1 - conj w * z) with hF
      set G : ℂ → ℂ := fun z => F (f z) - F z with hG
      have hFre : ∀ z, ‖z‖ < 1 → (F z).re = u z := by
        intro z hz
        have hζ : ‖conj w * z‖ = ‖z‖ := by rw [norm_mul, Complex.norm_conj, hw1, one_mul]
        simp only [hF, hu]
        rw [Complex.div_re, ← add_div, ← hζ, Complex.sq_norm, Complex.sq_norm]
        congr 1
        simp [Complex.normSq_apply]
        ring
      have hFdiff : DifferentiableOn ℂ F (ball 0 1) := by
        apply DifferentiableOn.div
        · exact ((differentiable_const _).add
            ((differentiable_const _).mul differentiable_id)).differentiableOn
        · exact ((differentiable_const _).sub
            ((differentiable_const _).mul differentiable_id)).differentiableOn
        · intro z hz
          exact hden z (mem_ball_zero_iff.1 hz)
      have hGdiff : DifferentiableOn ℂ G (ball 0 1) := (hFdiff.comp hf hm).sub hFdiff
      have hGre : ∀ z, ‖z‖ < 1 → (G z).re = u (f z) - u z := by
        intro z hz
        simp only [hG, Complex.sub_re]
        rw [hFre z hz, hFre (f z) (hmz z hz)]
      set E : ℂ → ℂ := fun z => Complex.exp (-(G z)) with hE
      have hEdiff : DifferentiableOn ℂ E (ball 0 1) := hGdiff.neg.cexp
      have hEnorm : ∀ z, ‖z‖ < 1 → ‖E z‖ = Real.exp (-(u (f z) - u z)) := by
        intro z hz
        simp only [hE]
        rw [Complex.norm_exp, Complex.neg_re, hGre z hz]
      have hmax : IsMaxOn (norm ∘ E) (ball 0 1) c := by
        rw [isMaxOn_iff]
        intro z hz
        have hz1 := mem_ball_zero_iff.1 hz
        simp only [Function.comp]
        rw [hEnorm z hz1, hEnorm c hc1, ← heq, sub_self, neg_zero]
        apply Real.exp_le_exp.2
        linarith [hu_mono z hz1]
      have hEconst := Complex.eqOn_of_isPreconnected_of_isMaxOn_norm
        (convex_ball (0 : ℂ) 1).isPreconnected isOpen_ball hEdiff hcm hmax
      have hGderiv : EqOn (deriv G) 0 (ball 0 1) := by
        intro z hz
        have hGz : HasDerivAt G (deriv G z) z :=
          (hGdiff.differentiableAt (isOpen_ball.mem_nhds hz)).hasDerivAt
        have hEz : HasDerivAt E (Complex.exp (-(G z)) * (-(deriv G z))) z := hGz.neg.cexp
        have hev : E =ᶠ[𝓝 z] fun _ => E c := by
          filter_upwards [isOpen_ball.mem_nhds hz] with y hy
          exact hEconst hy
        have h0 : deriv E z = 0 := by
          rw [hev.deriv_eq]
          exact deriv_const z (E c)
        rw [hEz.deriv] at h0
        have h1 := (mul_eq_zero.1 h0).resolve_left (Complex.exp_ne_zero _)
        simpa using h1
      have h0m : (0 : ℂ) ∈ ball (0 : ℂ) 1 := mem_ball_zero_iff.2 (by simp)
      have hGconst : ∀ z, ‖z‖ < 1 → G z = G 0 := fun z hz =>
        isOpen_ball.is_const_of_deriv_eq_zero (convex_ball (0 : ℂ) 1).isPreconnected hGdiff
          hGderiv (mem_ball_zero_iff.2 hz) h0m
      have hwne : conj w ≠ 0 := by
        intro h
        have : ‖conj w‖ = 0 := by rw [h, norm_zero]
        rw [Complex.norm_conj, hw1] at this
        exact one_ne_zero this
      have hG0 : G 0 ≠ 0 := by
        intro h
        have h1 : F (f 0) = F 0 := sub_eq_zero.1 h
        simp only [hF] at h1
        rw [div_eq_div_iff (hden _ (hmz 0 (by simp))) (hden 0 (by simp))] at h1
        have h2 : conj w * f 0 = conj w * 0 := by linear_combination (1 / 2 : ℂ) * h1
        exact hfix 0 h0m (mul_left_cancel₀ hwne h2)
      have hFx : ∀ n : ℕ, F (x n) = F 0 + n * G 0 := by
        intro n
        induction n with
        | zero => simp [hx0]
        | succ n ih =>
          have h1 : F (x (n + 1)) = G (x n) + F (x n) := by
            simp only [hG, hxs]; ring
          rw [h1, hGconst _ (hx1 n), ih]
          push_cast
          ring
      have hFc : Tendsto (fun k => ‖F (x (ψ k))‖) atTop (𝓝 ‖F c‖) :=
        ((hFdiff.continuousOn.continuousAt (isOpen_ball.mem_nhds hcm)).tendsto.comp
          hlim').norm
      have hlow : ∀ k, (ψ k : ℝ) * ‖G 0‖ - ‖F 0‖ ≤ ‖F (x (ψ k))‖ := by
        intro k
        rw [hFx]
        have h1 : ‖((ψ k : ℕ) : ℂ) * G 0‖ ≤ ‖F 0 + ((ψ k : ℕ) : ℂ) * G 0‖ + ‖F 0‖ := by
          have h2 := norm_sub_le (F 0 + ((ψ k : ℕ) : ℂ) * G 0) (F 0)
          simpa using h2
        rw [norm_mul, Complex.norm_natCast] at h1
        linarith
      have htop : Tendsto (fun k => (ψ k : ℝ) * ‖G 0‖ - ‖F 0‖) atTop atTop := by
        have h1 : Tendsto (fun k => ((ψ k : ℕ) : ℝ)) atTop atTop :=
          tendsto_natCast_atTop_atTop.comp hψ.tendsto_atTop
        have h2 := h1.atTop_mul_const (norm_pos_iff.2 hG0)
        exact tendsto_atTop_add_const_right atTop (-‖F 0‖) h2
      have htop' : Tendsto (fun k => ‖F (x (ψ k))‖) atTop atTop :=
        tendsto_atTop_mono hlow htop
      exact not_tendsto_nhds_of_tendsto_atTop htop' _ hFc
  exact hesc

set_option maxHeartbeats 1000000 in
lemma estimate (f : ℂ → ℂ) (hf : DifferentiableOn ℂ f (ball 0 1))
    (hm : MapsTo f (ball 0 1) (ball 0 1)) (hfix : ∀ z ∈ ball (0 : ℂ) 1, f z ≠ z)
    (w : ℂ) (hw1 : ‖w‖ = 1)
    (hwolff : ∀ z, ‖z‖ < 1 →
      (1 - ‖z‖ ^ 2) * ‖1 - conj w * f z‖ ^ 2 ≤ (1 - ‖f z‖ ^ 2) * ‖1 - conj w * z‖ ^ 2) :
    ∀ (n : ℕ) (z : ℂ), ‖z‖ < 1 →
      ‖w - f^[n] z‖ ^ 2 * (1 - ‖z‖ ^ 2) ^ 2 ≤ 32 * (1 - ‖f^[n] 0‖) := by
  have hden : ∀ z : ℂ, ‖z‖ < 1 → 1 - conj w * z ≠ 0 :=
    fun z hz => one_sub_ne_zero hw1.le hz
  have hmz : ∀ z : ℂ, ‖z‖ < 1 → ‖f z‖ < 1 :=
    fun z hz => mem_ball_zero_iff.1 (hm (mem_ball_zero_iff.2 hz))
  set u : ℂ → ℝ := fun z => (1 - ‖z‖ ^ 2) / ‖1 - conj w * z‖ ^ 2 with hu
  have hupos : ∀ z, ‖z‖ < 1 → 0 < ‖1 - conj w * z‖ ^ 2 := fun z hz => by
    have := norm_pos_iff.2 (hden z hz)
    positivity
  have hu_mono : ∀ z, ‖z‖ < 1 → u z ≤ u (f z) := by
    intro z hz
    simp only [hu]
    rw [div_le_div_iff₀ (hupos z hz) (hupos (f z) (hmz z hz))]
    exact hwolff z hz
  have hit : ∀ (n : ℕ) (z : ℂ), ‖z‖ < 1 → ‖f^[n] z‖ < 1 :=
    fun n z hz => mem_ball_zero_iff.1 ((hm.iterate n) (mem_ball_zero_iff.2 hz))
  have hu_iter : ∀ (n : ℕ) (z : ℂ), ‖z‖ < 1 → u z ≤ u (f^[n] z) := by
    intro n
    induction n with
    | zero => intro z hz; simp
    | succ n ih =>
      intro z hz
      rw [Function.iterate_succ_apply']
      exact (ih z hz).trans (hu_mono _ (hit n z hz))
  set x : ℕ → ℂ := fun n => f^[n] 0 with hx
  have hx1 : ∀ n, ‖x n‖ < 1 := fun n => hit n 0 (by simp)
  have hxs : ∀ n, x (n + 1) = f (x n) := fun n => Function.iterate_succ_apply' f n 0
  have hx0 : x 0 = 0 := rfl
  have hucont : ContinuousOn u (ball 0 1) := by
    apply ContinuousOn.div
    · exact (continuousOn_const.sub ((continuous_norm.pow 2).continuousOn))
    · exact ((continuous_const.sub (continuous_const.mul continuous_id)).norm.pow 2).continuousOn
    · intro z hz
      exact (hupos z (mem_ball_zero_iff.1 hz)).ne'
  have hUmono : Monotone (fun n => u (x n)) :=
    monotone_nat_of_le_succ (fun n => by rw [hxs]; exact hu_mono _ (hx1 n))
  -- uniform estimate
  have hest : ∀ (n : ℕ) (z : ℂ), ‖z‖ < 1 →
      ‖w - f^[n] z‖ ^ 2 * (1 - ‖z‖ ^ 2) ^ 2 ≤ 32 * (1 - ‖x n‖) := by
    intro n z hz
    have hb1 : ‖f^[n] z‖ < 1 := hit n z hz
    have hsp := schwarz_pick' (iterate_diff hf hm n) (hm.iterate n) (a := 0) (z := z)
      (by simp) hz
    simp only [norm_zero, map_zero, zero_mul, sub_zero, norm_one] at hsp
    have hsp' : (1 - ‖z‖ ^ 2) * ‖1 - conj (x n) * f^[n] z‖ ^ 2
        ≤ (1 - ‖x n‖ ^ 2) * (1 - ‖f^[n] z‖ ^ 2) := by
      have := hsp
      simp only [hx]
      nlinarith [this]
    have hN : 1 - ‖f^[n] z‖ ≤ ‖1 - conj (x n) * f^[n] z‖ := by
      have h1 := norm_sub_norm_le (1 : ℂ) (conj (x n) * f^[n] z)
      rw [norm_one, norm_mul, Complex.norm_conj] at h1
      have h2 : ‖x n‖ * ‖f^[n] z‖ ≤ 1 * ‖f^[n] z‖ :=
        mul_le_mul_of_nonneg_right (hx1 n).le (norm_nonneg _)
      linarith
    have hui := hu_iter n z hz
    simp only [hu] at hui
    rw [div_le_div_iff₀ (hupos z hz) (hupos _ hb1)] at hui
    have hwb : ‖w - f^[n] z‖ = ‖1 - conj w * f^[n] z‖ := by
      have h1 : w - f^[n] z = w * (1 - conj w * f^[n] z) := by
        have h2 : w * conj w = 1 := by
          rw [Complex.mul_conj, Complex.normSq_eq_norm_sq, hw1]; simp
        linear_combination (f^[n] z) * h2
      rw [h1, norm_mul, hw1, one_mul]
    have hwz : ‖1 - conj w * z‖ ≤ 2 := by
      have h1 := norm_sub_le (1 : ℂ) (conj w * z)
      rw [norm_one, norm_mul, Complex.norm_conj, hw1, one_mul] at h1
      linarith
    rw [hwb]
    set A := ‖x n‖ with hA
    set B := ‖f^[n] z‖ with hB
    set Z := ‖z‖ with hZ
    set N := ‖1 - conj (x n) * f^[n] z‖ with hNdef
    set M := ‖1 - conj w * f^[n] z‖ with hM
    set W := ‖1 - conj w * z‖ with hW
    have hA0 : 0 ≤ A := norm_nonneg _
    have hB0 : 0 ≤ B := norm_nonneg _
    have hZ0 : 0 ≤ Z := norm_nonneg _
    have hW0 : 0 ≤ W := norm_nonneg _
    have hM0 : 0 ≤ M := norm_nonneg _
    have hA1 : A < 1 := hx1 n
    have hZ2 : 0 < 1 - Z ^ 2 := by nlinarith
    -- (1 - Z^2) (1 - B) ≤ 4 (1 - A)
    have hN2 : (1 - B) ^ 2 ≤ N ^ 2 := pow_le_pow_left₀ (by linarith) hN 2
    have k1 : (1 - Z ^ 2) * (1 - B) ^ 2 ≤ (1 - A ^ 2) * (1 - B ^ 2) :=
      (mul_le_mul_of_nonneg_left hN2 hZ2.le).trans hsp'
    have k2 : (1 - Z ^ 2) * (1 - B) ≤ (1 - A ^ 2) * (1 + B) := by
      have h1 : (1 - B) * ((1 - Z ^ 2) * (1 - B)) ≤ (1 - B) * ((1 - A ^ 2) * (1 + B)) := by
        nlinarith [k1]
      exact le_of_mul_le_mul_left h1 (by linarith)
    have hA2 : 0 ≤ 1 - A ^ 2 := by nlinarith
    have k3 : (1 - Z ^ 2) * (1 - B) ≤ 4 * (1 - A) := by
      nlinarith [mul_nonneg hA2 (show 0 ≤ 1 - B by linarith), sq_nonneg (1 - A)]
    -- M^2 (1 - Z^2) ≤ 8 (1 - B)
    have k4 : (1 - Z ^ 2) * M ^ 2 ≤ (1 - B ^ 2) * 4 := by
      have h1 : W ^ 2 ≤ 4 := by nlinarith
      have h2 : (1 - B ^ 2) * W ^ 2 ≤ (1 - B ^ 2) * 4 :=
        mul_le_mul_of_nonneg_left h1 (by nlinarith)
      linarith
    have k5 : (1 - Z ^ 2) * M ^ 2 ≤ 8 * (1 - B) := by
      nlinarith [sq_nonneg (1 - B)]
    have k6 : (1 - Z ^ 2) * ((1 - Z ^ 2) * M ^ 2) ≤ (1 - Z ^ 2) * (8 * (1 - B)) :=
      mul_le_mul_of_nonneg_left k5 hZ2.le
    nlinarith [k6, k3]
  exact hest

end Problem7

theorem problem7 (f : ℂ → ℂ)
    (hf : DifferentiableOn ℂ f (Metric.ball 0 1))
    (hm : Set.MapsTo f (Metric.ball 0 1) (Metric.ball 0 1))
    (hfix : ∀ z ∈ Metric.ball (0 : ℂ) 1, f z ≠ z) :
    ∃ w : ℂ, ‖w‖ = 1 ∧
      TendstoLocallyUniformlyOn (fun n : ℕ => f^[n]) (fun _ => w)
        Filter.atTop (Metric.ball 0 1) := by
  obtain ⟨w, hw1, hwolff⟩ := Problem7.wolff f hf hm hfix
  refine ⟨w, hw1, ?_⟩
  have hesc := Problem7.escape f hf hm hfix w hw1 hwolff
  have hest := Problem7.estimate f hf hm hfix w hw1 hwolff
  -- conclusion
  rw [Metric.tendstoLocallyUniformlyOn_iff]
  intro ε hε p hp
  rw [mem_ball_zero_iff] at hp
  set ρ := (1 + ‖p‖) / 2 with hρ
  have hρ1 : ρ < 1 := by rw [hρ]; linarith
  have hpρ : ‖p‖ < ρ := by rw [hρ]; linarith
  have hρ0 : 0 < ρ := by rw [hρ]; linarith [norm_nonneg p]
  set δ := 1 - ρ ^ 2 with hδ
  have hρ2 : ρ ^ 2 < 1 := pow_lt_one₀ hρ0.le hρ1 two_ne_zero
  have hδ0 : 0 < δ := by rw [hδ]; linarith
  refine ⟨ball 0 ρ, mem_nhdsWithin_of_mem_nhds
    (isOpen_ball.mem_nhds (mem_ball_zero_iff.2 hpρ)), ?_⟩
  have hev := hesc (ε ^ 2 * δ ^ 2 / 32) (by positivity)
  filter_upwards [hev] with n hn
  intro y hy
  rw [mem_ball_zero_iff] at hy
  have hy1 : ‖y‖ < 1 := hy.trans hρ1
  have h1 := hest n y hy1
  have hy2 : ‖y‖ ^ 2 < ρ ^ 2 := pow_lt_pow_left₀ hy (norm_nonneg y) two_ne_zero
  have h2 : δ < 1 - ‖y‖ ^ 2 := by rw [hδ]; linarith
  show dist w (f^[n] y) < ε
  rw [dist_eq_norm]
  have h3 : ‖w - f^[n] y‖ ^ 2 * δ ^ 2 ≤ ‖w - f^[n] y‖ ^ 2 * (1 - ‖y‖ ^ 2) ^ 2 := by
    apply mul_le_mul_of_nonneg_left _ (by positivity)
    exact pow_le_pow_left₀ hδ0.le h2.le 2
  have h4 : ‖w - f^[n] y‖ ^ 2 * δ ^ 2 < ε ^ 2 * δ ^ 2 := by
    have : 32 * (1 - ‖f^[n] 0‖) < ε ^ 2 * δ ^ 2 := by linarith [hn]
    linarith
  have h5 : ‖w - f^[n] y‖ ^ 2 < ε ^ 2 := lt_of_mul_lt_mul_right h4 (by positivity)
  exact lt_of_pow_lt_pow_left₀ 2 hε.le h5


#print axioms problem7
