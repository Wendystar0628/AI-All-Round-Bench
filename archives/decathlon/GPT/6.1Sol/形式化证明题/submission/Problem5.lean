import Mathlib.Analysis.Complex.Schwarz
import Mathlib.Analysis.Calculus.FDeriv.Comp
import Mathlib.Topology.UniformSpace.LocallyUniformConvergence
import Mathlib.Topology.MetricSpace.ProperSpace
import Mathlib.Analysis.SpecificLimits.Basic
import Mathlib.Tactic.Linarith
import Mathlib.Tactic.FieldSimp
import Mathlib.Tactic.Ring
import Mathlib.Tactic.Positivity

open Set Filter Metric
open scoped Topology

/-
Partial work for Problem 5. The iterates remain holomorphic self-maps of the disk,
and any convergent full orbit has its limit on the unit circle. The existence of
the common locally uniform limit, and hence the requested theorem, is not proved.
-/

theorem problem5_iterates (f : ℂ → ℂ)
    (hf : DifferentiableOn ℂ f (Metric.ball 0 1))
    (hm : Set.MapsTo f (Metric.ball 0 1) (Metric.ball 0 1)) (n : ℕ) :
    DifferentiableOn ℂ f^[n] (Metric.ball 0 1) ∧
      Set.MapsTo f^[n] (Metric.ball 0 1) (Metric.ball 0 1) :=
  ⟨hf.iterate hm n, hm.iterate n⟩

theorem problem5_orbit_norm (f : ℂ → ℂ)
    (hm : Set.MapsTo f (Metric.ball 0 1) (Metric.ball 0 1))
    {z : ℂ} (hz : z ∈ Metric.ball (0 : ℂ) 1) (n : ℕ) : ‖f^[n] z‖ < 1 := by
  simpa [Metric.mem_ball, dist_zero_right] using hm.iterate n hz

