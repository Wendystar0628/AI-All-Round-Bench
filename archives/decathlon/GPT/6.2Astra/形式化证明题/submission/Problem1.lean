import Mathlib.MeasureTheory.Integral.IntervalIntegral.IntegrationByParts
import Mathlib.Analysis.Calculus.ContDiff.Deriv
import Mathlib.Analysis.Calculus.LocalExtr.Rolle
import Mathlib.Tactic

open Set intervalIntegral
open MeasureTheory (volume)
theorem problem1 (q u : ℝ → ℝ) (a b : ℝ) (hab : a < b)
    (hq : ContinuousOn q (Set.Icc a b)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Set.Ioo a b, deriv (deriv u) x + q x * u x = 0)
    (ha : u a = 0) (hb : u b = 0) (hne : ∃ x ∈ Set.Ioo a b, u x ≠ 0) :
    4 < (b - a) * ∫ x in a..b, |q x| := by
  obtain ⟨z, hz, hnz⟩ := hne
  obtain ⟨c, hc, hmax⟩ := isCompact_Icc.exists_isMaxOn ⟨a, left_mem_Icc.mpr hab.le⟩ hu.continuous.abs.continuousOn
  let M := |u c|
  have hM : 0 < M := (abs_pos.mpr hnz).trans_le (hmax (Ioo_subset_Icc_self hz))
  have hd := hu.differentiable (by decide)
  have h1 : ContDiff ℝ 1 (deriv u) := hu.deriv'
  have hd' := h1.differentiable (by decide)
  have h2 : ContDiff ℝ 0 (deriv (deriv u)) := h1.deriv'
  have ft (x y : ℝ) : ∫ t in x..y, deriv u t = u y - u x :=
    integral_deriv_eq_sub (fun t _ => hd t) (h1.continuous.intervalIntegrable _ _)
  have H (x y : ℝ) (h : x ≤ y) : |u y - u x| ≤ ∫ t in x..y, |deriv u t| := by
    rw [← ft]
    exact abs_integral_le_integral_abs h
  have hL := H a c hc.1
  have hR := H c b hc.2
  rw [ha, sub_zero] at hL
  rw [hb, zero_sub, abs_neg] at hR
  have hadd := integral_add_adjacent_intervals
    (h1.continuous.abs.intervalIntegrable a c (μ := volume))
    (h1.continuous.abs.intervalIntegrable c b (μ := volume))
  have hV : 2*M ≤ ∫ x in a..b, |deriv u x| := by dsimp [M]; linarith
  let k := 2*M/(b-a)
  have hk : 0 < k := div_pos (by positivity) (sub_pos.mpr hab)
  have hk' : k*(b-a) = 2*M := div_mul_cancel₀ _ (sub_ne_zero.mpr hab.ne')
  obtain ⟨y, hy, hy'⟩ := exists_deriv_eq_zero hab hu.continuous.continuousOn (ha.trans hb.symm)
  have hlt := integral_lt_integral_of_continuousOn_of_le_of_exists_lt
    (f := fun x => (2*k)*|deriv u x|) (g := fun x => deriv u x * deriv u x + k^2)
    hab (continuous_const.mul h1.continuous.abs).continuousOn
    ((h1.continuous.mul h1.continuous).add continuous_const).continuousOn
    (fun x _ => by nlinarith [sq_nonneg (|deriv u x|-k), sq_abs (deriv u x)])
    ⟨y, Ioo_subset_Icc_self hy, by simp [hy'] ; positivity⟩
  rw [integral_const_mul, integral_add (f := fun x => deriv u x * deriv u x) (g := fun _ => k^2) ((h1.continuous.mul h1.continuous).intervalIntegrable _ _)
    (continuous_const.intervalIntegrable _ _), integral_const, smul_eq_mul] at hlt
  have hip := integral_mul_deriv_eq_deriv_mul (a := a) (b := b)
    (fun x _ => (hd' x).hasDerivAt) (fun x _ => (hd x).hasDerivAt)
    (h2.continuous.intervalIntegrable _ _) (h1.continuous.intervalIntegrable _ _)
  rw [ha, hb] at hip
  have hE : (∫ x in a..b, -(deriv (deriv u) x * u x)) ≤ (∫ x in a..b, |q x|) * M^2 := by
    rw [← integral_mul_const]
    apply integral_mono_on_of_le_Ioo hab.le ((h2.continuous.mul hu.continuous).neg.intervalIntegrable _ _)
      ((hq.abs.mul continuousOn_const).intervalIntegrable_of_Icc hab.le)
    intro x hx
    have h := hode x hx
    have hxM : |u x| ≤ M := hmax (Ioo_subset_Icc_self hx)
    calc
      -(deriv (deriv u) x * u x) = q x * u x ^ 2 := by linear_combination -(u x)*h
      _ ≤ |q x| * M^2 := mul_le_mul (le_abs_self _) (by nlinarith [sq_abs (u x), mul_self_le_mul_self (abs_nonneg _) hxM]) (sq_nonneg _) (abs_nonneg _)
  rw [integral_neg] at hE
  have hlt' : 2*k*(2*M) < (∫ x in a..b, |q x|)*M^2 + (b-a)*k^2 := by
    nlinarith [mul_le_mul_of_nonneg_left hV (show 0 ≤ 2*k by positivity)]
  have hlt'' := mul_lt_mul_of_pos_right hlt' (sub_pos.mpr hab)
  apply lt_of_mul_lt_mul_right (a := M^2)
  · nlinarith only [hlt'', congrArg (fun t : ℝ => t^2) hk', congrArg (fun t : ℝ => t*(2*M)) hk']
  · positivity

#print axioms problem1