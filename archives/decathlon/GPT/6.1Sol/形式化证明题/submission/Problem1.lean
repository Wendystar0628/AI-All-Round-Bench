import Mathlib.Analysis.Calculus.ContDiff.Deriv
import Mathlib.Analysis.Calculus.ContDiff.Operations
import Mathlib.Analysis.Calculus.Deriv.MeanValue
import Mathlib.Analysis.Calculus.LocalExtr.Basic
import Mathlib.MeasureTheory.Integral.IntervalIntegral.FundThmCalculus
import Mathlib.Tactic.Linarith
import Mathlib.Tactic.Ring
import Mathlib.Tactic.GCongr
import Mathlib.Tactic.Positivity

open Set MeasureTheory

private lemma variation_bound (v : ℝ → ℝ) (hv : Differentiable ℝ v)
    (hvc : Continuous (deriv v)) {a b x y : ℝ}
    (hx : x ∈ Icc a b) (hy : y ∈ Icc a b) :
    |v x - v y| ≤ ∫ t in a..b, |deriv v t| := by
  have aux : ∀ {x y : ℝ}, x ∈ Icc a b → y ∈ Icc a b → x ≤ y →
      |v y - v x| ≤ ∫ t in a..b, |deriv v t| := by
    intro x y hx hy hxy
    have hft : ∫ t in x..y, deriv v t = v y - v x :=
      intervalIntegral.integral_deriv_eq_sub (fun t ht => hv t) (hvc.intervalIntegrable _ _)
    calc
      |v y - v x| = |∫ t in x..y, deriv v t| := congrArg abs hft.symm
      _ ≤ ∫ t in x..y, |deriv v t| := intervalIntegral.abs_integral_le_integral_abs hxy
      _ ≤ ∫ t in a..b, |deriv v t| := by
        apply intervalIntegral.integral_mono_interval hx.1 hxy hy.2
        · exact Filter.Eventually.of_forall (fun t => abs_nonneg _)
        · exact hvc.abs.intervalIntegrable _ _
  rcases le_total x y with hxy | hyx
  · rw [abs_sub_comm]
    exact aux hx hy hxy
  · exact aux hy hx hyx

private lemma peak_algebra (M L R A B : ℝ) (hM : 0 < M) (hL : 0 < L)
    (hR : 0 < R) (hA : M < A * L) (hB : M < -B * R) :
    4 * M < (L + R) * (A - B) := by
  have h1 : M * (L + R) < (A - B) * (L * R) := by
    nlinarith [mul_lt_mul_of_pos_right hA hR, mul_lt_mul_of_pos_right hB hL]
  have h2 := mul_lt_mul_of_pos_right h1 (show 0 < L + R by linarith)
  have h3 : 0 ≤ M * (L - R) ^ 2 := by positivity
  have h4 : 0 < L * R := mul_pos hL hR
  nlinarith