theorem problem5_orbit_limit_on_circle (f : ℂ → ℂ)
    (hf : DifferentiableOn ℂ f (Metric.ball 0 1))
    (hm : Set.MapsTo f (Metric.ball 0 1) (Metric.ball 0 1))
    (hfix : ∀ z ∈ Metric.ball (0 : ℂ) 1, f z ≠ z)
    {z w : ℂ} (hz : z ∈ Metric.ball (0 : ℂ) 1)
    (hlim : Tendsto (fun n : ℕ => f^[n] z) atTop (𝓝 w)) : ‖w‖ = 1 := by
  have hwc : w ∈ Metric.closedBall (0 : ℂ) 1 := by
    apply isClosed_closedBall.mem_of_tendsto hlim
    exact Filter.Eventually.of_forall (fun n => Metric.ball_subset_closedBall (hm.iterate n hz))
  have hle : ‖w‖ ≤ 1 := by simpa [Metric.mem_closedBall, dist_zero_right] using hwc
  apply le_antisymm hle
  by_contra! hlt
  have hwb : w ∈ Metric.ball (0 : ℂ) 1 := by
    simpa [Metric.mem_ball, dist_zero_right] using hlt
  have hfc : ContinuousAt f w :=
    hf.continuousOn.continuousAt (Metric.isOpen_ball.mem_nhds hwb)
  have hfseq : Tendsto (fun n : ℕ => f (f^[n] z)) atTop (𝓝 (f w)) :=
    hfc.tendsto.comp hlim
  have hshift : Tendsto (fun n : ℕ => f (f^[n] z)) atTop (𝓝 w) := by
    have hs := hlim.comp (tendsto_add_atTop_nat 1)
    change Tendsto (fun n : ℕ => f^[n + 1] z) atTop (𝓝 w) at hs
    convert hs using 1
    funext n
    exact (Function.iterate_succ_apply' f n z).symm
  exact hfix w hwb (tendsto_nhds_unique hfseq hshift)

theorem problem5_orbit_subsequence (f : ℂ → ℂ)
    (hm : Set.MapsTo f (Metric.ball 0 1) (Metric.ball 0 1))
    {z : ℂ} (hz : z ∈ Metric.ball (0 : ℂ) 1) :
    ∃ w : ℂ, ‖w‖ ≤ 1 ∧ ∃ φ : ℕ → ℕ, StrictMono φ ∧
      Tendsto (fun n => f^[φ n] z) atTop (𝓝 w) := by
  obtain ⟨w, hw, φ, hφ, hlim⟩ := (isCompact_closedBall (0 : ℂ) 1).tendsto_subseq
    (fun n => Metric.ball_subset_closedBall (hm.iterate n hz))
  exact ⟨w, by simpa [Metric.mem_closedBall, dist_zero_right] using hw, φ, hφ, hlim⟩

namespace Problem5Proof

open Complex
open scoped ComplexConjugate

noncomputable def mob (a z : ℂ) : ℂ := (z - a) / (1 - conj a * z)

lemma mob_identity (a z : ℂ) :
    ‖1 - conj a * z‖ ^ 2 - ‖z - a‖ ^ 2 = (1 - ‖a‖ ^ 2) * (1 - ‖z‖ ^ 2) := by
  simp only [← Complex.normSq_eq_norm_sq, Complex.normSq_apply, Complex.sub_re,
    Complex.sub_im, Complex.mul_re, Complex.mul_im, Complex.one_re, Complex.one_im,
    Complex.conj_re, Complex.conj_im]
  ring

lemma mob_den {a z : ℂ} (ha : ‖a‖ < 1) (hz : ‖z‖ < 1) :
    1 - conj a * z ≠ 0 := by
  intro he
  have he' : conj a * z = 1 := (sub_eq_zero.mp he).symm
  have hlt : ‖conj a * z‖ < 1 := calc
    ‖conj a * z‖ = ‖a‖ * ‖z‖ := by simp
    _ ≤ 1 * ‖z‖ := mul_le_mul_of_nonneg_right ha.le (norm_nonneg _)
    _ < 1 := by simpa using hz
  simpa [he'] using hlt

lemma mob_norm {a z : ℂ} (ha : ‖a‖ < 1) (hz : ‖z‖ < 1) : ‖mob a z‖ < 1 := by
  have hp : 0 < (1 - ‖a‖ ^ 2) * (1 - ‖z‖ ^ 2) :=
    mul_pos (by nlinarith [norm_nonneg a]) (by nlinarith [norm_nonneg z])
  have hi := mob_identity a z
  have hlt : ‖z - a‖ < ‖1 - conj a * z‖ := by
    nlinarith [norm_nonneg (z - a), norm_nonneg (1 - conj a * z)]
  simpa only [mob, norm_div] using
    (div_lt_one (norm_pos_iff.mpr (mob_den ha hz))).mpr hlt

lemma mob_differentiable {a : ℂ} (ha : ‖a‖ < 1) :
    DifferentiableOn ℂ (mob a) (ball 0 1) := by
  intro z hz
  exact ((differentiableAt_id.sub_const a).div
    ((differentiableAt_const (1 : ℂ)).sub (differentiableAt_id.const_mul (conj a)))
    (mob_den ha (mem_ball_zero_iff.mp hz))).differentiableWithinAt

lemma mob_inverse {a z : ℂ} (ha : ‖a‖ < 1) (hz : ‖z‖ < 1) :
    mob (-a) (mob a z) = z := by
  have hd := mob_den ha hz
  have he := mob_den (show ‖-a‖ < 1 by simpa using ha) (mob_norm ha hz)
  unfold mob at he ⊢
  simp only [map_neg] at he ⊢
  apply (div_eq_iff he).mpr
  have hd' : 1 - z * conj a ≠ 0 := by simpa only [mul_comm] using hd
  field_simp [hd, hd']
  ring

lemma schwarz_pick (f : ℂ → ℂ) (hf : DifferentiableOn ℂ f (ball 0 1))
    (hm : MapsTo f (ball 0 1) (ball 0 1)) {a z : ℂ}
    (ha : ‖a‖ < 1) (hz : ‖z‖ < 1) : ‖mob (f a) (f z)‖ ≤ ‖mob a z‖ := by
  have hfa : ‖f a‖ < 1 := mem_ball_zero_iff.mp (hm (mem_ball_zero_iff.mpr ha))
  have hna : ‖-a‖ < 1 := by simpa using ha
  have hmn : MapsTo (mob (-a)) (ball 0 1) (ball 0 1) := fun w hw =>
    mem_ball_zero_iff.mpr (mob_norm hna (mem_ball_zero_iff.mp hw))
  let g : ℂ → ℂ := fun w => mob (f a) (f (mob (-a) w))
  have hg : DifferentiableOn ℂ g (ball 0 1) :=
    (mob_differentiable hfa).comp (hf.comp (mob_differentiable hna) hmn) (hm.comp hmn)
  have hgm : MapsTo g (ball 0 1) (closedBall 0 1) := by
    intro w hw
    exact ball_subset_closedBall (mem_ball_zero_iff.mpr
      (mob_norm hfa (mem_ball_zero_iff.mp (hm (hmn hw)))))
  have hg0 : g 0 = 0 := by simp [g, mob]
  have h := Complex.norm_le_norm_of_mapsTo_ball hg hgm hg0 (mob_norm ha hz)
  simpa only [g, mob_inverse ha hz] using h

lemma scalar_identity (t : ℝ) (a z : ℂ) :
    ‖1 - conj ((t : ℂ) * a) * ((t : ℂ) * z)‖ ^ 2 -
      t ^ 2 * ‖1 - conj a * z‖ ^ 2 =
      (1 - t ^ 2) * (1 - t ^ 2 * ‖a‖ ^ 2 * ‖z‖ ^ 2) := by
  simp only [← Complex.normSq_eq_norm_sq, Complex.normSq_apply, Complex.sub_re,
    Complex.sub_im, Complex.mul_re, Complex.mul_im, Complex.one_re, Complex.one_im,
    Complex.conj_re, Complex.conj_im, Complex.ofReal_re, Complex.ofReal_im]
  ring

lemma scalar_strict {t : ℝ} (ht : 0 < t) (ht1 : t < 1) {a z : ℂ}
    (ha : ‖a‖ < 1) (hz : ‖z‖ < 1) (haz : a ≠ z) :
    ‖mob ((t : ℂ) * a) ((t : ℂ) * z)‖ < ‖mob a z‖ := by
  have ht2 : t ^ 2 < 1 := by nlinarith
  have ha2 : ‖a‖ ^ 2 ≤ 1 := by nlinarith [norm_nonneg a]
  have hz2 : ‖z‖ ^ 2 ≤ 1 := by nlinarith [norm_nonneg z]
  have hp : t ^ 2 * ‖a‖ ^ 2 * ‖z‖ ^ 2 ≤ t ^ 2 := calc
    _ ≤ t ^ 2 * 1 * 1 := by gcongr
    _ = t ^ 2 := by ring
  have hprod : 0 < (1 - t ^ 2) * (1 - t ^ 2 * ‖a‖ ^ 2 * ‖z‖ ^ 2) :=
    mul_pos (by linarith) (by linarith)
  have hi := scalar_identity t a z
  have hd : t * ‖1 - conj a * z‖ < ‖1 - conj ((t : ℂ) * a) * ((t : ℂ) * z)‖ := by
    nlinarith [norm_nonneg (1 - conj a * z),
      norm_nonneg (1 - conj ((t : ℂ) * a) * ((t : ℂ) * z))]
  have hta : ‖(t : ℂ) * a‖ < 1 := by
    rw [norm_mul, Complex.norm_real, Real.norm_eq_abs, abs_of_pos ht]
    nlinarith [norm_nonneg a]
  have htz : ‖(t : ℂ) * z‖ < 1 := by
    rw [norm_mul, Complex.norm_real, Real.norm_eq_abs, abs_of_pos ht]
    nlinarith [norm_nonneg z]
  have hn : 0 < ‖z - a‖ := norm_pos_iff.mpr (sub_ne_zero.mpr haz.symm)
  simp only [mob, norm_div]
  rw [show (t : ℂ) * z - (t : ℂ) * a = (t : ℂ) * (z - a) by ring,
    norm_mul, Complex.norm_real, Real.norm_eq_abs, abs_of_pos ht]
  apply (div_lt_div_iff₀ (norm_pos_iff.mpr (mob_den hta htz))
    (norm_pos_iff.mpr (mob_den ha hz))).mpr
  nlinarith [mul_lt_mul_of_pos_right hd hn]

lemma scaled_strict (f : ℂ → ℂ) (hf : DifferentiableOn ℂ f (ball 0 1))
    (hm : MapsTo f (ball 0 1) (ball 0 1)) {t : ℝ} (ht : 0 < t) (ht1 : t < 1)
    {a z : ℂ} (ha : ‖a‖ < 1) (hz : ‖z‖ < 1) (haz : a ≠ z) :
    ‖mob ((t : ℂ) * f a) ((t : ℂ) * f z)‖ < ‖mob a z‖ := by
  by_cases he : f a = f z
  · simp only [he, mob, sub_self, zero_div, norm_zero]
    exact norm_pos_iff.mpr (div_ne_zero (sub_ne_zero.mpr haz.symm) (mob_den ha hz))
  · exact (scalar_strict ht ht1 (mem_ball_zero_iff.mp (hm (mem_ball_zero_iff.mpr ha)))
      (mem_ball_zero_iff.mp (hm (mem_ball_zero_iff.mpr hz))) he).trans_le
      (schwarz_pick f hf hm ha hz)

lemma scaled_fixed (f : ℂ → ℂ) (hf : DifferentiableOn ℂ f (ball 0 1))
    (hm : MapsTo f (ball 0 1) (ball 0 1)) {t : ℝ} (ht : 0 < t) (ht1 : t < 1) :
    ∃ a : ℂ, ‖a‖ < 1 ∧ (t : ℂ) * f a = a := by
  let g : ℂ → ℂ := fun z => (t : ℂ) * f z
  have hsub : closedBall (0 : ℂ) t ⊆ ball 0 1 := fun z hz =>
    mem_ball_zero_iff.mpr ((mem_closedBall_zero_iff.mp hz).trans_lt ht1)
  have hg : ContinuousOn g (closedBall 0 t) :=
    (hf.continuousOn.const_mul (t : ℂ)).mono hsub
  have hgm : ∀ z ∈ ball (0 : ℂ) 1, ‖g z‖ < t := by
    intro z hz
    dsimp [g]
    rw [norm_mul, Complex.norm_real, Real.norm_eq_abs, abs_of_pos ht]
    simpa using mul_lt_mul_of_pos_left (mem_ball_zero_iff.mp (hm hz)) ht
  have hgc : MapsTo g (closedBall 0 t) (closedBall 0 t) := fun z hz =>
    mem_closedBall_zero_iff.mpr (hgm z (hsub hz)).le
  have hc : ContinuousOn (fun z => ‖mob z (g z)‖) (closedBall 0 t) := by
    apply ContinuousOn.norm
    exact (hg.sub continuousOn_id).div
      (continuousOn_const.sub (Complex.continuous_conj.continuousOn.mul hg))
      (fun z hz => mob_den (mem_ball_zero_iff.mp (hsub hz))
        ((hgm z (hsub hz)).trans ht1))
  obtain ⟨a, ha, hmin⟩ := (isCompact_closedBall (0 : ℂ) t).exists_isMinOn
    ⟨0, mem_closedBall_self ht.le⟩ hc
  refine ⟨a, mem_ball_zero_iff.mp (hsub ha), ?_⟩
  by_contra he
  have hne : a ≠ g a := fun h => he h.symm
  have hlt := scaled_strict f hf hm ht ht1 (mem_ball_zero_iff.mp (hsub ha))
    ((hgm a (hsub ha)).trans ht1) hne
  have hle := hmin (hgc ha)
  exact (not_lt_of_ge hle) hlt

lemma fixed_balance (g : ℂ → ℂ) (hg : DifferentiableOn ℂ g (ball 0 1))
    (hm : MapsTo g (ball 0 1) (ball 0 1)) {a z : ℂ}
    (ha : ‖a‖ < 1) (hz : ‖z‖ < 1) (hfix : g a = a) :
    (1 - ‖z‖ ^ 2) * ‖1 - conj a * g z‖ ^ 2 ≤
      (1 - ‖g z‖ ^ 2) * ‖1 - conj a * z‖ ^ 2 := by
  have hgz : ‖g z‖ < 1 := mem_ball_zero_iff.mp (hm (mem_ball_zero_iff.mpr hz))
  have h := schwarz_pick g hg hm ha hz
  rw [hfix] at h
  simp only [mob, norm_div] at h
  have hcross := (div_le_div_iff₀ (norm_pos_iff.mpr (mob_den ha hgz))
    (norm_pos_iff.mpr (mob_den ha hz))).mp h
  have hs : ‖g z - a‖ ^ 2 * ‖1 - conj a * z‖ ^ 2 ≤
      ‖z - a‖ ^ 2 * ‖1 - conj a * g z‖ ^ 2 := by
    simpa only [mul_pow] using (sq_le_sq₀ (by positivity) (by positivity)).mpr hcross
  have he : (1 - ‖a‖ ^ 2) *
      ((1 - ‖g z‖ ^ 2) * ‖1 - conj a * z‖ ^ 2 -
        (1 - ‖z‖ ^ 2) * ‖1 - conj a * g z‖ ^ 2) =
      ‖z - a‖ ^ 2 * ‖1 - conj a * g z‖ ^ 2 -
        ‖g z - a‖ ^ 2 * ‖1 - conj a * z‖ ^ 2 := by
    calc
      _ = (‖1 - conj a * g z‖ ^ 2 - ‖g z - a‖ ^ 2) * ‖1 - conj a * z‖ ^ 2 -
          (‖1 - conj a * z‖ ^ 2 - ‖z - a‖ ^ 2) * ‖1 - conj a * g z‖ ^ 2 := by
        rw [mob_identity a (g z), mob_identity a z]
        ring
      _ = _ := by ring
  have hpos : 0 < 1 - ‖a‖ ^ 2 := by nlinarith [norm_nonneg a]
  have hnn : 0 ≤ (1 - ‖g z‖ ^ 2) * ‖1 - conj a * z‖ ^ 2 -
      (1 - ‖z‖ ^ 2) * ‖1 - conj a * g z‖ ^ 2 :=
    nonneg_of_mul_nonneg_left (he.symm ▸ sub_nonneg.mpr hs) hpos
  linarith

lemma wolff_point (f : ℂ → ℂ) (hf : DifferentiableOn ℂ f (ball 0 1))
    (hm : MapsTo f (ball 0 1) (ball 0 1))
    (hfix : ∀ z ∈ ball (0 : ℂ) 1, f z ≠ z) :
    ∃ w : ℂ, ‖w‖ = 1 ∧ ∀ z : ℂ, ‖z‖ < 1 →
      (1 - ‖z‖ ^ 2) * ‖1 - conj w * f z‖ ^ 2 ≤
        (1 - ‖f z‖ ^ 2) * ‖1 - conj w * z‖ ^ 2 := by
  let t : ℕ → ℝ := fun n => 1 - 1 / ((n : ℝ) + 2)
  have ht : ∀ n, 0 < t n ∧ t n < 1 := by
    intro n
    have hn : 0 ≤ (n : ℝ) := Nat.cast_nonneg n
    have hp : 0 < (n : ℝ) + 2 := by linarith
    have h1 : 1 / ((n : ℝ) + 2) < 1 := (div_lt_one hp).mpr (by linarith)
    have h0 : 0 < 1 / ((n : ℝ) + 2) := by positivity
    dsimp [t]
    constructor <;> linarith
  have htlim : Tendsto t atTop (𝓝 1) := by
    have hden : Tendsto (fun n : ℕ => (n : ℝ) + 2) atTop atTop :=
      tendsto_natCast_atTop_atTop.atTop_add_const_right 2
    simpa [t] using tendsto_const_nhds.sub (hden.const_div_atTop 1)
  choose c hc hceq using fun n => scaled_fixed f hf hm (ht n).1 (ht n).2
  obtain ⟨w, hw, φ, hφ, hlim⟩ := (isCompact_closedBall (0 : ℂ) 1).tendsto_subseq
    (fun n => mem_closedBall_zero_iff.mpr (hc n).le)
  have hwl : ‖w‖ ≤ 1 := mem_closedBall_zero_iff.mp hw
  have htl := htlim.comp hφ.tendsto_atTop
  have htC : Tendsto (fun n => (t (φ n) : ℂ)) atTop (𝓝 (1 : ℂ)) :=
    Complex.continuous_ofReal.continuousAt.tendsto.comp htl
  have hw1 : ‖w‖ = 1 := by
    apply le_antisymm hwl
    by_contra! hwlt
    have hwb : w ∈ ball (0 : ℂ) 1 := mem_ball_zero_iff.mpr hwlt
    have hfc := (hf.continuousOn.continuousAt (isOpen_ball.mem_nhds hwb)).tendsto.comp hlim
    have hprod := htC.mul hfc
    have heq : (fun n => (t (φ n) : ℂ) * f (c (φ n))) = (fun n => c (φ n)) :=
      funext (fun n => hceq (φ n))
    rw [heq] at hprod
    exact hfix w hwb (by simpa using tendsto_nhds_unique hprod hlim)
  refine ⟨w, hw1, fun z hz => ?_⟩
  have hcn : Tendsto (fun n => conj (c (φ n))) atTop (𝓝 (conj w)) :=
    Complex.continuous_conj.continuousAt.tendsto.comp hlim
  have hgz : Tendsto (fun n => (t (φ n) : ℂ) * f z) atTop (𝓝 (f z)) := by
    simpa only [one_mul] using htC.mul_const (f z)
  have hleft := (tendsto_const_nhds.sub (hcn.mul hgz)).norm.pow 2
  have hright := (tendsto_const_nhds.sub hcn.mul_const z).norm.pow 2
  apply le_of_tendsto_of_tendsto (hleft.const_mul (1 - ‖z‖ ^ 2))
    ((tendsto_const_nhds.sub (hgz.norm.pow 2)).mul hright)
  apply Filter.Eventually.of_forall
  intro n
  let g : ℂ → ℂ := fun z => (t (φ n) : ℂ) * f z
  have hgm : MapsTo g (ball 0 1) (ball 0 1) := by
    intro v hv
    apply mem_ball_zero_iff.mpr
    change ‖(t (φ n) : ℂ) * f v‖ < 1
    rw [norm_mul, Complex.norm_real, Real.norm_eq_abs, abs_of_pos (ht (φ n)).1]
    have hfv : ‖f v‖ < 1 := mem_ball_zero_iff.mp (hm hv)
    nlinarith [norm_nonneg (f v), (ht (φ n)).1, (ht (φ n)).2]
  exact fixed_balance g (hf.const_mul _) hgm (hc (φ n)) hz (hceq (φ n))

end Problem5Proof
