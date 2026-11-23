import Mathlib.Analysis.Calculus.ContDiff.Deriv
import Mathlib.Analysis.Calculus.LocalExtr.Basic
import Mathlib.MeasureTheory.Integral.IntervalIntegral.IntegrationByParts
import Mathlib.Tactic.FieldSimp
import Mathlib.Tactic.Linarith
import Mathlib.Tactic.Positivity

open Set
open intervalIntegral

private lemma p1_slope (v : ℝ → ℝ) (a b k : ℝ) (hab : a < b)
    (hv : Continuous v) (hz : ∃ c ∈ Icc a b, v c = 0) (hk : k ≠ 0) :
    2 * k * (∫ x in a..b, v x) - (b-a) * k^2 < ∫ x in a..b, v x ^ 2 := by
  have hc : Continuous (fun x => 2*k*v x-k^2) := by fun_prop
  have h := integral_lt_integral_of_continuousOn_of_le_of_exists_lt hab
    hc.continuousOn (hv.pow 2).continuousOn
    (fun x _ => by dsimp; nlinarith [sq_nonneg (v x-k)]) (by
      obtain ⟨c, hc, hvc⟩ := hz
      exact ⟨c, hc, by dsimp; rw [hvc]; nlinarith [sq_pos_of_ne_zero hk]⟩)
  have hf : Continuous (fun x => 2*k*v x) := by fun_prop
  rw [integral_sub (hf.intervalIntegrable a b)
      (continuous_const.intervalIntegrable a b), integral_const_mul, integral_const,
      smul_eq_mul] at h
  exact h