private lemma strict_peak_bound (u : ℝ → ℝ) (hu : ContDiff ℝ 2 u)
    {a b c : ℝ} (hc : c ∈ Ioo a b) (ha : u a = 0) (hb : u b = 0)
    (hpos : 0 < u c) (hcrit : deriv u c = 0) :
    4 * u c < (b - a) * ∫ t in a..b, |deriv (deriv u) t| := by
  have hdu : Differentiable ℝ u := hu.differentiable (by norm_num)
  have hcu : Continuous (deriv u) := hu.continuous_deriv (by norm_num)
  have hdd : ContDiff ℝ 1 (deriv u) := hu.deriv' (n := 1)
  have hab : a < b := hc.1.trans hc.2
  obtain ⟨x, hx, hmax⟩ := isCompact_Icc.exists_isMaxOn (nonempty_Icc.mpr hab.le)
    hcu.continuousOn
  obtain ⟨y, hy, hmin⟩ := isCompact_Icc.exists_isMinOn (nonempty_Icc.mpr hab.le)
    hcu.continuousOn
  obtain ⟨s, hs, hds⟩ := exists_deriv_eq_slope u hc.1 hu.continuous.continuousOn
    hdu.differentiableOn
  obtain ⟨t, ht, hdt⟩ := exists_deriv_eq_slope u hc.2 hu.continuous.continuousOn
    hdu.differentiableOn
  have hmaxpos : 0 < deriv u x := by
    have hle : deriv u s ≤ deriv u x :=
      hmax (show s ∈ Icc a b from ⟨hs.1.le, (hs.2.trans hc.2).le⟩)
    rw [hds, ha, sub_zero] at hle
    exact (div_pos hpos (sub_pos.mpr hc.1)).trans_le hle
  have hminneg : deriv u y < 0 := by
    have hle : deriv u y ≤ deriv u t :=
      hmin (show t ∈ Icc a b from ⟨(hc.1.trans ht.1).le, ht.2.le⟩)
    rw [hdt, hb, zero_sub] at hle
    exact hle.trans_lt (div_neg_of_neg_of_pos (neg_neg_of_pos hpos) (sub_pos.mpr hc.2))
  have hleft : u c < deriv u x * (c - a) := by
    have hi := intervalIntegral.integral_lt_integral_of_continuousOn_of_le_of_exists_lt
      hc.1 hcu.continuousOn (continuousOn_const (c := deriv u x))
      (fun z hz => hmax ⟨hz.1.le, hz.2.trans hc.2.le⟩)
      ⟨c, ⟨hc.1.le, le_rfl⟩, by simpa [hcrit] using hmaxpos⟩
    rw [intervalIntegral.integral_deriv_eq_sub (fun z hz => hdu z) (hcu.intervalIntegrable _ _),
      ha, sub_zero, intervalIntegral.integral_const] at hi
    simpa [mul_comm] using hi
  have hright : u c < -deriv u y * (b - c) := by
    have hi := intervalIntegral.integral_lt_integral_of_continuousOn_of_le_of_exists_lt
      hc.2 (continuousOn_const (c := deriv u y)) hcu.continuousOn
      (fun z hz => hmin ⟨hc.1.le.trans hz.1.le, hz.2⟩)
      ⟨c, ⟨le_rfl, hc.2.le⟩, by simpa [hcrit] using hminneg⟩
    rw [intervalIntegral.integral_deriv_eq_sub (fun z hz => hdu z) (hcu.intervalIntegrable _ _),
      hb, zero_sub, intervalIntegral.integral_const] at hi
    simp only [smul_eq_mul] at hi
    nlinarith
  have hgeom := peak_algebra (u c) (c - a) (b - c) (deriv u x) (deriv u y)
    hpos (sub_pos.mpr hc.1) (sub_pos.mpr hc.2) hleft hright
  have hvar := variation_bound (deriv u) (hu.differentiable_deriv_two)
    (hdd.continuous_deriv (by norm_num)) hx hy
  have hxy : deriv u y ≤ deriv u x := (hmin hx).trans (hmax hx)
  rw [abs_of_nonneg (sub_nonneg.mpr hxy)] at hvar
  nlinarith [mul_le_mul_of_nonneg_left hvar (sub_nonneg.mpr hab.le)]

