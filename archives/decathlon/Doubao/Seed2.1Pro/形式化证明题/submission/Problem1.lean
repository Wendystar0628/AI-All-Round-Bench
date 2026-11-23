import Mathlib.MeasureTheory.Integral.IntervalIntegral.ContDiff
import Mathlib.MeasureTheory.Integral.IntervalIntegral.IntegrationByParts
import Mathlib.Analysis.Calculus.LocalExtr.Basic

open Set Filter MeasureTheory

namespace Problem1

/-- If a nonnegative function continuous on `[a,b]` has zero interval integral,
it vanishes on `(a,b)`. -/
lemma eq_zero_on_Ioo_of_nonneg_integral_zero {f : ℝ → ℝ} {a b : ℝ} (hab : a < b)
    (hcont : ContinuousOn f (Icc a b)) (hnonneg : ∀ x ∈ Icc a b, 0 ≤ f x)
    (hint : ∫ t in a..b, f t = 0) :
    ∀ x ∈ Ioo a b, f x = 0 := by
  have hfi : IntervalIntegrable f volume a b :=
    hcont.intervalIntegrable_of_Icc hab.le
  have hae : f =ᵐ[volume.restrict (Ioc a b)] 0 := by
    have hnon : 0 ≤ᵐ[volume.restrict (Ioc a b)] f := by
    have : ∀ᵐ (x : ℝ) ∂volume.restrict (Ioc a b), 0 ≤ f x := by
      filter_upwards [self_mem_ae_restrict measurableSet_Ioc] with x hx
      exact hnonneg x (Ioc_subset_Icc_self hx)
    exact this
    rw [intervalIntegral.integral_eq_zero_iff_of_le_of_nonneg_ae hab.le hnon hfi] at hint
    exact hint
  have hIcc : ∀ x ∈ Icc a b, f x = 0 := by
    rw [Measure.restrict_congr_set Ioc_ae_eq_Icc] at hae
    exact fun x hx => Measure.eqOn_Icc_of_ae_eq volume hab.ne hae hcont (continuousOn_const) hx
  intro x hx
  exact hIcc x (Ioo_subset_Icc_self hx)

end Problem1

theorem problem1 (q u : ℝ → ℝ) (a b : ℝ) (hab : a < b)
    (hq : ContinuousOn q (Set.Icc a b)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Set.Ioo a b, deriv (deriv u) x + q x * u x = 0)
    (ha : u a = 0) (hb : u b = 0) (hne : ∃ x ∈ Set.Ioo a b, u x ≠ 0) :
    4 < (b - a) * ∫ x in a..b, |q x| := by
  set v : ℝ → ℝ := deriv u with hvdef
  have hu_diff : Differentiable ℝ u := hu.differentiable (by norm_num)
  have hv_diff : Differentiable ℝ v := hu.differentiable_deriv_two
  have huc : Continuous u := hu_diff.continuous
  have hvc : Continuous v := hu.continuous_deriv (by norm_num)
  have hv'_eq : ∀ x ∈ Ioo a b, deriv v x = -(q x * u x) := by
    intro x hx
    have h : deriv v x + q x * u x = 0 := hode x hx
    linarith
  -- continuous extension of q to all of ℝ
  let cl (x : ℝ) : ℝ := max a (min b x)
  have hcl_cont : Continuous cl := by
    fun_prop
  have hcl1 : ∀ x ∈ Icc a b, cl x = x := by
    intro x hx
    have h1 : min b x = x := min_eq_left hx.2
    have h2 : max a x = x := max_eq_right hx.1
    simpa [cl, h1, h2] using rfl
  have hcl_Icc : ∀ x, cl x ∈ Icc a b := by
    intro x
    simp only [cl, mem_Icc]
    constructor <;> linarith [min_le_right b x, le_min]
  let Q : ℝ → ℝ := fun x => q (cl x)
  have hQc : Continuous Q := hq.comp_continuous hcl_cont hcl_Icc
  let F : ℝ → ℝ := fun x => Q x * u x
  have hFc : Continuous F := hQc.mul huc
  have hF_eq : ∀ x ∈ Icc a b, F x = q x * u x := by
    intro x hx
    simp [F, hcl1 x hx]
  -- maximum of |u| on [a,b]
  obtain ⟨c, hcIcc, hcmax⟩ := huc.continuousOn.abs.exists_isMaxOn
    isCompact_Icc (Icc_subset_univ _)
  set M : ℝ := |u c| with hMdef
  have hMge : ∀ x ∈ Icc a b, |u x| ≤ M := hcmax
  obtain ⟨x0, hx0, hx0ne⟩ := hne
  have hMpos : 0 < M := by
    have : M = |u c| := rfl
    rw [this]
    exact abs_pos.mpr hx0ne ▸ lt_of_lt_of_le (abs_pos.mpr hx0ne) (hMge x0 (Ioo_subset_Icc_self hx0))
  have hcne_a : c ≠ a := by
    intro h
    rw [h] at hMdef
    rw [ha] at hMdef
    linarith [abs_nonneg (u a)]
  have hcne_b : c ≠ b := by
    intro h
    rw [h] at hMdef
    rw [hb] at hMdef
    linarith [abs_nonneg (u b)]
  have hc1 : a < c := by
    have : c ∈ Icc a b := hcIcc
    exact lt_of_le_of_ne this.1 hcne_a
  have hc2 : c < b := by
    have : c ∈ Icc a b := hcIcc
    exact lt_of_le_of_ne this.2 hcne_b.symm
  have hcIoo : c ∈ Ioo a b := ⟨hc1, hc2⟩
  -- |u| has local max at c, deriv v c = 0
  have hlocmax : IsLocalMax (fun x => |u x|) c :=
    hcmax.isLocalMax (Icc_mem_nhds hc1 hc2)
  have hder_abs : deriv (fun x => |u x|) c = 0 := hlocmax.deriv_eq_zero
  have hvc0 : v c = 0 := by
    have h2 : DifferentiableAt ℝ u c := hu_diff.differentiableAt
    by_cases huc0 : u c = 0
    · have : M = 0 := by simp [hMdef, huc0]
      linarith
    · have h3 : deriv (fun x => |u x|) c = (sign (u c)) * v c := by
        rw [deriv_abs huc0]
        <;> rfl
      rw [h3] at hder_abs
      have hs : sign (u c) ≠ 0 := by
        apply sign_ne_zero.mpr
        exact huc0
      exact (mul_eq_zero.mp hder_abs).resolve_left hs
  sorry

#print axioms problem1
