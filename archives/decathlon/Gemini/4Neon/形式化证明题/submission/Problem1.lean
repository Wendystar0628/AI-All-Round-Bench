import Mathlib.MeasureTheory.Integral.IntervalIntegral.FundThmCalculus
import Mathlib.Analysis.Calculus.LocalExtr.Basic
import Mathlib.Analysis.Calculus.ContDiff.Deriv
import Mathlib.Analysis.Calculus.Deriv.Mul

open Set MeasureTheory

theorem problem1 (q u : ℝ → ℝ) (a b : ℝ) (hab : a < b)
    (hq : ContinuousOn q (Set.Icc a b)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Set.Ioo a b, deriv (deriv u) x + q x * u x = 0)
    (ha : u a = 0) (hb : u b = 0) (hne : ∃ x ∈ Set.Ioo a b, u x ≠ 0) :
    4 < (b - a) * ∫ x in a..b, |q x| := by
  -- Regularity of u, u', u''
  have hu_cont : Continuous u := hu.continuous
  have hu_diff : Differentiable ℝ u := hu.differentiable (by norm_num)
  have hu'_cd : ContDiff ℝ 1 (deriv u) := hu.deriv'
  have hu'_diff : Differentiable ℝ (deriv u) := hu.differentiable_deriv_two
  have hu''_cont : Continuous (deriv (deriv u)) := hu'_cd.continuous_deriv (by norm_num)
  -- Extend ODE to Icc a b by continuity
  have hode_Icc : ∀ x ∈ Icc a b, deriv (deriv u) x = -(q x * u x) := by
    have hcont_lhs : ContinuousOn (fun x => deriv (deriv u) x + q x * u x) (Icc a b) :=
      hu''_cont.continuousOn.add (hq.mul hu_cont.continuousOn)
    have hzero : EqOn (fun x => deriv (deriv u) x + q x * u x) 0 (Icc a b) :=
      EqOn.of_subset_closure hode hcont_lhs continuousOn_const Ioo_subset_Icc_self
        (by rw [closure_Ioo hab.ne])
    intro x hx
    have h0 := hzero hx
    dsimp at h0
    linarith
  -- Find c ∈ (a, b) maximizing |u| on [a, b]
  have hne_Icc : (Icc a b).Nonempty := nonempty_Icc.mpr hab.le
  obtain ⟨c, hc_mem, hc_max⟩ :=
    isCompact_Icc.exists_isMaxOn hne_Icc (hu_cont.abs.continuousOn)
  set M := |u c|
  have hM_pos : 0 < M := by
    obtain ⟨x₀, hx₀_Ioo, hx₀_ne⟩ := hne
    have hx₀_Icc : x₀ ∈ Icc a b := Ioo_subset_Icc_self hx₀_Ioo
    have hle : |u x₀| ≤ |u c| := hc_max hx₀_Icc
    exact lt_of_lt_of_le (abs_pos.mpr hx₀_ne) hle
  have huc_ne : u c ≠ 0 := abs_pos.mp hM_pos
  have hac : a < c := by
    rcases eq_or_lt_of_le hc_mem.1 with rfl | h
    · exfalso; exact huc_ne ha
    · exact h
  have hcb : c < b := by
    rcases eq_or_lt_of_le hc_mem.2 with rfl | h
    · exfalso; exact huc_ne hb
    · exact h
  -- deriv u c = 0 since c is an interior extremum of u
  have hdu_c : deriv u c = 0 := by
    have hnhds : Icc a b ∈ nhds c := Icc_mem_nhds hac hcb
    rcases lt_or_gt_of_ne huc_ne with hneg | hpos
    · have hmin : IsLocalMin u c := by
        filter_upwards [hnhds] with x hx
        have h1 : |u x| ≤ |u c| := hc_max hx
        rw [abs_of_neg hneg] at h1
        linarith [neg_le_abs (u x)]
      exact hmin.deriv_eq_zero
    · have hmax : IsLocalMax u c := by
        filter_upwards [hnhds] with x hx
        have h1 : |u x| ≤ |u c| := hc_max hx
        rw [abs_of_pos hpos] at h1
        linarith [le_abs_self (u x)]
      exact hmax.deriv_eq_zero
  -- Helper: integral over [a, c]
  have hIcc_ac_sub : Icc a c ⊆ Icc a b := Icc_subset_Icc_right hcb.le
  have hIcc_cb_sub : Icc c b ⊆ Icc a b := Icc_subset_Icc_left hac.le
  have hq_ac : ContinuousOn q (Icc a c) := hq.mono hIcc_ac_sub
  have hq_cb : ContinuousOn q (Icc c b) := hq.mono hIcc_cb_sub
  -- FTC on [a, c] for F(t) = (t - a) * u'(t) - u(t)
  have h_uc_ac : u c = ∫ t in a..c, (t - a) * q t * u t := by
    have hderiv : ∀ t ∈ uIcc a c,
        HasDerivAt (fun x => (x - a) * deriv u x - u x) ((t - a) * deriv (deriv u) t) t := by
      intro t _
      have h1 : HasDerivAt (fun x => x - a) 1 t := (hasDerivAt_id t).sub_const a
      have h2 : HasDerivAt (deriv u) (deriv (deriv u) t) t := (hu'_diff t).hasDerivAt
      have h3 : HasDerivAt u (deriv u t) t := (hu_diff t).hasDerivAt
      convert (h1.mul h2).sub h3 using 1
      ring
    have hint : IntervalIntegrable (fun t => (t - a) * deriv (deriv u) t) volume a c :=
      ((continuous_id.sub continuous_const).mul hu''_cont).intervalIntegrable a c
    have hftc := intervalIntegral.integral_eq_sub_of_hasDerivAt hderiv hint
    simp only [hdu_c, mul_zero, zero_sub, sub_self, ha] at hftc
    have hcongr : ∫ t in a..c, (t - a) * deriv (deriv u) t =
        ∫ t in a..c, -((t - a) * q t * u t) := by
      apply intervalIntegral.integral_congr
      intro t ht
      rw [uIcc_of_le hac.le] at ht
      dsimp only
      rw [hode_Icc t (hIcc_ac_sub ht)]
      ring
    rw [hcongr, intervalIntegral.integral_neg] at hftc
    linarith
  -- FTC on [c, b] for G(t) = (b - t) * u'(t) + u(t)
  have h_uc_cb : u c = ∫ t in c..b, (b - t) * q t * u t := by
    have hderiv : ∀ t ∈ uIcc c b,
        HasDerivAt (fun x => (b - x) * deriv u x + u x) ((b - t) * deriv (deriv u) t) t := by
      intro t _
      have h1 : HasDerivAt (fun x => b - x) (-1) t := by
        simpa using (hasDerivAt_id t).const_sub b
      have h2 : HasDerivAt (deriv u) (deriv (deriv u) t) t := (hu'_diff t).hasDerivAt
      have h3 : HasDerivAt u (deriv u t) t := (hu_diff t).hasDerivAt
      convert (h1.mul h2).add h3 using 1
      ring
    have hint : IntervalIntegrable (fun t => (b - t) * deriv (deriv u) t) volume c b :=
      ((continuous_const.sub continuous_id).mul hu''_cont).intervalIntegrable c b
    have hftc := intervalIntegral.integral_eq_sub_of_hasDerivAt hderiv hint
    simp only [hdu_c, mul_zero, zero_add, sub_self, hb] at hftc
    have hcongr : ∫ t in c..b, (b - t) * deriv (deriv u) t =
        ∫ t in c..b, -((b - t) * q t * u t) := by
      apply intervalIntegral.integral_congr
      intro t ht
      rw [uIcc_of_le hcb.le] at ht
      dsimp only
      rw [hode_Icc t (hIcc_cb_sub ht)]
      ring
    rw [hcongr, intervalIntegral.integral_neg] at hftc
    linarith
  -- Strict inequality 1 / (c - a) < ∫ t in a..c, |q t|
  have h_left : 1 / (c - a) < ∫ t in a..c, |q t| := by
    have hq_abs_ac : ContinuousOn (fun t => |q t|) (Icc a c) := hq_ac.abs
    have h_f2_cont : ContinuousOn (fun t => (t - a) * |q t| * |u t|) (Icc a c) :=
      (((continuousOn_id.sub continuousOn_const).mul hq_abs_ac).mul hu_cont.abs.continuousOn)
    have hM_le : M ≤ ∫ t in a..c, (t - a) * |q t| * |u t| := by
      have h1 : M = |∫ t in a..c, (t - a) * q t * u t| := by rw [← h_uc_ac]
      rw [h1]
      have h2 := intervalIntegral.abs_integral_le_integral_abs (μ := volume) hac.le
        (f := fun t => (t - a) * q t * u t)
      refine h2.trans_eq ?_
      apply intervalIntegral.integral_congr
      intro t ht
      rw [uIcc_of_le hac.le] at ht
      dsimp only
      rw [abs_mul, abs_mul, abs_of_nonneg (sub_nonneg.mpr ht.1)]
    have hq_nz : ∃ t₀ ∈ Ioo a c, q t₀ ≠ 0 := by
      by_contra h
      push Not at h
      have hq_zero : EqOn q 0 (Icc a c) :=
        EqOn.of_subset_closure h hq_ac continuousOn_const Ioo_subset_Icc_self
          (by rw [closure_Ioo hac.ne])
      have h0 : ∫ t in a..c, (t - a) * q t * u t = 0 := by
        have : ∫ t in a..c, (t - a) * q t * u t = ∫ _ in a..c, (0 : ℝ) := by
          apply intervalIntegral.integral_congr
          intro t ht
          rw [uIcc_of_le hac.le] at ht
          have hqt : q t = 0 := hq_zero ht
          simp [hqt]
        rw [this, intervalIntegral.integral_zero]
      rw [← h_uc_ac] at h0
      exact huc_ne h0
    obtain ⟨t₀, ht₀_Ioo, hqt₀⟩ := hq_nz
    set g := fun t => (c - a) * M * |q t| - (t - a) * |q t| * |u t|
    have hg_cont : ContinuousOn g (Icc a c) :=
      (continuousOn_const.mul hq_abs_ac).sub h_f2_cont
    have hg_nonneg : ∀ t ∈ Ioc a c, 0 ≤ g t := by
      intro t ht
      have ht' := Ioc_subset_Icc_self ht
      dsimp [g]
      have htc : t - a ≤ c - a := sub_le_sub_right ht'.2 a
      have hut : |u t| ≤ M := hc_max (hIcc_ac_sub ht')
      have hprod : (t - a) * |u t| ≤ (c - a) * M :=
        mul_le_mul htc hut (abs_nonneg _) (sub_nonneg.mpr hac.le)
      have := mul_le_mul_of_nonneg_right hprod (abs_nonneg (q t))
      linarith
    have hg_pos : 0 < g t₀ := by
      dsimp [g]
      have htc : t₀ - a < c - a := sub_lt_sub_right ht₀_Ioo.2 a
      have hut : |u t₀| ≤ M := hc_max (hIcc_ac_sub (Ioo_subset_Icc_self ht₀_Ioo))
      have hprod : (t₀ - a) * |u t₀| < (c - a) * M := by
        calc (t₀ - a) * |u t₀| ≤ (t₀ - a) * M :=
              mul_le_mul_of_nonneg_left hut (sub_nonneg.mpr ht₀_Ioo.1.le)
          _ < (c - a) * M := mul_lt_mul_of_pos_right htc hM_pos
      have hqpos : 0 < |q t₀| := abs_pos.mpr hqt₀
      have := mul_lt_mul_of_pos_right hprod hqpos
      linarith
    have hint_g_pos : 0 < ∫ t in a..c, g t :=
      intervalIntegral.integral_pos hac hg_cont hg_nonneg ⟨t₀, Ioo_subset_Icc_self ht₀_Ioo, hg_pos⟩
    have hint1 : IntervalIntegrable (fun t => (c - a) * M * |q t|) volume a c :=
      (continuousOn_const.mul hq_abs_ac).intervalIntegrable_of_Icc hac.le
    have hint2 : IntervalIntegrable (fun t => (t - a) * |q t| * |u t|) volume a c :=
      h_f2_cont.intervalIntegrable_of_Icc hac.le
    have hg_eq : ∫ t in a..c, g t =
        (c - a) * M * (∫ t in a..c, |q t|) - ∫ t in a..c, (t - a) * |q t| * |u t| := by
      dsimp [g]
      rw [intervalIntegral.integral_sub hint1 hint2, intervalIntegral.integral_const_mul]
    rw [hg_eq] at hint_g_pos
    have hM_lt : M < (c - a) * M * ∫ t in a..c, |q t| := by linarith
    have hca_pos : 0 < c - a := sub_pos.mpr hac
    rw [div_lt_iff₀ hca_pos]
    nlinarith
  -- Strict inequality 1 / (b - c) < ∫ t in c..b, |q t|
  have h_right : 1 / (b - c) < ∫ t in c..b, |q t| := by
    have hq_abs_cb : ContinuousOn (fun t => |q t|) (Icc c b) := hq_cb.abs
    have h_f2_cont : ContinuousOn (fun t => (b - t) * |q t| * |u t|) (Icc c b) :=
      (((continuousOn_const.sub continuousOn_id).mul hq_abs_cb).mul hu_cont.abs.continuousOn)
    have hM_le : M ≤ ∫ t in c..b, (b - t) * |q t| * |u t| := by
      have h1 : M = |∫ t in c..b, (b - t) * q t * u t| := by rw [← h_uc_cb]
      rw [h1]
      have h2 := intervalIntegral.abs_integral_le_integral_abs (μ := volume) hcb.le
        (f := fun t => (b - t) * q t * u t)
      refine h2.trans_eq ?_
      apply intervalIntegral.integral_congr
      intro t ht
      rw [uIcc_of_le hcb.le] at ht
      dsimp only
      rw [abs_mul, abs_mul, abs_of_nonneg (sub_nonneg.mpr ht.2)]
    have hq_nz : ∃ t₀ ∈ Ioo c b, q t₀ ≠ 0 := by
      by_contra h
      push Not at h
      have hq_zero : EqOn q 0 (Icc c b) :=
        EqOn.of_subset_closure h hq_cb continuousOn_const Ioo_subset_Icc_self
          (by rw [closure_Ioo hcb.ne])
      have h0 : ∫ t in c..b, (b - t) * q t * u t = 0 := by
        have : ∫ t in c..b, (b - t) * q t * u t = ∫ _ in c..b, (0 : ℝ) := by
          apply intervalIntegral.integral_congr
          intro t ht
          rw [uIcc_of_le hcb.le] at ht
          have hqt : q t = 0 := hq_zero ht
          simp [hqt]
        rw [this, intervalIntegral.integral_zero]
      rw [← h_uc_cb] at h0
      exact huc_ne h0
    obtain ⟨t₀, ht₀_Ioo, hqt₀⟩ := hq_nz
    set g := fun t => (b - c) * M * |q t| - (b - t) * |q t| * |u t|
    have hg_cont : ContinuousOn g (Icc c b) :=
      (continuousOn_const.mul hq_abs_cb).sub h_f2_cont
    have hg_nonneg : ∀ t ∈ Ioc c b, 0 ≤ g t := by
      intro t ht
      have ht' := Ioc_subset_Icc_self ht
      dsimp [g]
      have hbc : b - t ≤ b - c := sub_le_sub_left ht'.1 b
      have hut : |u t| ≤ M := hc_max (hIcc_cb_sub ht')
      have hprod : (b - t) * |u t| ≤ (b - c) * M :=
        mul_le_mul hbc hut (abs_nonneg _) (sub_nonneg.mpr hcb.le)
      have := mul_le_mul_of_nonneg_right hprod (abs_nonneg (q t))
      linarith
    have hg_pos : 0 < g t₀ := by
      dsimp [g]
      have hbc : b - t₀ < b - c := sub_lt_sub_left ht₀_Ioo.1 b
      have hut : |u t₀| ≤ M := hc_max (hIcc_cb_sub (Ioo_subset_Icc_self ht₀_Ioo))
      have hprod : (b - t₀) * |u t₀| < (b - c) * M := by
        calc (b - t₀) * |u t₀| ≤ (b - t₀) * M :=
              mul_le_mul_of_nonneg_left hut (sub_nonneg.mpr ht₀_Ioo.2.le)
          _ < (b - c) * M := mul_lt_mul_of_pos_right hbc hM_pos
      have hqpos : 0 < |q t₀| := abs_pos.mpr hqt₀
      have := mul_lt_mul_of_pos_right hprod hqpos
      linarith
    have hint_g_pos : 0 < ∫ t in c..b, g t :=
      intervalIntegral.integral_pos hcb hg_cont hg_nonneg ⟨t₀, Ioo_subset_Icc_self ht₀_Ioo, hg_pos⟩
    have hint1 : IntervalIntegrable (fun t => (b - c) * M * |q t|) volume c b :=
      (continuousOn_const.mul hq_abs_cb).intervalIntegrable_of_Icc hcb.le
    have hint2 : IntervalIntegrable (fun t => (b - t) * |q t| * |u t|) volume c b :=
      h_f2_cont.intervalIntegrable_of_Icc hcb.le
    have hg_eq : ∫ t in c..b, g t =
        (b - c) * M * (∫ t in c..b, |q t|) - ∫ t in c..b, (b - t) * |q t| * |u t| := by
      dsimp [g]
      rw [intervalIntegral.integral_sub hint1 hint2, intervalIntegral.integral_const_mul]
    rw [hg_eq] at hint_g_pos
    have hM_lt : M < (b - c) * M * ∫ t in c..b, |q t| := by linarith
    have hbc_pos : 0 < b - c := sub_pos.mpr hcb
    rw [div_lt_iff₀ hbc_pos]
    nlinarith
  -- Combine both intervals
  have hsplit : (∫ x in a..c, |q x|) + (∫ x in c..b, |q x|) = ∫ x in a..b, |q x| :=
    intervalIntegral.integral_add_adjacent_intervals
      (hq_ac.abs.intervalIntegrable_of_Icc hac.le)
      (hq_cb.abs.intervalIntegrable_of_Icc hcb.le)
  have hsum : 1 / (c - a) + 1 / (b - c) < ∫ x in a..b, |q x| := by
    rw [← hsplit]
    exact add_lt_add h_left h_right
  have hca_pos : 0 < c - a := sub_pos.mpr hac
  have hbc_pos : 0 < b - c := sub_pos.mpr hcb
  have hba_pos : 0 < b - a := sub_pos.mpr hab
  have h_amgm : 4 ≤ (b - a) * (1 / (c - a) + 1 / (b - c)) := by
    have h1 : 0 ≤ ((c - a) - (b - c)) ^ 2 := sq_nonneg _
    have h2 : 4 * ((c - a) * (b - c)) ≤ (b - a) ^ 2 := by nlinarith
    have h3 : (b - a) * (1 / (c - a) + 1 / (b - c)) =
        (b - a) ^ 2 / ((c - a) * (b - c)) := by
      field_simp
      ring
    rw [h3, le_div_iff₀ (mul_pos hca_pos hbc_pos)]
    exact h2
  calc (4 : ℝ) ≤ (b - a) * (1 / (c - a) + 1 / (b - c)) := h_amgm
    _ < (b - a) * ∫ x in a..b, |q x| := mul_lt_mul_of_pos_left hsum hba_pos
