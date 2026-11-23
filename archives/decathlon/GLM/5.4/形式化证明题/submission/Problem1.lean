import Mathlib.Analysis.Calculus.LocalExtr.Basic
import Mathlib.Analysis.Calculus.ContDiff.Deriv
import Mathlib.MeasureTheory.Integral.IntervalIntegral.IntegrationByParts

open scoped Topology
open Set MeasureTheory intervalIntegral Filter

/-- If `p` holds on the open interval `(a, c)`, then it holds almost everywhere on `(a, c]`. -/
theorem ae_of_mem_Ioo {a c : ℝ} {p : ℝ → Prop} (h : ∀ x ∈ Ioo a c, p x) :
    ∀ᵐ x ∂volume, x ∈ Ioc a c → p x := by
  refine Eventually.mono (MeasureTheory.ae_iff.mpr ?_) fun x hx hmem =>
    h x ⟨hmem.1, lt_of_le_of_ne hmem.2 hx⟩
  simp

/-- If `a < c` then `(c, a]` is empty. -/
theorem ae_of_empty {a c : ℝ} (hac : a < c) {p : ℝ → Prop} :
  -- `hac` is used implicitly

    ∀ᵐ x ∂volume, x ∈ Ioc c a → p x := by
  have hE : (Ioc c a : Set ℝ) = ∅ := Ioc_eq_empty (not_lt.mpr hac.le)
  refine Eventually.of_forall fun x hx => ?_
  exact absurd (hE ▸ hx) (Set.notMem_empty x)

