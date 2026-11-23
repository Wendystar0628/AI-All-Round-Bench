import Mathlib.Analysis.Calculus.LocalExtr.Basic
import Mathlib.Analysis.Calculus.ContDiff.Deriv
import Mathlib.Analysis.Calculus.Deriv.Pow
import Mathlib.MeasureTheory.Integral.IntervalIntegral.FundThmCalculus

open Set

/-- Left half: `u (a) = 0`, `u' (c) = 0`. -/
lemma problem1_left (q u : ℝ → ℝ) (a c M : ℝ) (hac : a < c)
    (hq : ContinuousOn q (Icc a c))
    (hu1 : Differentiable ℝ u) (hdu : Differentiable ℝ (deriv u))
    (hcu' : Continuous (deriv u))
    (hddu : Continuous (deriv (deriv u)))
    (hode : ∀ x ∈ Icc a c, deriv (deriv u) x + q x * u x = 0)
    (ha : u a = 0) (hc : deriv u c = 0)
    (hM : 0 < M) (hMc : |u c| = M) (hbound : ∀ x ∈ Icc a c, |u x| ≤ M) :
    1 < (c - a) * ∫ x in a..c, |q x| := by
  have hqabs : ContinuousOn (fun x => |q x|) (Icc a c) := hq.abs
  have hqint : IntervalIntegrable (fun x => |q x|) MeasureTheory.volume a c :=
    hqabs.intervalIntegrable_of_Icc hac.le
  set Q := ∫ x in a..c, |q x| with hQ
  -- bound on u'
  have hder : ∀ x ∈ Icc a c, |deriv u x| ≤ M * Q := by
    intro x hx
    have hxc : x ≤ c := hx.2
    have hsub : Icc x c ⊆ Icc a c := Icc_subset_Icc hx.1 le_rfl
    have h1 : ∫ t in x..c, deriv (deriv u) t = deriv u c - deriv u x :=
      intervalIntegral.integral_deriv_eq_sub (fun t _ => hdu t)
        (hddu.intervalIntegrable _ _)
    have h2 : |deriv u x| = |∫ t in x..c, deriv (deriv u) t| := by
      rw [h1, hc, zero_sub, abs_neg]
    rw [h2]
    have hqx : IntervalIntegrable (fun t => |q t|) MeasureTheory.volume x c :=
      (hqabs.mono hsub).intervalIntegrable_of_Icc hxc
    calc |∫ t in x..c, deriv (deriv u) t|
        = ‖∫ t in x..c, deriv (deriv u) t‖ := (Real.norm_eq_abs _).symm
      _ ≤ ∫ t in x..c, ‖deriv (deriv u) t‖ :=
          intervalIntegral.norm_integral_le_integral_norm hxc
      _ ≤ ∫ t in x..c, M * |q t| := by
          apply intervalIntegral.integral_mono_on hxc
          · exact (hddu.norm).intervalIntegrable _ _
          · exact hqx.const_mul M
          · intro t ht
            have ht' := hsub ht
            have h3 : deriv (deriv u) t = -(q t * u t) := by
              have := hode t ht'; linarith
            rw [h3, norm_neg, Real.norm_eq_abs, abs_mul, mul_comm]
            exact mul_le_mul_of_nonneg_right (hbound t ht') (abs_nonneg _)
      _ = M * ∫ t in x..c, |q t| := by
          rw [intervalIntegral.integral_const_mul]
      _ ≤ M * Q := by
          apply mul_le_mul_of_nonneg_left _ hM.le
          apply intervalIntegral.integral_mono_interval hx.1 hxc le_rfl _ hqint
          exact Filter.Eventually.of_forall (fun t => abs_nonneg _)
  -- M = |∫ u'|
  have h3 : ∫ t in a..c, deriv u t = u c - u a :=
    intervalIntegral.integral_deriv_eq_sub (fun t _ => hu1 t)
      (hcu'.intervalIntegrable _ _)
  have h4 : M ≤ ∫ t in a..c, |deriv u t| := by
    calc M = |∫ t in a..c, deriv u t| := by rw [h3, ha, sub_zero, hMc]
      _ = ‖∫ t in a..c, deriv u t‖ := (Real.norm_eq_abs _).symm
      _ ≤ ∫ t in a..c, ‖deriv u t‖ :=
          intervalIntegral.norm_integral_le_integral_norm hac.le
      _ = ∫ t in a..c, |deriv u t| := by simp only [Real.norm_eq_abs]
  have hcont : ContinuousOn (fun t => |deriv u t|) (Icc a c) :=
    hcu'.abs.continuousOn
  have h5 : ∫ t in a..c, |deriv u t| ≤ ∫ _t in a..c, M * Q := by
    apply intervalIntegral.integral_mono_on hac.le
    · exact hcont.intervalIntegrable_of_Icc hac.le
    · exact intervalIntegrable_const
    · exact hder
  have h6 : ∫ _t in a..c, M * Q = (c - a) * (M * Q) := by
    rw [intervalIntegral.integral_const, smul_eq_mul]
  have hQpos : 0 < Q := by
    by_contra hneg
    have hQ0 : Q ≤ 0 := not_lt.1 hneg
    have : M ≤ (c - a) * (M * Q) := by linarith
    have h7 : (c - a) * (M * Q) ≤ 0 :=
      mul_nonpos_of_nonneg_of_nonpos (sub_nonneg.2 hac.le)
        (mul_nonpos_of_nonneg_of_nonpos hM.le hQ0)
    linarith
  have h8 : ∫ t in a..c, |deriv u t| < ∫ _t in a..c, M * Q := by
    apply intervalIntegral.integral_lt_integral_of_continuousOn_of_le_of_exists_lt hac hcont
      continuousOn_const
    · intro x hx
      exact hder x (Ioc_subset_Icc_self hx)
    · refine ⟨c, right_mem_Icc.2 hac.le, ?_⟩
      simp only [hc, abs_zero]
      exact mul_pos hM hQpos
  have h9 : M < (c - a) * (M * Q) := by linarith
  have h10 : M * 1 < M * ((c - a) * Q) := by
    calc M * 1 = M := mul_one M
      _ < (c - a) * (M * Q) := h9
      _ = M * ((c - a) * Q) := by ring
  exact lt_of_mul_lt_mul_left h10 hM.le

/-- Right half: `u (b) = 0`, `u' (c) = 0`. -/
lemma problem1_right (q u : ℝ → ℝ) (c b M : ℝ) (hcb : c < b)
    (hq : ContinuousOn q (Icc c b))
    (hu1 : Differentiable ℝ u) (hdu : Differentiable ℝ (deriv u))
    (hcu' : Continuous (deriv u))
    (hddu : Continuous (deriv (deriv u)))
    (hode : ∀ x ∈ Icc c b, deriv (deriv u) x + q x * u x = 0)
    (hb : u b = 0) (hc : deriv u c = 0)
    (hM : 0 < M) (hMc : |u c| = M) (hbound : ∀ x ∈ Icc c b, |u x| ≤ M) :
    1 < (b - c) * ∫ x in c..b, |q x| := by
  have hqabs : ContinuousOn (fun x => |q x|) (Icc c b) := hq.abs
  have hqint : IntervalIntegrable (fun x => |q x|) MeasureTheory.volume c b :=
    hqabs.intervalIntegrable_of_Icc hcb.le
  set Q := ∫ x in c..b, |q x| with hQ
  -- bound on u'
  have hder : ∀ x ∈ Icc c b, |deriv u x| ≤ M * Q := by
    intro x hx
    have hcx : c ≤ x := hx.1
    have hsub : Icc c x ⊆ Icc c b := Icc_subset_Icc le_rfl hx.2
    have h1 : ∫ t in c..x, deriv (deriv u) t = deriv u x - deriv u c :=
      intervalIntegral.integral_deriv_eq_sub (fun t _ => hdu t)
        (hddu.intervalIntegrable _ _)
    have h2 : |deriv u x| = |∫ t in c..x, deriv (deriv u) t| := by
      rw [h1, hc, sub_zero]
    rw [h2]
    have hqx : IntervalIntegrable (fun t => |q t|) MeasureTheory.volume c x :=
      (hqabs.mono hsub).intervalIntegrable_of_Icc hcx
    calc |∫ t in c..x, deriv (deriv u) t|
        = ‖∫ t in c..x, deriv (deriv u) t‖ := (Real.norm_eq_abs _).symm
      _ ≤ ∫ t in c..x, ‖deriv (deriv u) t‖ :=
          intervalIntegral.norm_integral_le_integral_norm hcx
      _ ≤ ∫ t in c..x, M * |q t| := by
          apply intervalIntegral.integral_mono_on hcx
          · exact (hddu.norm).intervalIntegrable _ _
          · exact hqx.const_mul M
          · intro t ht
            have ht' := hsub ht
            have h3 : deriv (deriv u) t = -(q t * u t) := by
              have := hode t ht'; linarith
            rw [h3, norm_neg, Real.norm_eq_abs, abs_mul, mul_comm]
            exact mul_le_mul_of_nonneg_right (hbound t ht') (abs_nonneg _)
      _ = M * ∫ t in c..x, |q t| := by
          rw [intervalIntegral.integral_const_mul]
      _ ≤ M * Q := by
          apply mul_le_mul_of_nonneg_left _ hM.le
          apply intervalIntegral.integral_mono_interval le_rfl hcx hx.2 _ hqint
          exact Filter.Eventually.of_forall (fun t => abs_nonneg _)
  -- M = |∫ u'|
  have h3 : ∫ t in c..b, deriv u t = u b - u c :=
    intervalIntegral.integral_deriv_eq_sub (fun t _ => hu1 t)
      (hcu'.intervalIntegrable _ _)
  have h4 : M ≤ ∫ t in c..b, |deriv u t| := by
    calc M = |∫ t in c..b, deriv u t| := by rw [h3, hb, zero_sub, abs_neg, hMc]
      _ = ‖∫ t in c..b, deriv u t‖ := (Real.norm_eq_abs _).symm
      _ ≤ ∫ t in c..b, ‖deriv u t‖ :=
          intervalIntegral.norm_integral_le_integral_norm hcb.le
      _ = ∫ t in c..b, |deriv u t| := by simp only [Real.norm_eq_abs]
  have hcont : ContinuousOn (fun t => |deriv u t|) (Icc c b) :=
    hcu'.abs.continuousOn
  have h5 : ∫ t in c..b, |deriv u t| ≤ ∫ _t in c..b, M * Q := by
    apply intervalIntegral.integral_mono_on hcb.le
    · exact hcont.intervalIntegrable_of_Icc hcb.le
    · exact intervalIntegrable_const
    · exact hder
  have h6 : ∫ _t in c..b, M * Q = (b - c) * (M * Q) := by
    rw [intervalIntegral.integral_const, smul_eq_mul]
  have hQpos : 0 < Q := by
    by_contra hneg
    have hQ0 : Q ≤ 0 := not_lt.1 hneg
    have : M ≤ (b - c) * (M * Q) := by linarith
    have h7 : (b - c) * (M * Q) ≤ 0 :=
      mul_nonpos_of_nonneg_of_nonpos (sub_nonneg.2 hcb.le)
        (mul_nonpos_of_nonneg_of_nonpos hM.le hQ0)
    linarith
  have h8 : ∫ t in c..b, |deriv u t| < ∫ _t in c..b, M * Q := by
    apply intervalIntegral.integral_lt_integral_of_continuousOn_of_le_of_exists_lt hcb hcont
      continuousOn_const
    · intro x hx
      exact hder x (Ioc_subset_Icc_self hx)
    · refine ⟨c, left_mem_Icc.2 hcb.le, ?_⟩
      simp only [hc, abs_zero]
      exact mul_pos hM hQpos
  have h9 : M < (b - c) * (M * Q) := by linarith
  have h10 : M * 1 < M * ((b - c) * Q) := by
    calc M * 1 = M := mul_one M
      _ < (b - c) * (M * Q) := h9
      _ = M * ((b - c) * Q) := by ring
  exact lt_of_mul_lt_mul_left h10 hM.le

theorem problem1 (q u : ℝ → ℝ) (a b : ℝ) (hab : a < b)
    (hq : ContinuousOn q (Set.Icc a b)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Set.Ioo a b, deriv (deriv u) x + q x * u x = 0)
    (ha : u a = 0) (hb : u b = 0) (hne : ∃ x ∈ Set.Ioo a b, u x ≠ 0) :
    4 < (b - a) * ∫ x in a..b, |q x| := by
  have hu1 : Differentiable ℝ u := hu.differentiable (by norm_num)
  have hdu : Differentiable ℝ (deriv u) := hu.differentiable_deriv_two
  have hcu' : Continuous (deriv u) := hdu.continuous
  have hdu1 : ContDiff ℝ 1 (deriv u) := by
    have h2 : ContDiff ℝ (1 + 1) u := by
      have : ((1 : WithTop ℕ∞) + 1) = 2 := by norm_num
      rw [this]; exact hu
    exact (contDiff_succ_iff_deriv.1 h2).2.2
  have hddu : Continuous (deriv (deriv u)) := hdu1.continuous_deriv le_rfl
  -- extend the ODE to the closed interval
  have hode' : ∀ x ∈ Icc a b, deriv (deriv u) x + q x * u x = 0 := by
    have hEq : EqOn (fun x => deriv (deriv u) x + q x * u x) (fun _ => (0 : ℝ)) (Ioo a b) :=
      fun x hx => hode x hx
    have hcont : ContinuousOn (fun x => deriv (deriv u) x + q x * u x) (Icc a b) :=
      hddu.continuousOn.add (hq.mul hu1.continuous.continuousOn)
    have := hEq.of_subset_closure hcont continuousOn_const Ioo_subset_Icc_self
      (by rw [closure_Ioo hab.ne])
    exact fun x hx => this hx
  -- maximum of u^2
  have hcsq : ContinuousOn (fun x => (u x) ^ 2) (Icc a b) :=
    (hu1.continuous.pow 2).continuousOn
  obtain ⟨c, hc, hmax⟩ := isCompact_Icc.exists_isMaxOn (nonempty_Icc.2 hab.le) hcsq
  obtain ⟨x0, hx0, hux0⟩ := hne
  have hMsq : 0 < (u c) ^ 2 :=
    lt_of_lt_of_le (by positivity) (hmax (Ioo_subset_Icc_self hx0))
  have huc : u c ≠ 0 := by
    intro h; rw [h] at hMsq; simp at hMsq
  have hac : a < c := by
    rcases eq_or_lt_of_le hc.1 with h | h
    · exact absurd (h ▸ ha) huc
    · exact h
  have hcb : c < b := by
    rcases eq_or_lt_of_le hc.2 with h | h
    · exact absurd (h ▸ hb) huc
    · exact h
  have hlm : IsLocalMax (fun x => (u x) ^ 2) c := hmax.isLocalMax (Icc_mem_nhds hac hcb)
  have hd0 : deriv u c = 0 := by
    have h2 := (hu1 c).hasDerivAt.pow 2
    have h1 : deriv (u ^ 2) c = 0 := hlm.deriv_eq_zero
    rw [h2.deriv] at h1
    have h3 : 2 * u c * deriv u c = 0 := by simpa using h1
    rcases mul_eq_zero.1 h3 with h | h
    · rcases mul_eq_zero.1 h with h | h
      · norm_num at h
      · exact absurd h huc
    · exact h
  have hM : 0 < |u c| := abs_pos.2 huc
  have hbound : ∀ x ∈ Icc a b, |u x| ≤ |u c| := by
    intro x hx
    have h : (u x) ^ 2 ≤ (u c) ^ 2 := hmax hx
    exact sq_le_sq.1 h
  have hL := problem1_left q u a c |u c| hac (hq.mono (Icc_subset_Icc le_rfl hcb.le))
    hu1 hdu hcu' hddu (fun x hx => hode' x ⟨hx.1, hx.2.trans hcb.le⟩) ha hd0 hM rfl
    (fun x hx => hbound x ⟨hx.1, hx.2.trans hcb.le⟩)
  have hR := problem1_right q u c b |u c| hcb (hq.mono (Icc_subset_Icc hac.le le_rfl))
    hu1 hdu hcu' hddu (fun x hx => hode' x ⟨hac.le.trans hx.1, hx.2⟩) hb hd0 hM rfl
    (fun x hx => hbound x ⟨hac.le.trans hx.1, hx.2⟩)
  have hqabs : ContinuousOn (fun x => |q x|) (Icc a b) := hq.abs
  have hi1 : IntervalIntegrable (fun x => |q x|) MeasureTheory.volume a c :=
    (hqabs.mono (Icc_subset_Icc le_rfl hcb.le)).intervalIntegrable_of_Icc hac.le
  have hi2 : IntervalIntegrable (fun x => |q x|) MeasureTheory.volume c b :=
    (hqabs.mono (Icc_subset_Icc hac.le le_rfl)).intervalIntegrable_of_Icc hcb.le
  have hsum := intervalIntegral.integral_add_adjacent_intervals hi1 hi2
  rw [← hsum]
  set Q1 := ∫ x in a..c, |q x|
  set Q2 := ∫ x in c..b, |q x|
  have hs : 0 < c - a := sub_pos.2 hac
  have ht : 0 < b - c := sub_pos.2 hcb
  have hQ1 : 0 < Q1 := by
    by_contra h
    have : (c - a) * Q1 ≤ 0 := mul_nonpos_of_nonneg_of_nonpos hs.le (not_lt.1 h)
    linarith
  have hQ2 : 0 < Q2 := by
    by_contra h
    have : (b - c) * Q2 ≤ 0 := mul_nonpos_of_nonneg_of_nonpos ht.le (not_lt.1 h)
    linarith
  have hx : 0 < (c - a) * Q2 := mul_pos hs hQ2
  have hy : 0 < (b - c) * Q1 := mul_pos ht hQ1
  have hxy : 1 < ((c - a) * Q2) * ((b - c) * Q1) := by
    have : ((c - a) * Q2) * ((b - c) * Q1) = ((c - a) * Q1) * ((b - c) * Q2) := by ring
    rw [this]
    calc (1 : ℝ) = 1 * 1 := by norm_num
      _ < ((c - a) * Q1) * ((b - c) * Q2) := by
          apply mul_lt_mul hL hR.le (by norm_num) (by linarith)
  have hsum2 : 2 < (c - a) * Q2 + (b - c) * Q1 := by
    by_contra h
    have h1 : (c - a) * Q2 + (b - c) * Q1 ≤ 2 := not_lt.1 h
    nlinarith [sq_nonneg ((c - a) * Q2 - (b - c) * Q1)]
  have : (b - a) * (Q1 + Q2) = (c - a) * Q1 + (b - c) * Q2 + ((c - a) * Q2 + (b - c) * Q1) := by
    ring
  rw [this]
  linarith

#print axioms problem1