private lemma positive_ode_peak (q u : ℝ → ℝ) {a b c : ℝ}
    (hq : ContinuousOn q (Icc a b)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Ioo a b, deriv (deriv u) x + q x * u x = 0)
    (hc : c ∈ Ioo a b) (ha : u a = 0) (hb : u b = 0)
    (hpos : 0 < u c) (hcrit : deriv u c = 0)
    (hpeak : ∀ x ∈ Icc a b, |u x| ≤ u c) :
    4 < (b - a) * ∫ x in a..b, |q x| := by
  have hab := hc.1.trans hc.2
  have hdd : ContDiff ℝ 1 (deriv u) := hu.deriv' (n := 1)
  have hcont := hdd.continuous_deriv (by norm_num)
  have hbnd : (∫ x in a..b, |deriv (deriv u) x|) ≤
      (∫ x in a..b, |q x| * u c) := by
    apply intervalIntegral.integral_mono_on_of_le_Ioo hab.le
      (hcont.abs.intervalIntegrable _ _)
      ((hq.abs.mul continuousOn_const).intervalIntegrable_of_Icc hab.le)
    intro x hx
    have heq : deriv (deriv u) x = -(q x * u x) := by linarith [hode x hx]
    rw [heq, abs_neg, abs_mul]
    exact mul_le_mul_of_nonneg_left (hpeak x ⟨hx.1.le, hx.2.le⟩) (abs_nonneg _)
  rw [intervalIntegral.integral_mul_const] at hbnd
  have hs := strict_peak_bound u hu hc ha hb hpos hcrit
  have hm := mul_le_mul_of_nonneg_left hbnd (sub_nonneg.mpr hab.le)
  have hfinal : u c * 4 < u c * ((b - a) * ∫ x in a..b, |q x|) := by nlinarith
  exact (mul_lt_mul_iff_right₀ hpos).mp hfinal

theorem problem1 (q u : ℝ → ℝ) (a b : ℝ) (hab : a < b)
    (hq : ContinuousOn q (Set.Icc a b)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Set.Ioo a b, deriv (deriv u) x + q x * u x = 0)
    (ha : u a = 0) (hb : u b = 0) (hne : ∃ x ∈ Set.Ioo a b, u x ≠ 0) :
    4 < (b - a) * ∫ x in a..b, |q x| := by
  obtain ⟨c, hc, hmax⟩ := isCompact_Icc.exists_isMaxOn (nonempty_Icc.mpr hab.le)
    hu.continuous.abs.continuousOn
  obtain ⟨z, hz, hnz⟩ := hne
  have hpos : 0 < |u c| :=
    (abs_pos.mpr hnz).trans_le (hmax ⟨hz.1.le, hz.2.le⟩)
  have hac : a ≠ c := by
    intro h
    subst c
    simpa [ha] using hpos
  have hcb : c ≠ b := by
    intro h
    subst c
    simpa [hb] using hpos
  have hci : c ∈ Ioo a b := ⟨lt_of_le_of_ne hc.1 hac, lt_of_le_of_ne hc.2 hcb⟩
  rcases le_total 0 (u c) with hp | hn
  · have hpc : 0 < u c := by simpa [abs_of_nonneg hp] using hpos
    have hpk : ∀ x ∈ Icc a b, |u x| ≤ u c := by
      intro x hx
      simpa [abs_of_nonneg hp] using hmax hx
    have hmaxu : IsMaxOn u (Icc a b) c :=
      fun x hx => (le_abs_self _).trans (hpk x hx)
    exact positive_ode_peak q u hq hu hode hci ha hb hpc
      (hmaxu.isLocalMax (Icc_mem_nhds hci.1 hci.2)).deriv_eq_zero hpk
  · have hpc : 0 < -u c := by simpa [abs_of_nonpos hn] using hpos
    have hpk : ∀ x ∈ Icc a b, |(-u) x| ≤ (-u) c := by
      intro x hx
      simpa [abs_of_nonpos hn] using hmax hx
    have hmaxu : IsMaxOn (-u) (Icc a b) c :=
      fun x hx => (le_abs_self _).trans (hpk x hx)
    apply positive_ode_peak q (-u) hq hu.neg ?_ hci (by simpa using ha)
      (by simpa using hb) hpc
      (hmaxu.isLocalMax (Icc_mem_nhds hci.1 hci.2)).deriv_eq_zero hpk
    intro x hx
    simp only [deriv.neg', deriv.fun_neg, Pi.neg_apply]
    nlinarith [hode x hx]