/-- A nonnegative continuous function on `Icc a c` with zero integral vanishes on `Ioo a c`. -/
theorem integral_eq_zero_of_nonneg_cont {a c : ℝ} {w : ℝ → ℝ} (hac : a < c)
    (hw : ContinuousOn w (Icc a c)) (hw0 : ∀ x ∈ Icc a c, 0 ≤ w x)
    (hint : ∫ x in a..c, w x = 0) : ∀ x ∈ Ioo a c, w x = 0 := by
  have hsub : ∀ x ∈ Icc a c, Set.uIcc a x ⊆ Icc a c ∧ Set.uIcc x c ⊆ Icc a c := by
    intro x hx
    refine ⟨fun y hy => ?_, fun y hy => ?_⟩
    · have hy' := Set.mem_Icc.mp ((Set.uIcc_of_le hx.1) ▸ hy)
      exact ⟨hy'.1, hy'.2.trans hx.2⟩
    · have hy' := Set.mem_Icc.mp ((Set.uIcc_of_le hx.2) ▸ hy)
      exact ⟨hx.1.trans hy'.1, hy'.2⟩
  have hW : ∀ x ∈ Icc a c, ∫ t in a..x, w t = 0 := by
    intro x hx
    have h1 : IntervalIntegrable w volume a x := (hw.mono (hsub x hx).1).intervalIntegrable (μ := volume)
    have h2 : IntervalIntegrable w volume x c := (hw.mono (hsub x hx).2).intervalIntegrable (μ := volume)
    have hadd : (∫ t in a..x, w t) + ∫ t in x..c, w t = ∫ t in a..c, w t :=
      intervalIntegral.integral_add_adjacent_intervals (μ := volume) (f := w) h1 h2
    have h3 : 0 ≤ ∫ t in x..c, w t :=
      intervalIntegral.integral_nonneg hx.2 (fun y hy => hw0 y ⟨hx.1.trans hy.1, hy.2⟩)
    have h4 : 0 ≤ ∫ t in a..x, w t :=
      intervalIntegral.integral_nonneg hx.1 (fun y hy => hw0 y ⟨hy.1, hy.2.trans hx.2⟩)
    rw [hint] at hadd
    linarith
  have hsm : ∀ x ∈ Ioo a c, StronglyMeasurableAtFilter w (𝓝 x) volume :=
    ContinuousAt.stronglyMeasurableAtFilter isOpen_Ioo
      (fun x hx => hw.continuousAt (Icc_mem_nhds hx.1 hx.2))
  intro x hx
  have hx' : x ∈ Icc a c := ⟨hx.1.le, hx.2.le⟩
  have hI : IntervalIntegrable w volume a x :=
    (hw.mono (hsub x hx').1).intervalIntegrable (μ := volume)
  have h1 : HasDerivAt (fun y => ∫ t in a..y, w t) (w x) x :=
    intervalIntegral.integral_hasDerivAt_right hI (hsm x hx)
      (hw.continuousAt (Icc_mem_nhds hx.1 hx.2))
  have h2 : HasDerivAt (fun y => ∫ t in a..y, w t) 0 x :=
    (hasDerivAt_const x (0 : ℝ)).congr_of_eventuallyEq
      (Eventually.mono (Icc_mem_nhds hx.1 hx.2) (fun y hy => hW y hy))
  exact h1.unique h2

/-- Purely algebraic part of Lyapunov's inequality. -/
theorem lyap_alg {A B P R S T v : ℝ} (hA : 1 ≤ A) (hB : 1 ≤ B) (hAP : A ≤ P) (hBR : B ≤ R)
    (hST : 2 ≤ S + T) (hv : v = P + R + S + T) : 4 ≤ v := by
  subst hv
  linarith

theorem lyap_alg2 {x y Q1 Q2 : ℝ} (hx : 0 < x) (hy : 0 < y) (hQ1 : 0 ≤ Q1) (hQ2 : 0 ≤ Q2)
    (hP : 1 ≤ x * Q1) (hR : 1 ≤ y * Q2) : 2 ≤ x * Q2 + y * Q1 := by
  have hS : x ≤ (x * Q2) * y := by
    have : x * 1 ≤ x * (y * Q2) := mul_le_mul_of_nonneg_left hR hx.le
    nlinarith [this]
  have hT : y ≤ (y * Q1) * x := by
    have : y * 1 ≤ y * (x * Q1) := mul_le_mul_of_nonneg_left hP hy.le
    nlinarith [this]
  have hST : 1 ≤ (x * Q2) * (y * Q1) := by
    have h1 : x * y ≤ ((x * Q2) * y) * ((y * Q1) * x) :=
      mul_le_mul hS hT hy.le (mul_nonneg (mul_nonneg hx.le hQ2) hy.le)
    have h2 : 1 * (x * y) ≤ ((x * Q2) * (y * Q1)) * (x * y) := by nlinarith [h1]
    exact le_of_mul_le_mul_right h2 (mul_pos hx hy)
  have h1 : (2:ℝ) ^ 2 ≤ ((x * Q2) + (y * Q1)) ^ 2 := by
    nlinarith [sq_nonneg ((x * Q2) - (y * Q1))]
  exact le_of_sq_le_sq h1 (by positivity)

theorem lyap_alg_eq {A B P R S T v : ℝ} (hA : 1 ≤ A) (hB : 1 ≤ B) (hAP : A ≤ P) (hBR : B ≤ R)
    (hST : 2 ≤ S + T) (hv : v = P + R + S + T) (hvle : v ≤ 4) : A = P ∧ B = R := by
  subst hv
  constructor <;> linarith

theorem problem1 (q u : ℝ → ℝ) (a b : ℝ) (hab : a < b)
    (hq : ContinuousOn q (Set.Icc a b)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Set.Ioo a b, deriv (deriv u) x + q x * u x = 0)
    (ha : u a = 0) (hb : u b = 0) (hne : ∃ x ∈ Set.Ioo a b, u x ≠ 0) :
    4 < (b - a) * ∫ x in a..b, |q x| := by
  obtain ⟨x₀, hx₀, hx₀ne⟩ := hne
  have huC : Continuous u := hu.continuous
  have hu' : Continuous (deriv u) := hu.continuous_deriv (by norm_num)
  have hu'' : Continuous (deriv (deriv u)) := hu.deriv' (n := 1) |>.continuous_deriv (by norm_num)
  have hu'diff : Differentiable ℝ (deriv u) := hu.differentiable_deriv_two
  have hudiff : ∀ x, DifferentiableAt ℝ u x := fun x => hu.differentiable (by norm_num) x
  -- the maximum point of |u|
  obtain ⟨c, hcmem, hcmax⟩ := isCompact_Icc.exists_isMaxOn
    (s := Icc a b) ⟨x₀, hx₀.1.le, hx₀.2.le⟩ huC.abs.continuousOn
  have hcmax' : ∀ y ∈ Icc a b, |u y| ≤ |u c| := isMaxOn_iff.mp hcmax
  have hMpos : 0 < |u c| :=
    lt_of_lt_of_le (abs_pos.mpr hx₀ne) (hcmax' x₀ ⟨hx₀.1.le, hx₀.2.le⟩)
  have hc1 : a < c := lt_of_le_of_ne hcmem.1 (fun h => hMpos.ne' (by rw [← h, ha]; simp))
  have hc2 : c < b := lt_of_le_of_ne hcmem.2 (fun h => hMpos.ne' (by rw [h, hb]; simp))
  have hu'c : deriv u c = 0 := by
    have hIcc : Icc a b ∈ 𝓝 c := Icc_mem_nhds hc1 hc2
    rcases le_or_gt 0 (u c) with h | h
    · have hmaxu : IsMaxOn u (Icc a b) c :=
        isMaxOn_iff.mpr fun y hy =>
          (le_abs_self (u y)).trans ((hcmax' y hy).trans_eq (abs_of_nonneg h))
      exact (show IsLocalMax u c from hmaxu.filter_mono (le_principal_iff.mpr hIcc)).deriv_eq_zero
    · have hminu : IsMinOn u (Icc a b) c :=
        isMinOn_iff.mpr fun y hy =>
          (show u c = -|u c| by rw [abs_of_neg h]; ring).le.trans
            (neg_le_of_abs_le (hcmax' y hy))
      exact (show IsLocalMin u c from hminu.filter_mono (le_principal_iff.mpr hIcc)).deriv_eq_zero
  -- continuity facts on subintervals
  have hqc : ContinuousOn q (Icc a c) := hq.mono (Icc_subset_Icc (le_refl a) hcmem.2)
  have hqc2 : ContinuousOn q (Icc c b) := hq.mono (Icc_subset_Icc hcmem.1 (le_refl b))
  have hqabsC : ContinuousOn (fun x => |q x|) (Icc a b) := hq.abs
  have hmemIL : ∀ x, x ∈ Set.uIcc a c → x ∈ Set.Icc a c :=
    fun x hx => (Set.uIcc_of_le hc1.le) ▸ hx
  have hmemIR : ∀ x, x ∈ Set.uIcc c b → x ∈ Set.Icc c b :=
    fun x hx => (Set.uIcc_of_le hc2.le) ▸ hx
  -- the ODE, multiplied by the weights
  have hodeL : ∀ x ∈ Ioo a c, (x - a) * q x * u x = -((x - a) * deriv (deriv u) x) := by
    intro x hx
    have h := hode x ⟨hx.1, lt_of_lt_of_le hx.2 hcmem.2⟩
    have h' : q x * u x = -deriv (deriv u) x := by linarith [h]
    rw [mul_assoc, h', mul_neg]
  have hodeR : ∀ x ∈ Ioo c b, (b - x) * q x * u x = -((b - x) * deriv (deriv u) x) := by
    intro x hx
    have h := hode x ⟨lt_trans hc1 hx.1, hx.2⟩
    have h' : q x * u x = -deriv (deriv u) x := by linarith [h]
    rw [mul_assoc, h', mul_neg]
  -- integration by parts on the left
  have hIBPL : ∫ x in a..c, ((1:ℝ) * deriv u x + (x - a) * deriv (deriv u) x)
      = (c - a) * deriv u c - (a - a) * deriv u a :=
    intervalIntegral.integral_deriv_mul_eq_sub_of_hasDerivAt
      (u := fun x => x - a) (v := deriv u) (u' := fun _ => (1:ℝ)) (v' := deriv (deriv u))
      (by fun_prop) hu'.continuousOn
      (fun x _ => (hasDerivAt_id x).sub_const a)
      (fun x _ => hu'diff x |>.hasDerivAt)
      intervalIntegrable_const (hu''.intervalIntegrable _ _)
  have hftcL : ∫ x in a..c, deriv u x = u c - u a :=
    intervalIntegral.integral_deriv_eq_sub (fun x _ => hudiff x) (hu'.intervalIntegrable _ _)
  have hu''facL : ContinuousOn (fun x => (x - a) * deriv (deriv u) x) (Icc a c) :=
    (continuous_id.sub continuous_const).continuousOn.mul hu''.continuousOn
  have hu''facR : ContinuousOn (fun x => (b - x) * deriv (deriv u) x) (Icc c b) :=
    (continuous_const.sub continuous_id).continuousOn.mul hu''.continuousOn
  have hIBPL2 : ∫ x in a..c, (x - a) * deriv (deriv u) x = -(∫ x in a..c, (1:ℝ) * deriv u x) := by
    rw [show (c - a) * deriv u c - (a - a) * deriv u a = 0 from by rw [hu'c]; ring] at hIBPL
    have hsplit : ∫ x in a..c, ((1:ℝ) * deriv u x + (x - a) * deriv (deriv u) x)
        = (∫ x in a..c, (1:ℝ) * deriv u x) + ∫ x in a..c, (x - a) * deriv (deriv u) x :=
      intervalIntegral.integral_add
        ((continuousOn_const.mul hu'.continuousOn).mono hmemIL).intervalIntegrable (μ := volume)
        ((hu''facL.mono hmemIL).intervalIntegrable (μ := volume))
    rw [hsplit] at hIBPL
    linarith [hIBPL]
  have hkeyL : ∫ x in a..c, (x - a) * q x * u x = u c := by
    rw [integral_congr_ae' (ae_of_mem_Ioo hodeL) (ae_of_empty hc1), intervalIntegral.integral_neg, hIBPL2,
      neg_neg, integral_congr (fun x _ => one_mul (deriv u x)), hftcL, ha]
    ring
  -- integration by parts on the right
  have hIBPR : ∫ x in c..b, ((-1:ℝ) * deriv u x + (b - x) * deriv (deriv u) x)
      = (b - b) * deriv u b - (b - c) * deriv u c :=
    intervalIntegral.integral_deriv_mul_eq_sub_of_hasDerivAt
      (u := fun x => b - x) (v := deriv u) (u' := fun _ => (-1:ℝ)) (v' := deriv (deriv u))
      (by fun_prop) hu'.continuousOn
      (fun x _ => (hasDerivAt_id x).const_sub b)
      (fun x _ => hu'diff x |>.hasDerivAt)
      intervalIntegrable_const (hu''.intervalIntegrable _ _)
  have hftcR : ∫ x in c..b, deriv u x = u b - u c :=
    intervalIntegral.integral_deriv_eq_sub (fun x _ => hudiff x) (hu'.intervalIntegrable _ _)
  have hIBPR2 : ∫ x in c..b, (b - x) * deriv (deriv u) x = -(∫ x in c..b, (-1:ℝ) * deriv u x) := by
    rw [show (b - b) * deriv u b - (b - c) * deriv u c = 0 from by rw [hu'c]; ring] at hIBPR
    have hsplit : ∫ x in c..b, ((-1:ℝ) * deriv u x + (b - x) * deriv (deriv u) x)
        = (∫ x in c..b, (-1:ℝ) * deriv u x) + ∫ x in c..b, (b - x) * deriv (deriv u) x :=
      intervalIntegral.integral_add
        ((continuousOn_const.mul hu'.continuousOn).mono hmemIR).intervalIntegrable (μ := volume)
        ((hu''facR.mono hmemIR).intervalIntegrable (μ := volume))
    rw [hsplit] at hIBPR
    linarith [hIBPR]
  have hkeyR : ∫ x in c..b, (b - x) * q x * u x = u c := by
    rw [integral_congr_ae' (ae_of_mem_Ioo hodeR) (ae_of_empty hc2), intervalIntegral.integral_neg, hIBPR2,
      neg_neg, integral_congr (fun x _ => neg_one_mul (deriv u x)), intervalIntegral.integral_neg, hftcR, hb]
    ring
  -- estimates
  have hfacL : ContinuousOn (fun x => (x - a) * |q x| * |u x|) (Icc a c) :=
    ((continuous_id.sub continuous_const).continuousOn.mul hqc.abs).mul huC.abs.continuousOn
  have hfacR : ContinuousOn (fun x => (b - x) * |q x| * |u x|) (Icc c b) :=
    ((continuous_const.sub continuous_id).continuousOn.mul hqc2.abs).mul huC.abs.continuousOn
  have hfacLc : ContinuousOn (fun x => (x - a) * |q x| * |u c|) (Icc a c) :=
    ((continuous_id.sub continuous_const).continuousOn.mul hqc.abs).mul continuous_const.continuousOn
  have hfacRc : ContinuousOn (fun x => (b - x) * |q x| * |u c|) (Icc c b) :=
    ((continuous_const.sub continuous_id).continuousOn.mul hqc2.abs).mul continuous_const.continuousOn
  have habsL : |u c| ≤ |u c| * ∫ x in a..c, (x - a) * |q x| := by
    have h1 : |∫ x in a..c, (x - a) * q x * u x| ≤ ∫ x in a..c, |(x - a) * q x * u x| :=
      abs_integral_le_integral_abs hc1.le
    rw [hkeyL] at h1
    have h2 : ∫ x in a..c, |(x - a) * q x * u x| = ∫ x in a..c, (x - a) * |q x| * |u x| := by
      refine integral_congr fun x hx => ?_
      rw [abs_mul, abs_mul, abs_of_nonneg (sub_nonneg.mpr (hmemIL x hx).1)]
    rw [h2] at h1
    have h3 : ∫ x in a..c, (x - a) * |q x| * |u x| ≤ ∫ x in a..c, (x - a) * |q x| * |u c| :=
      integral_mono_on hc1.le (hfacL.mono hmemIL).intervalIntegrable
        (hfacLc.mono hmemIL).intervalIntegrable fun x hx =>
        mul_le_mul_of_nonneg_left (hcmax' x ⟨hx.1, hx.2.trans hc2.le⟩)
          (mul_nonneg (sub_nonneg.mpr hx.1) (abs_nonneg (q x)))
    have h4 : ∫ x in a..c, (x - a) * |q x| * |u c| = |u c| * ∫ x in a..c, (x - a) * |q x| := by
      rw [← intervalIntegral.integral_const_mul]
      exact integral_congr fun x _ => by ring
    rw [h4] at h3
    linarith
  have hA : 1 ≤ ∫ x in a..c, (x - a) * |q x| :=
    le_of_mul_le_mul_left (show |u c| * 1 ≤ |u c| * ∫ x in a..c, (x - a) * |q x| by
      rw [mul_one]; exact habsL) hMpos
  have habsR : |u c| ≤ |u c| * ∫ x in c..b, (b - x) * |q x| := by
    have h1 : |∫ x in c..b, (b - x) * q x * u x| ≤ ∫ x in c..b, |(b - x) * q x * u x| :=
      abs_integral_le_integral_abs hc2.le
    rw [hkeyR] at h1
    have h2 : ∫ x in c..b, |(b - x) * q x * u x| = ∫ x in c..b, (b - x) * |q x| * |u x| := by
      refine integral_congr fun x hx => ?_
      rw [abs_mul, abs_mul, abs_of_nonneg (sub_nonneg.mpr (hmemIR x hx).2)]
    rw [h2] at h1
    have h3 : ∫ x in c..b, (b - x) * |q x| * |u x| ≤ ∫ x in c..b, (b - x) * |q x| * |u c| :=
      integral_mono_on hc2.le (hfacR.mono hmemIR).intervalIntegrable
        (hfacRc.mono hmemIR).intervalIntegrable fun x hx =>
        mul_le_mul_of_nonneg_left (hcmax' x ⟨hcmem.1.trans hx.1, hx.2⟩)
          (mul_nonneg (sub_nonneg.mpr hx.2) (abs_nonneg (q x)))
    have h4 : ∫ x in c..b, (b - x) * |q x| * |u c| = |u c| * ∫ x in c..b, (b - x) * |q x| := by
      rw [← intervalIntegral.integral_const_mul]
      exact integral_congr fun x _ => by ring
    rw [h4] at h3
    linarith
  have hB : 1 ≤ ∫ x in c..b, (b - x) * |q x| :=
    le_of_mul_le_mul_left (show |u c| * 1 ≤ |u c| * ∫ x in c..b, (b - x) * |q x| by
      rw [mul_one]; exact habsR) hMpos
  -- compare with the integrals of |q| over the subintervals
  have hfacL' : ContinuousOn (fun x => (x - a) * |q x|) (Icc a c) :=
    (continuous_id.sub continuous_const).continuousOn.mul hqc.abs
  have hfacR' : ContinuousOn (fun x => (b - x) * |q x|) (Icc c b) :=
    (continuous_const.sub continuous_id).continuousOn.mul hqc2.abs
  have hQ1 : ∫ x in a..c, (x - a) * |q x| ≤ (c - a) * ∫ x in a..c, |q x| := by
    have h1 : ∫ x in a..c, (x - a) * |q x| ≤ ∫ x in a..c, (c - a) * |q x| :=
      integral_mono_on hc1.le (hfacL'.mono hmemIL).intervalIntegrable
        ((continuousOn_const.mul hqc.abs).mono hmemIL).intervalIntegrable (μ := volume) fun x hx =>
        mul_le_mul_of_nonneg_right (sub_le_sub_right hx.2 a) (abs_nonneg (q x))
    rwa [intervalIntegral.integral_const_mul] at h1
  have hQ2 : ∫ x in c..b, (b - x) * |q x| ≤ (b - c) * ∫ x in c..b, |q x| := by
    have h1 : ∫ x in c..b, (b - x) * |q x| ≤ ∫ x in c..b, (b - c) * |q x| :=
      integral_mono_on hc2.le ((hfacR'.mono hmemIR).intervalIntegrable (μ := volume))
        (((continuousOn_const.mul hqc2.abs).mono hmemIR).intervalIntegrable (μ := volume)) fun x hx =>
        mul_le_mul_of_nonneg_right (sub_le_sub_left hx.1 b) (abs_nonneg (q x))
    rwa [intervalIntegral.integral_const_mul] at h1
  have hQ1n : 0 ≤ ∫ x in a..c, |q x| := integral_nonneg hc1.le (fun x _ => abs_nonneg _)
  have hQ2n : 0 ≤ ∫ x in c..b, |q x| := integral_nonneg hc2.le (fun x _ => abs_nonneg _)
  have hQsplit : (∫ x in a..c, |q x|) + ∫ x in c..b, |q x| = ∫ x in a..b, |q x| :=
    intervalIntegral.integral_add_adjacent_intervals
      ((hqabsC.mono (Icc_subset_Icc (le_refl a) hcmem.2) |>.mono hmemIL).intervalIntegrable
        (μ := volume))
      ((hqabsC.mono (Icc_subset_Icc hcmem.1 (le_refl b)) |>.mono hmemIR).intervalIntegrable
        (μ := volume))
  -- the algebraic core
  have hxpos : 0 < c - a := sub_pos.mpr hc1
  have hypos : 0 < b - c := sub_pos.mpr hc2
  have hP : 1 ≤ (c - a) * ∫ x in a..c, |q x| := hA.trans hQ1
  have hR : 1 ≤ (b - c) * ∫ x in c..b, |q x| := hB.trans hQ2
  have hST2 : 2 ≤ ((c - a) * ∫ x in c..b, |q x|) + ((b - c) * ∫ x in a..c, |q x|) :=
    lyap_alg2 hxpos hypos hQ1n hQ2n hP hR
  have hident : (b - a) * ((∫ x in a..c, |q x|) + ∫ x in c..b, |q x|) =
      ((c - a) * ∫ x in a..c, |q x|) + ((b - c) * ∫ x in c..b, |q x|) +
      ((c - a) * ∫ x in c..b, |q x|) + ((b - c) * ∫ x in a..c, |q x|) := by ring
  have hAP := hQ1
  have hBR := hQ2
  have hmain : 4 ≤ (b - a) * ((∫ x in a..c, |q x|) + ∫ x in c..b, |q x|) := by
    rw [hident]
    exact lyap_alg hA hB hAP hBR hST2 rfl
  -- strictness: exclude the equality case
  by_contra hcon0
  push_neg at hcon0
  have hcon : (b - a) * ((∫ x in a..c, |q x|) + ∫ x in c..b, |q x|) ≤ 4 := by
    rw [hQsplit]
    exact hcon0
  obtain ⟨hAeq, hBeq⟩ := lyap_alg_eq hA hB hAP hBR hST2 hident hcon
  -- so ∫ (c - x)|q x| = 0 on a..c
  have hzero : ∫ x in a..c, (c - x) * |q x| = 0 := by
    have h1 : ∀ x ∈ Set.uIcc a c,
        (c - x) * |q x| = (c - a) * |q x| - (x - a) * |q x| := fun x _ => by ring
    have hI1 : IntervalIntegrable (fun x => (c - a) * |q x|) volume a c :=
      ((continuousOn_const.mul hqc.abs).mono hmemIL).intervalIntegrable (μ := volume)
    have hI2 : IntervalIntegrable (fun x => (x - a) * |q x|) volume a c :=
      (hfacL'.mono hmemIL).intervalIntegrable (μ := volume)
    rw [integral_congr h1, intervalIntegral.integral_sub hI1 hI2,
      intervalIntegral.integral_const_mul, hAeq]
    ring
  have hq0 : ∀ x ∈ Ioo a c, q x = 0 := by
    intro x hx
    have h1 := integral_eq_zero_of_nonneg_cont hc1
      ((continuous_const.sub continuous_id).continuousOn.mul hqc.abs)
      (fun y hy => mul_nonneg (sub_nonneg.mpr hy.2) (abs_nonneg _)) hzero x hx
    have h2 : c - x ≠ 0 := sub_ne_zero.mpr (Ne.symm hx.2.ne)
    rcases mul_eq_zero.mp h1 with h | h
    · exact absurd h h2
    · exact abs_eq_zero.mp h
  have hzero_int : ∫ x in a..c, (x - a) * q x * u x = ∫ x in a..c, (0:ℝ) :=
    integral_congr_ae' (ae_of_mem_Ioo (fun x hx => by rw [hq0 x hx]; ring)) (ae_of_empty hc1)
  have huc : u c = 0 := by
    rw [← hkeyL, hzero_int, intervalIntegral.integral_zero]
  exact hMpos.ne' (by rw [huc]; simp)

#print axioms problem1