theorem problem1 (q u : ℝ → ℝ) (a b : ℝ) (hab : a < b)
    (hq : ContinuousOn q (Set.Icc a b)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Set.Ioo a b, deriv (deriv u) x + q x * u x = 0)
    (ha : u a = 0) (hb : u b = 0) (hne : ∃ x ∈ Set.Ioo a b, u x ≠ 0) :
    4 < (b - a) * ∫ x in a..b, |q x| := by
  have hdu := hu.continuous_deriv (by norm_num)
  have hdd := (contDiff_succ_iff_deriv.mp (show ContDiff ℝ (1 + 1) u by convert hu using 1 <;> norm_num)).2.2.continuous_deriv_one
  have hD : ∀ x, HasDerivAt u (deriv u x) x :=
    fun x => (hu.differentiable (by norm_num) x).hasDerivAt
  obtain ⟨x, hx, hux⟩ := hne
  obtain ⟨c, hc, hm⟩ := isCompact_Icc.exists_isMaxOn
    ⟨x, Ioo_subset_Icc_self hx⟩ (hu.continuous.pow 2).continuousOn
  have hpos : 0 < u c ^ 2 :=
    lt_of_lt_of_le (sq_pos_of_ne_zero hux) (hm (Ioo_subset_Icc_self hx))
  have huc : u c ≠ 0 := by intro he; simp [he] at hpos
  have hac : a < c := lt_of_le_of_ne hc.1 (fun he => huc (he ▸ ha))
  have hcb : c < b := lt_of_le_of_ne hc.2 (fun he => huc (he.symm ▸ hb))
  have hlocal : IsLocalMax (fun y => u y ^ 2) c :=
    hm.isLocalMax (Filter.mem_of_superset (Ioo_mem_nhds hac hcb) Ioo_subset_Icc_self)
  have hdc : deriv u c = 0 := by
    have h := (hD c).mul (hD c)
    have he := h.deriv.symm.trans (show deriv (fun y => u y * u y) c = 0 by
      simpa only [← pow_two] using hlocal.deriv_eq_zero)
    rcases lt_or_gt_of_ne huc with hh | hh <;> nlinarith
  have iac := integral_eq_sub_of_hasDerivAt (fun y _ => hD y)
    (hdu.intervalIntegrable a c)
  have icb := integral_eq_sub_of_hasDerivAt (fun y _ => hD y)
    (hdu.intervalIntegrable c b)
  have h₁ := p1_slope (deriv u) a c (u c / (c-a)) hac hdu
    ⟨c, ⟨hac.le, le_rfl⟩, hdc⟩ (div_ne_zero huc (sub_ne_zero.mpr hac.ne'))
  have h₂ := p1_slope (deriv u) c b (-u c / (b-c)) hcb hdu
    ⟨c, ⟨le_rfl, hcb.le⟩, hdc⟩ (div_ne_zero (neg_ne_zero.mpr huc) (sub_ne_zero.mpr hcb.ne'))
  rw [iac, ha, sub_zero] at h₁
  rw [icb, hb, zero_sub] at h₂
  have hlow : u c ^ 2 / (c-a) + u c ^ 2 / (b-c) <
      ∫ y in a..b, deriv u y ^ 2 := by
    have hi : Continuous (fun y => deriv u y ^ 2) := hdu.pow 2
    rw [← integral_add_adjacent_intervals (hi.intervalIntegrable a c)
      (hi.intervalIntegrable c b)]
    convert add_lt_add h₁ h₂ using 1
    field_simp [hac.ne', hcb.ne']
    <;> ring
  have hbase : 4 * u c ^ 2 ≤
      (b-a) * (u c ^ 2 / (c-a) + u c ^ 2 / (b-c)) := by
    have hd : 0 < (c-a)*(b-c) := mul_pos (sub_pos.mpr hac) (sub_pos.mpr hcb)
    apply le_of_mul_le_mul_right _ hd
    calc
      (4 * u c ^ 2) * ((c-a)*(b-c)) ≤ (b-a)^2 * u c^2 := by
        nlinarith [mul_nonneg (sq_nonneg (u c)) (sq_nonneg ((c-a)-(b-c)))]
      _ = _ := by
        field_simp [hac.ne', hcb.ne']
        <;> ring
  have hparts := integral_mul_deriv_eq_deriv_mul (fun y _ => hD y)
    (fun y _ => (hu.differentiable_deriv_two y).hasDerivAt)
    (hdu.intervalIntegrable a b) (hdd.intervalIntegrable a b)
  have heq : (∫ y in a..b, deriv u y ^ 2) = ∫ y in a..b, q y * u y ^ 2 := by
    have he : (∫ y in a..b, u y * deriv (deriv u) y) =
        ∫ y in a..b, -(q y * u y ^ 2) := by
      apply integral_congr_Ioo_of_le hab.le
      intro y hy
      have hh : deriv (deriv u) y = -(q y * u y) := eq_neg_of_add_eq_zero_left (hode y hy)
      dsimp
      rw [hh]
      ring
    rw [he, integral_neg, ha, hb] at hparts
    simpa [pow_two] using (neg_injective (show -(∫ y in a..b, q y * (u y * u y)) =
      -(∫ y in a..b, deriv u y * deriv u y) by simpa [pow_two] using hparts)).symm
  have hupper : (∫ y in a..b, q y * u y ^ 2) ≤ u c ^ 2 * ∫ y in a..b, |q y| := by
    rw [← integral_const_mul]
    apply integral_mono_on hab.le
      ((hq.mul (hu.continuous.pow 2).continuousOn).intervalIntegrable_of_Icc hab.le)
      ((continuousOn_const.mul hq.abs).intervalIntegrable_of_Icc hab.le)
    intro y hy
    change q y * u y ^ 2 ≤ u c ^ 2 * |q y|
    rw [mul_comm (u c ^ 2)]
    exact mul_le_mul (le_abs_self _) (hm hy) (sq_nonneg _) (abs_nonneg _)
  have h := lt_of_le_of_lt hbase (mul_lt_mul_of_pos_left hlow (sub_pos.mpr hab))
  rw [heq] at h
  have hh := h.trans_le (mul_le_mul_of_nonneg_left hupper (sub_nonneg.mpr hab.le))
  rw [mul_left_comm (b-a), mul_comm 4] at hh
  exact lt_of_mul_lt_mul_left hh hpos.le

#print axioms problem1
