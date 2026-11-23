import Mathlib

open MeasureTheory
open scoped Topology Interval

lemma strict_cs {g : ℝ → ℝ} {a c : ℝ} (hac : a < c)
    (hg : ContinuousOn g (Set.Icc a c))
    (hpt : ∃ x ∈ Set.Icc a c, g x ≠ (∫ t in a..c, g t) / (c - a)) :
    (∫ t in a..c, g t)^2 < (c - a) * ∫ t in a..c, (g t)^2 := by
  have hg' : ContinuousOn g (Set.uIcc a c) := by rwa [Set.uIcc_of_le hac.le]
  let m : ℝ := (∫ t in a..c, g t) / (c - a)
  have hg2 : IntervalIntegrable (fun x => g x ^ 2) volume a c :=
    (hg'.pow 2).intervalIntegrable
  have hcont_subI : ContinuousOn (fun x => g x - m) (Set.Icc a c) :=
    hg.sub (continuousOn_const : ContinuousOn (fun _ : ℝ => m) (Set.Icc a c))
  have hcont_sqI : ContinuousOn (fun x => (g x - m) ^ 2) (Set.Icc a c) :=
    hcont_subI.pow 2
  have h2mg : IntervalIntegrable (fun x => 2 * m * g x) volume a c := by
    have hc : ContinuousOn (fun x => 2 * m * g x) (Set.uIcc a c) := by
      convert hg'.const_mul (2 * m) using 1 <;> simp <;> ring
    exact hc.intervalIntegrable
  have hconst2 : IntervalIntegrable (fun _ : ℝ => m ^ 2) volume a c :=
    (continuousOn_const : ContinuousOn (fun _ : ℝ => m ^ 2) (Set.uIcc a c)).intervalIntegrable
  have hA : IntervalIntegrable (fun x => g x ^ 2 - 2 * m * g x) volume a c := hg2.sub h2mg
  have hm : m * (c - a) = ∫ t in a..c, g t := by
    dsimp [m]
    field_simp
  have hexpand : ∫ t in a..c, (g t - m) ^ 2
      = (∫ t in a..c, g t ^ 2) - 2 * m * (∫ t in a..c, g t) + (c - a) * m ^ 2 := by
    have heq : (fun t => (g t - m) ^ 2) = (fun t => (g t ^ 2 - 2 * m * g t) + m ^ 2) := by
      funext t; ring
    rw [heq]
    rw [intervalIntegral.integral_add hA hconst2]
    rw [intervalIntegral.integral_sub hg2 h2mg]
    rw [intervalIntegral.integral_const]
    rw [intervalIntegral.integral_const_mul (2 * m) g]
    simp only [smul_eq_mul]
  have hpos : 0 < ∫ t in a..c, (g t - m) ^ 2 := by
    apply intervalIntegral.integral_pos hac hcont_sqI (fun x hx => sq_nonneg _)
    obtain ⟨x, hx, hne⟩ := hpt
    refine ⟨x, hx, sq_pos_of_ne_zero (sub_ne_zero.mpr hne)⟩
  have hRHS : (c - a) * ((∫ t in a..c, g t ^ 2) - 2 * m * (∫ t in a..c, g t) + (c - a) * m ^ 2)
        = (c - a) * (∫ t in a..c, g t ^ 2) - (∫ t in a..c, g t) ^ 2 := by
      calc
        _ = (c - a) * (∫ t in a..c, g t ^ 2) - 2 * (m * (c - a)) * (∫ t in a..c, g t)
            + (m * (c - a)) ^ 2 := by ring
        _ = (c - a) * (∫ t in a..c, g t ^ 2) - 2 * (∫ t in a..c, g t) * (∫ t in a..c, g t)
            + (∫ t in a..c, g t) ^ 2 := by rw [hm]
        _ = (c - a) * (∫ t in a..c, g t ^ 2) - (∫ t in a..c, g t) ^ 2 := by ring
  have hE : (∫ t in a..c, g t ^ 2) - 2 * m * (∫ t in a..c, g t) + (c - a) * m ^ 2 > 0 := by
    linarith [hexpand, hpos]
  have hE' : 0 < (c - a) * ((∫ t in a..c, g t ^ 2) - 2 * m * (∫ t in a..c, g t) + (c - a) * m ^ 2) :=
    mul_pos (sub_pos.mpr hac) hE
  linarith [hRHS, hE']

lemma four_div_le {x y : ℝ} (hx : 0 < x) (hy : 0 < y) : 4 / (x + y) ≤ 1 / x + 1 / y := by
  have hxy : 0 < x + y := add_pos hx hy
  have h1 : 1 / x + 1 / y = (x + y) / (x * y) := by field_simp; ring
  rw [h1]
  rw [div_le_div_iff₀ (by positivity) (by positivity)]
  nlinarith [sq_nonneg (x - y)]

theorem problem1 (q u : ℝ → ℝ) (a b : ℝ) (hab : a < b)
    (hq : ContinuousOn q (Set.Icc a b)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Set.Ioo a b, deriv (deriv u) x + q x * u x = 0)
    (ha : u a = 0) (hb : u b = 0) (hne : ∃ x ∈ Set.Ioo a b, u x ≠ 0) :
    4 < (b - a) * ∫ x in a..b, |q x| := by
  have hu'_cont : Continuous (deriv u) := hu.continuous_deriv (by norm_num)
  have hu_diff : Differentiable ℝ u := hu.differentiable (by norm_num)
  have hu'_diff : Differentiable ℝ (deriv u) := hu.differentiable_deriv_two
  have hu''_cont : Continuous (deriv (deriv u)) := by
    have h1 : ContDiff ℝ (1 + 1) u := hu
    exact h1.deriv'.continuous_deriv (by norm_num)
  have hu_cont : Continuous u := hu.continuous
  -- max point
  obtain ⟨c, hcIcc, hcmax⟩ : ∃ c ∈ Set.Icc a b, IsMaxOn (fun x => |u x|) (Set.Icc a b) c :=
    isCompact_Icc.exists_isMaxOn (Set.nonempty_Icc.mpr (le_of_lt hab))
      (hu_cont.continuousOn.abs (s := Set.Icc a b))
  obtain ⟨x0, hx0Ioo, hx0ne⟩ := hne
  have hMpos : 0 < |u c| := by
    have h1 : |u x0| ≤ |u c| := hcmax (Set.Ioo_subset_Icc_self hx0Ioo)
    have h2 : 0 < |u x0| := abs_pos.mpr hx0ne
    linarith
  have hac' : a < c := by
    rcases lt_or_eq_of_le hcIcc.1 with h | h
    · exact h
    · have huc : u c = 0 := by rw [← h]; exact ha
      rw [huc] at hMpos; simp at hMpos
  have hcb' : c < b := by
    rcases lt_or_eq_of_le hcIcc.2 with h | h
    · exact h
    · have huc : u c = 0 := by rw [h]; exact hb
      rw [huc] at hMpos; simp at hMpos
  have hu'c : deriv u c = 0 := by
    have huc_ne : u c ≠ 0 := abs_ne_zero.mp (ne_of_gt hMpos)
    rcases lt_or_gt_of_ne huc_ne with huc | huc
    · have hmin : IsMinOn u (Set.Icc a b) c := by
        intro y hy
        calc u c = -|u c| := by rw [abs_of_neg huc]
          _ ≤ -|u y| := neg_le_neg (hcmax hy)
          _ ≤ u y := by by_cases h : 0 ≤ u y <;> simp [abs_of_nonneg h, abs_of_neg h] <;> linarith
      have hloc : IsLocalMin u c := hmin.isLocalMin (by
        filter_upwards [isOpen_Ioo.mem_nhds (show c ∈ Set.Ioo a b from ⟨hac', hcb'⟩)]
        exact fun x hx => hx)
      exact hloc.hasDerivAt_eq_zero (hu_diff.differentiableAt.hasDerivAt)
    · have hmax : IsMaxOn u (Set.Icc a b) c := by
        intro y hy
        calc u y ≤ |u y| := le_abs_self _
          _ ≤ |u c| := hcmax hy
          _ = u c := abs_of_pos huc
      have hloc : IsLocalMax u c := hmax.isLocalMax (by
        filter_upwards [isOpen_Ioo.mem_nhds (show c ∈ Set.Ioo a b from ⟨hac', hcb'⟩)]
        exact fun x hx => hx)
      exact hloc.hasDerivAt_eq_zero (hu_diff.differentiableAt.hasDerivAt)
  sorry