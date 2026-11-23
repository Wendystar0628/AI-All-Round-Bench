import Mathlib.Analysis.Calculus.ContDiff.Deriv
import Mathlib.Analysis.Calculus.Deriv.Abs
import Mathlib.Analysis.Calculus.Deriv.Mul
import Mathlib.Analysis.Calculus.LocalExtr.Basic
import Mathlib.MeasureTheory.Integral.IntervalIntegral.FundThmCalculus
import Mathlib.MeasureTheory.Integral.IntervalIntegral.Basic
import Mathlib.Topology.Order.Compact
import Mathlib.Tactic.Linarith
import Mathlib.Tactic.NormNum
import Mathlib.Tactic.Positivity
import Mathlib.Tactic.Ring

open Set Filter MeasureTheory
open scoped Interval

theorem problem1 (q u : ℝ → ℝ) (a b : ℝ) (hab : a < b)
    (hq : ContinuousOn q (Set.Icc a b)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Set.Ioo a b, deriv (deriv u) x + q x * u x = 0)
    (ha : u a = 0) (hb : u b = 0) (hne : ∃ x ∈ Set.Ioo a b, u x ≠ 0) :
    4 < (b - a) * ∫ x in a..b, |q x| := by
  have hu_diff : Differentiable ℝ u := hu.differentiable (by norm_num)
  have hdu_diff : Differentiable ℝ (deriv u) := hu.differentiable_deriv_two
  have hu_cont : Continuous u := hu.continuous
  have hdu_cont : Continuous (deriv u) := hu.continuous_deriv (by norm_num)
  have hdu_cd : ContDiff ℝ 1 (deriv u) := by simpa using hu.deriv'
  have hddu_cont : Continuous (deriv (deriv u)) := hdu_cd.continuous_deriv (by norm_num)
  have hode_closed : ∀ x ∈ Set.Icc a b, deriv (deriv u) x + q x * u x = 0 := by
    have heq : Set.EqOn (fun x ↦ deriv (deriv u) x + q x * u x) (fun _ ↦ 0)
        (Set.Ioo a b) := fun x hx ↦ hode x hx
    apply heq.of_subset_closure
      (hddu_cont.continuousOn.add (hq.mul hu_cont.continuousOn)) continuousOn_const
      Set.Ioo_subset_Icc_self
    rw [closure_Ioo hab.ne]
  obtain ⟨c, hc, hmax⟩ := isCompact_Icc.exists_isMaxOn
    (Set.nonempty_Icc.mpr hab.le) hu_cont.abs.continuousOn
  obtain ⟨x₀, hx₀, hux₀⟩ := hne
  have hx₀' : x₀ ∈ Set.Icc a b := ⟨hx₀.1.le, hx₀.2.le⟩
  have hMpos : 0 < |u c| := lt_of_lt_of_le (abs_pos.mpr hux₀) (hmax hx₀')
  have huc0 : u c ≠ 0 := abs_pos.mp hMpos
  have hac : a < c := by
    rcases hc.1.eq_or_lt with h | h
    · subst c
      simp [ha] at hMpos
    · exact h
  have hcb : c < b := by
    rcases hc.2.eq_or_lt with h | h
    · subst c
      simp [hb] at hMpos
    · exact h
  have hdu_c : deriv u c = 0 := by
    have hlocal : IsLocalMax (fun x ↦ |u x|) c :=
      hmax.isLocalMax (Icc_mem_nhds hac hcb)
    rcases lt_or_gt_of_ne huc0 with hneg | hpos
    · have hd := (hasDerivAt_abs_neg hneg).comp c (hu_diff c).hasDerivAt
      have := hlocal.hasDerivAt_eq_zero hd
      simpa using this
    · have hd := (hasDerivAt_abs_pos hpos).comp c (hu_diff c).hasDerivAt
      have := hlocal.hasDerivAt_eq_zero hd
      simpa using this
  have hu_bound : ∀ x ∈ Set.Icc a b, |u x| ≤ |u c| := fun x hx ↦ hmax hx
  have hleft_id : ∫ x in a..c, (x - a) * q x * u x = u c := by
    let F : ℝ → ℝ := fun x ↦ (x - a) * deriv u x - u x
    have hFderiv : ∀ x, HasDerivAt F ((x - a) * deriv (deriv u) x) x := by
      intro x
      convert (((hasDerivAt_id x).sub_const a).mul (hdu_diff x).hasDerivAt).sub
        (hu_diff x).hasDerivAt using 1
      · funext y
        simp [F]
      · simp
    have hint : IntervalIntegrable (fun x ↦ (x - a) * deriv (deriv u) x)
        volume a c :=
      ((continuous_id.sub continuous_const).mul hddu_cont).intervalIntegrable _ _
    have hFTC := intervalIntegral.integral_eq_sub_of_hasDerivAt
      (fun x _ ↦ hFderiv x) hint
    have hreplace :
        (∫ x in a..c, (x - a) * q x * u x) =
          -∫ x in a..c, (x - a) * deriv (deriv u) x := by
      rw [← intervalIntegral.integral_neg]
      apply intervalIntegral.integral_congr
      intro x hx
      have hxac : x ∈ Set.Icc a c := by simpa [uIcc_of_le hac.le] using hx
      have ho := hode_closed x ⟨hxac.1, hxac.2.trans hcb.le⟩
      dsimp
      calc
        (x - a) * q x * u x = (x - a) * (q x * u x) := by ring
        _ = (x - a) * (-deriv (deriv u) x) := by rw [show q x * u x = -deriv (deriv u) x by linarith]
        _ = -((x - a) * deriv (deriv u) x) := by ring
    rw [hreplace, hFTC]
    simp [F, hdu_c, ha]
  have hright_id : ∫ x in c..b, (b - x) * q x * u x = u c := by
    let F : ℝ → ℝ := fun x ↦ (b - x) * deriv u x + u x
    have hFderiv : ∀ x, HasDerivAt F ((b - x) * deriv (deriv u) x) x := by
      intro x
      convert (((hasDerivAt_const x b).sub (hasDerivAt_id x)).mul
        (hdu_diff x).hasDerivAt).add (hu_diff x).hasDerivAt using 1
      · funext y
        simp [F]
      · simp
    have hint : IntervalIntegrable (fun x ↦ (b - x) * deriv (deriv u) x)
        volume c b :=
      ((continuous_const.sub continuous_id).mul hddu_cont).intervalIntegrable _ _
    have hFTC := intervalIntegral.integral_eq_sub_of_hasDerivAt
      (fun x _ ↦ hFderiv x) hint
    have hreplace :
        (∫ x in c..b, (b - x) * q x * u x) =
          -∫ x in c..b, (b - x) * deriv (deriv u) x := by
      rw [← intervalIntegral.integral_neg]
      apply intervalIntegral.integral_congr
      intro x hx
      have hxcb : x ∈ Set.Icc c b := by simpa [uIcc_of_le hcb.le] using hx
      have ho := hode_closed x ⟨hac.le.trans hxcb.1, hxcb.2⟩
      dsimp
      calc
        (b - x) * q x * u x = (b - x) * (q x * u x) := by ring
        _ = (b - x) * (-deriv (deriv u) x) := by rw [show q x * u x = -deriv (deriv u) x by linarith]
        _ = -((b - x) * deriv (deriv u) x) := by ring
    rw [hreplace, hFTC]
    simp [F, hdu_c, hb]
  have hq_left : ContinuousOn q (Set.Icc a c) :=
    hq.mono (fun _ hx ↦ ⟨hx.1, hx.2.trans hcb.le⟩)
  have hq_right : ContinuousOn q (Set.Icc c b) :=
    hq.mono (fun _ hx ↦ ⟨hac.le.trans hx.1, hx.2⟩)
  let fL : ℝ → ℝ := fun x ↦ |(x - a) * q x * u x|
  let gL : ℝ → ℝ := fun x ↦ (c - a) * |u c| * |q x|
  have hfL_cont : ContinuousOn fL (Set.Icc a c) := by
    exact (((continuousOn_id.sub continuousOn_const).mul hq_left).mul
      hu_cont.continuousOn).abs
  have hgL_cont : ContinuousOn gL (Set.Icc a c) := by
    exact (continuousOn_const.mul continuousOn_const).mul hq_left.abs
  have hfL_le : ∀ x ∈ Set.Ioc a c, fL x ≤ gL x := by
    intro x hx
    have hxu : |u x| ≤ |u c| := hu_bound x ⟨hx.1.le, hx.2.trans hcb.le⟩
    have hxnonneg : 0 ≤ x - a := sub_nonneg.mpr hx.1.le
    have hqnonneg : 0 ≤ |q x| := abs_nonneg _
    dsimp [fL, gL]
    rw [abs_mul, abs_mul, abs_of_nonneg hxnonneg]
    have hw : x - a ≤ c - a := sub_le_sub_right hx.2 a
    have h₁ : (x - a) * |q x| * |u x| ≤ (x - a) * |q x| * |u c| := by
      gcongr
    have h₂ : (x - a) * |q x| * |u c| ≤ (c - a) * |q x| * |u c| := by
      gcongr
    exact h₁.trans (by simpa [mul_assoc, mul_comm, mul_left_comm] using h₂)
  have hfL_lt : ∃ x ∈ Set.Icc a c, fL x < gL x := by
    by_contra hn
    push_neg at hn
    have hqzero : ∀ x ∈ Set.Ioo a c, q x = 0 := by
      intro x hx
      by_contra hqx
      have hqpos : 0 < |q x| := abs_pos.mpr hqx
      have hxu : |u x| ≤ |u c| := hu_bound x
        ⟨hx.1.le, hx.2.le.trans hcb.le⟩
      have hxpos : 0 < x - a := sub_pos.mpr hx.1
      have hxc : x - a < c - a := sub_lt_sub_right hx.2 a
      have h₁ : (x - a) * |q x| * |u x| ≤ (x - a) * |q x| * |u c| := by
        gcongr
      have h₂ : (x - a) * |q x| * |u c| < (c - a) * |q x| * |u c| := by
        exact mul_lt_mul_of_pos_right
          (mul_lt_mul_of_pos_right hxc hqpos) hMpos
      have hstrict : fL x < gL x := by
        dsimp [fL, gL]
        rw [abs_mul, abs_mul, abs_of_pos hxpos]
        exact h₁.trans_lt (by simpa [mul_assoc, mul_comm, mul_left_comm] using h₂)
      exact (not_lt_of_ge (hn x ⟨hx.1.le, hx.2.le⟩)) hstrict
    have hqzero_closed : ∀ x ∈ Set.Icc a c, q x = 0 := by
      have heq : Set.EqOn q (fun _ ↦ 0) (Set.Ioo a c) := hqzero
      apply heq.of_subset_closure hq_left continuousOn_const Set.Ioo_subset_Icc_self
      rw [closure_Ioo hac.ne]
    have hzint : ∫ x in a..c, (x - a) * q x * u x = 0 := by
      calc
        (∫ x in a..c, (x - a) * q x * u x) = ∫ _ in a..c, (0 : ℝ) := by
          apply intervalIntegral.integral_congr
          intro x hx
          have hxac : x ∈ Set.Icc a c := by simpa [uIcc_of_le hac.le] using hx
          change (x - a) * q x * u x = 0
          rw [hqzero_closed x hxac]
          ring
        _ = 0 := by simp
    rw [hleft_id] at hzint
    exact huc0 hzint
  have hleft_strict :
      |u c| < (c - a) * |u c| * ∫ x in a..c, |q x| := by
    calc
      |u c| = |∫ x in a..c, (x - a) * q x * u x| := by rw [hleft_id]
      _ ≤ ∫ x in a..c, fL x := by
        simpa [fL] using (intervalIntegral.abs_integral_le_integral_abs (f :=
          fun x ↦ (x - a) * q x * u x) hac.le)
      _ < ∫ x in a..c, gL x :=
        intervalIntegral.integral_lt_integral_of_continuousOn_of_le_of_exists_lt
          hac hfL_cont hgL_cont hfL_le hfL_lt
      _ = (c - a) * |u c| * ∫ x in a..c, |q x| := by
        simp [gL, intervalIntegral.integral_const_mul, mul_assoc]
  let fR : ℝ → ℝ := fun x ↦ |(b - x) * q x * u x|
  let gR : ℝ → ℝ := fun x ↦ (b - c) * |u c| * |q x|
  have hfR_cont : ContinuousOn fR (Set.Icc c b) := by
    exact (((continuousOn_const.sub continuousOn_id).mul hq_right).mul
      hu_cont.continuousOn).abs
  have hgR_cont : ContinuousOn gR (Set.Icc c b) := by
    exact (continuousOn_const.mul continuousOn_const).mul hq_right.abs
  have hfR_le : ∀ x ∈ Set.Ioc c b, fR x ≤ gR x := by
    intro x hx
    have hxu : |u x| ≤ |u c| := hu_bound x ⟨hac.le.trans hx.1.le, hx.2⟩
    have hxnonneg : 0 ≤ b - x := sub_nonneg.mpr hx.2
    have hqnonneg : 0 ≤ |q x| := abs_nonneg _
    dsimp [fR, gR]
    rw [abs_mul, abs_mul, abs_of_nonneg hxnonneg]
    have hw : b - x ≤ b - c := sub_le_sub_left hx.1.le b
    have h₁ : (b - x) * |q x| * |u x| ≤ (b - x) * |q x| * |u c| := by
      gcongr
    have h₂ : (b - x) * |q x| * |u c| ≤ (b - c) * |q x| * |u c| := by
      gcongr
    exact h₁.trans (by simpa [mul_assoc, mul_comm, mul_left_comm] using h₂)
  have hright_weak :
      |u c| ≤ (b - c) * |u c| * ∫ x in c..b, |q x| := by
    calc
      |u c| = |∫ x in c..b, (b - x) * q x * u x| := by rw [hright_id]
      _ ≤ ∫ x in c..b, fR x := by
        simpa [fR] using (intervalIntegral.abs_integral_le_integral_abs (f :=
          fun x ↦ (b - x) * q x * u x) hcb.le)
      _ ≤ ∫ x in c..b, gR x := by
        apply intervalIntegral.integral_mono_on_of_le_Ioo hcb.le
          (hfR_cont.intervalIntegrable_of_Icc hcb.le)
          (hgR_cont.intervalIntegrable_of_Icc hcb.le)
        intro x hx
        exact hfR_le x ⟨hx.1, hx.2.le⟩
      _ = (b - c) * |u c| * ∫ x in c..b, |q x| := by
        simp [gR, intervalIntegral.integral_const_mul, mul_assoc]
  let A : ℝ := ∫ x in a..c, |q x|
  let B : ℝ := ∫ x in c..b, |q x|
  have hLA : 1 < (c - a) * A := by
    have hm : |u c| * 1 < |u c| * ((c - a) * A) := by
      simpa [A, mul_assoc, mul_comm, mul_left_comm] using hleft_strict
    exact lt_of_mul_lt_mul_left hm hMpos.le
  have hRB : 1 ≤ (b - c) * B := by
    have hm : |u c| * 1 ≤ |u c| * ((b - c) * B) := by
      simpa [B, mul_assoc, mul_comm, mul_left_comm] using hright_weak
    exact le_of_mul_le_mul_left hm hMpos
  let X : ℝ := c - a
  let Y : ℝ := b - c
  have hX : 0 < X := by simpa [X] using sub_pos.mpr hac
  have hY : 0 < Y := by simpa [Y] using sub_pos.mpr hcb
  have hAinv : 1 / X < A := by
    apply (div_lt_iff₀ hX).2
    simpa [X, mul_comm] using hLA
  have hBinv : 1 / Y ≤ B := by
    apply (div_le_iff₀ hY).2
    simpa [Y, mul_comm] using hRB
  have hsumInv : 1 / X + 1 / Y < A + B := add_lt_add_of_lt_of_le hAinv hBinv
  have hharmonic : 4 ≤ (X + Y) * (1 / X + 1 / Y) := by
    have hXY : 0 < X * Y := mul_pos hX hY
    have hfrac : 1 / X + 1 / Y = (X + Y) / (X * Y) := by
      field_simp
      ring
    rw [hfrac]
    have heq : (X + Y) * ((X + Y) / (X * Y)) =
        ((X + Y) * (X + Y)) / (X * Y) := by ring
    rw [heq]
    apply (le_div_iff₀ hXY).2
    nlinarith [sq_nonneg (X - Y)]
  have hmain : 4 < (X + Y) * (A + B) :=
    hharmonic.trans_lt (mul_lt_mul_of_pos_left hsumInv (add_pos hX hY))
  have hqabs_int : IntervalIntegrable (fun x ↦ |q x|) volume a b :=
    hq.abs.intervalIntegrable_of_Icc hab.le
  have hqabs_left : IntervalIntegrable (fun x ↦ |q x|) volume a c :=
    hq_left.abs.intervalIntegrable_of_Icc hac.le
  have hqabs_right : IntervalIntegrable (fun x ↦ |q x|) volume c b :=
    hq_right.abs.intervalIntegrable_of_Icc hcb.le
  have hsum : A + B = ∫ x in a..b, |q x| := by
    exact intervalIntegral.integral_add_adjacent_intervals hqabs_left hqabs_right
  have hlength : X + Y = b - a := by
    dsimp [X, Y]
    ring
  rw [hlength, hsum] at hmain
  exact hmain

#print axioms problem1

