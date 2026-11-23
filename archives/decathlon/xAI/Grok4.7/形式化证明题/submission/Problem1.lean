import Mathlib.Analysis.Calculus.ContDiff.Operations
import Mathlib.Analysis.Calculus.ContDiff.Deriv
import Mathlib.Analysis.Calculus.Deriv.Add
import Mathlib.Analysis.Calculus.Deriv.Mul
import Mathlib.Analysis.Calculus.Deriv.Comp
import Mathlib.Analysis.Calculus.LocalExtr.Basic
import Mathlib.Topology.Order.LocalExtr
import Mathlib.Topology.Order.Compact
import Mathlib.MeasureTheory.Integral.IntervalIntegral.IntegrationByParts
import Mathlib.MeasureTheory.Integral.IntervalIntegral.FundThmCalculus
import Mathlib.MeasureTheory.Integral.DominatedConvergence
import Mathlib.MeasureTheory.Function.LocallyIntegrable
import Mathlib.Tactic.Linarith
import Mathlib.Tactic.Positivity
import Mathlib.Tactic.Ring
import Mathlib.Tactic.FunProp
import Mathlib.Tactic.LinearCombination

open Set MeasureTheory intervalIntegral
open scoped Interval

noncomputable section

/-- Derivative of `t ↦ v (d - t)`. -/
lemma deriv_reflect (v : ℝ → ℝ) (d x : ℝ) (hv : DifferentiableAt ℝ v (d - x)) :
    deriv (fun t => v (d - t)) x = -deriv v (d - x) := by
  have hd : DifferentiableAt ℝ (fun t => d - t) x := by fun_prop
  have hcomp := deriv_comp x hv hd
  have hfeq : (fun t => v (d - t)) = v ∘ fun t => d - t := by
    funext t; rfl
  rw [hfeq, hcomp, deriv_const_sub_id]
  ring

/-- Second derivative of a reflection of a `C²` function. -/
lemma deriv2_reflect (v : ℝ → ℝ) (d x : ℝ) (hv : ContDiff ℝ 2 v) :
    deriv (deriv (fun t => v (d - t))) x = deriv (deriv v) (d - x) := by
  have hfun : deriv (fun t => v (d - t)) = fun t => -deriv v (d - t) := by
    ext t
    exact deriv_reflect v d t ((hv.differentiable (by decide)) (d - t))
  rw [hfun]
  have hneg : deriv (fun t => -(deriv v (d - t))) x =
      -(deriv (fun t => deriv v (d - t)) x) := by
    simpa using deriv.neg (f := fun t => deriv v (d - t)) (x := x)
  rw [hneg]
  have hinner : DifferentiableAt ℝ (deriv v) (d - x) := hv.differentiable_deriv_two (d - x)
  have hsub : DifferentiableAt ℝ (fun t => d - t) x := by fun_prop
  have hcomp := deriv_comp x hinner hsub
  have hfeq : (fun t => deriv v (d - t)) = deriv v ∘ fun t => d - t := by
    funext t; rfl
  rw [hfeq, hcomp, deriv_const_sub_id]
  ring

lemma contDiff_reflect (v : ℝ → ℝ) (d : ℝ) (hv : ContDiff ℝ 2 v) :
    ContDiff ℝ 2 (fun t => v (d - t)) :=
  hv.comp (by fun_prop : ContDiff ℝ 2 fun t => d - t)

/-- Half of the Lyapunov estimate on an interval whose right endpoint realises the maximum. -/
lemma lyapunov_half (q v : ℝ → ℝ) (a c : ℝ) (hac : a < c)
    (hq : ContinuousOn q (Icc a c)) (hv : ContDiff ℝ 2 v)
    (hode : ∀ x ∈ Ioo a c, deriv (deriv v) x = -q x * v x)
    (hbound : ∀ x ∈ Icc a c, |v x| ≤ v c) (hpos : 0 < v c) (hva : v a = 0)
    (hdc : deriv v c = 0) :
    1 / (c - a) < ∫ x in a..c, |q x| := by
  have habs : ContinuousOn (fun t => |q t|) (Icc a c) := continuous_abs.comp_continuousOn hq
  have hca : 0 < c - a := sub_pos.mpr hac
  let F : ℝ → ℝ := fun y => ∫ t in y..c, |q t|
  have hF_cont_Icc : ContinuousOn F (Icc a c) := by
    have hint : IntegrableOn (fun t => |q t|) (uIcc a c) volume := by
      rw [uIcc_of_le hac.le]
      exact habs.integrableOn_Icc (μ := volume)
    rw [← uIcc_of_le hac.le]
    simpa [F] using continuousOn_primitive_interval_left hint
  have hF_deriv : ∀ x ∈ Ioo a c, HasDerivAt F (-|q x|) x := by
    intro x hx
    have hcontx : ContinuousAt (fun t => |q t|) x :=
      habs.continuousAt (Icc_mem_nhds hx.1 hx.2)
    have hsm : StronglyMeasurableAtFilter (fun t => |q t|) (nhds x) volume := by
      have hopen : ∀ y ∈ Ioo a c, ContinuousAt (fun t => |q t|) y :=
        fun y hy => habs.continuousAt (Icc_mem_nhds hy.1 hy.2)
      exact ContinuousAt.stronglyMeasurableAtFilter isOpen_Ioo hopen x hx
    have hint : IntervalIntegrable (fun t => |q t|) volume x c := by
      refine ContinuousOn.intervalIntegrable_of_Icc hx.2.le ?_
      exact habs.mono fun t ht => ⟨hx.1.le.trans ht.1, ht.2⟩
    exact integral_hasDerivAt_left hint hsm hcontx
  have hv'_cont : Continuous (deriv v) := hv.continuous_deriv (by decide)
  have hv'_diff : Differentiable ℝ (deriv v) := hv.differentiable_deriv_two
  have hvy : ∀ y ∈ Icc a c, deriv v y = ∫ t in y..c, q t * v t := by
    intro y hy
    have hle : y ≤ c := hy.2
    have hftc : ∫ t in y..c, deriv (deriv v) t = deriv v c - deriv v y := by
      refine integral_deriv_eq_sub ?_ ?_
      · intro t _
        exact hv'_diff t
      · exact (((hv.deriv' (n := 1)).continuous_deriv le_rfl).intervalIntegrable y c)
    have hcongr : ∫ t in y..c, deriv (deriv v) t = ∫ t in y..c, -(q t * v t) := by
      refine integral_congr_Ioo_of_le hle ?_
      intro t ht
      have ht' : t ∈ Ioo a c := ⟨hy.1.trans_lt ht.1, ht.2⟩
      rw [hode t ht', neg_mul]
    rw [hcongr] at hftc
    rw [hdc, zero_sub] at hftc
    have hneg : ∫ t in y..c, -(q t * v t) = -∫ t in y..c, q t * v t :=
      intervalIntegral.integral_neg
    rw [hneg] at hftc
    linarith
  have hpt : ∀ y ∈ Icc a c, |deriv v y| ≤ v c * F y := by
    intro y hy
    rw [hvy y hy]
    have hle : y ≤ c := hy.2
    calc
      |∫ t in y..c, q t * v t| ≤ ∫ t in y..c, |q t * v t| :=
        abs_integral_le_integral_abs hle
      _ ≤ ∫ t in y..c, |q t| * v c := by
        refine integral_mono_on hle ?_ ?_ ?_
        · exact (continuous_abs.comp_continuousOn
            ((hq.mul hv.continuous.continuousOn).mono
              fun t ht => ⟨hy.1.trans ht.1, ht.2⟩)).intervalIntegrable_of_Icc hle
        · exact ((habs.mono fun t ht => ⟨hy.1.trans ht.1, ht.2⟩).mul
            continuousOn_const).intervalIntegrable_of_Icc hle
        · intro t ht
          have ht' : t ∈ Icc a c := ⟨hy.1.trans ht.1, ht.2⟩
          calc
            |q t * v t| = |q t| * |v t| := abs_mul _ _
            _ ≤ |q t| * v c := mul_le_mul_of_nonneg_left (hbound t ht') (abs_nonneg _)
      _ = v c * F y := by
        have hcomm : ∫ t in y..c, |q t| * v c = ∫ t in y..c, v c * |q t| := by
          congr 1
          ext t
          ring
        rw [hcomm]
        simpa [F] using integral_const_mul (v c) (fun t => |q t|)
  have hMle : v c ≤ ∫ y in a..c, |deriv v y| := by
    have heq : ∫ y in a..c, deriv v y = v c := by
      rw [integral_deriv_eq_sub (fun _ _ => (hv.differentiable (by decide)) _)
        (hv'_cont.intervalIntegrable a c), hva, sub_zero]
    calc
      v c = ∫ y in a..c, deriv v y := heq.symm
      _ ≤ |∫ y in a..c, deriv v y| := le_abs_self _
      _ ≤ ∫ y in a..c, |deriv v y| := abs_integral_le_integral_abs hac.le
  have hprod_int : ∫ y in a..c, |deriv v y| ≤ ∫ y in a..c, v c * F y := by
    refine integral_mono_on hac.le ?_ ?_ hpt
    · exact (continuous_abs.comp hv'_cont).intervalIntegrable a c
    · refine ContinuousOn.intervalIntegrable_of_Icc hac.le ?_
      exact continuousOn_const.mul hF_cont_Icc
  have hconst : ∫ y in a..c, v c * F y = v c * ∫ y in a..c, F y :=
    integral_const_mul (v c) F
  have hFge : 1 ≤ ∫ y in a..c, F y := by
    have hmul : v c * 1 ≤ v c * ∫ y in a..c, F y := by
      calc
        v c * 1 = v c := by ring
        _ ≤ ∫ y in a..c, |deriv v y| := hMle
        _ ≤ ∫ y in a..c, v c * F y := hprod_int
        _ = v c * ∫ y in a..c, F y := hconst
    exact le_of_mul_le_mul_left hmul hpos
  have hparts : ∫ y in a..c, F y = ∫ y in a..c, |q y| * (y - a) := by
    have hF_on : ContinuousOn F (uIcc a c) := by
      rwa [uIcc_of_le hac.le]
    have hid_on : ContinuousOn (fun y => y - a) (uIcc a c) :=
      (continuous_id.sub continuous_const).continuousOn
    have hF_has : ∀ x ∈ Ioo (min a c) (max a c), HasDerivAt F (-|q x|) x := by
      rw [min_eq_left hac.le, max_eq_right hac.le]
      exact hF_deriv
    have hid_has : ∀ x ∈ Ioo (min a c) (max a c), HasDerivAt (fun y => y - a) 1 x := by
      rw [min_eq_left hac.le, max_eq_right hac.le]
      intro x _
      have hdiff : DifferentiableAt ℝ (fun y => y - a) x := by fun_prop
      have hder : deriv (fun y => y - a) x = 1 := by
        simp [deriv_sub_const, deriv_id'']
      simpa [hder] using hdiff.hasDerivAt
    have hneg_int : IntervalIntegrable (fun y => -|q y|) volume a c :=
      (continuous_neg.comp_continuousOn habs).intervalIntegrable_of_Icc hac.le
    have hformula :=
      integral_mul_deriv_eq_deriv_mul_of_hasDerivAt (a := a) (b := c)
        hF_on hid_on hF_has hid_has hneg_int intervalIntegrable_const
    calc
      ∫ y in a..c, F y = ∫ y in a..c, F y * (1 : ℝ) := by simp
      _ = F c * (c - a) - F a * (a - a) -
          ∫ y in a..c, (-|q y|) * (y - a) := hformula
      _ = -∫ y in a..c, (-|q y|) * (y - a) := by
        simp [F, integral_same, sub_self]
      _ = ∫ y in a..c, |q y| * (y - a) := by
        rw [← intervalIntegral.integral_neg]
        congr 1
        ext y
        ring
  have hf_cont : ContinuousOn (fun y => |q y| * (y - a)) (Icc a c) :=
    habs.mul (continuous_id.sub continuous_const).continuousOn
  have hg_cont : ContinuousOn (fun y => |q y| * (c - a)) (Icc a c) :=
    habs.mul continuousOn_const
  have hle_fg : ∀ y ∈ Ioc a c, |q y| * (y - a) ≤ |q y| * (c - a) := by
    intro y hy
    exact mul_le_mul_of_nonneg_left (by linarith [hy.2]) (abs_nonneg _)
  have hmono : ∫ y in a..c, |q y| * (y - a) ≤ (c - a) * ∫ y in a..c, |q y| := by
    have hle_int : ∫ y in a..c, |q y| * (y - a) ≤ ∫ y in a..c, |q y| * (c - a) :=
      integral_mono_on hac.le (hf_cont.intervalIntegrable_of_Icc hac.le)
        (hg_cont.intervalIntegrable_of_Icc hac.le) fun y hy =>
          mul_le_mul_of_nonneg_left (by linarith [hy.2]) (abs_nonneg _)
    have hconst' : ∫ y in a..c, |q y| * (c - a) = (c - a) * ∫ y in a..c, |q y| := by
      have hcomm : ∫ y in a..c, |q y| * (c - a) = ∫ y in a..c, (c - a) * |q y| := by
        congr 1
        ext y
        ring
      rw [hcomm]
      exact integral_const_mul (c - a) fun y => |q y|
    linarith
  have hone : 1 ≤ ∫ y in a..c, |q y| * (y - a) := by rw [← hparts]; exact hFge
  have hIpos : 0 < ∫ t in a..c, |q t| := by
    have hmul : 0 < (c - a) * ∫ t in a..c, |q t| :=
      lt_of_lt_of_le one_pos (hone.trans hmono)
    exact pos_of_mul_pos_right hmul hca.le
  have hex : ∃ y ∈ Ioo a c, 0 < |q y| := by
    by_contra hnone
    push_neg at hnone
    have heq : ∫ t in a..c, |q t| = ∫ t in a..c, (0 : ℝ) := by
      refine integral_congr_Ioo_of_le hac.le ?_
      intro t ht
      exact le_antisymm (hnone t ht) (abs_nonneg _)
    simp at heq
    exact hIpos.ne' heq
  obtain ⟨y0, hy0, hy0q⟩ := hex
  have hstrict_pt : |q y0| * (y0 - a) < |q y0| * (c - a) :=
    mul_lt_mul_of_pos_left (by linarith [hy0.2]) hy0q
  have hstrict_int :
      ∫ y in a..c, |q y| * (y - a) < ∫ y in a..c, |q y| * (c - a) :=
    integral_lt_integral_of_continuousOn_of_le_of_exists_lt hac hf_cont hg_cont hle_fg
      ⟨y0, ⟨hy0.1.le, hy0.2.le⟩, hstrict_pt⟩
  have hconst' : ∫ y in a..c, |q y| * (c - a) = (c - a) * ∫ y in a..c, |q y| := by
    have hcomm : ∫ y in a..c, |q y| * (c - a) = ∫ y in a..c, (c - a) * |q y| := by
      congr 1
      ext y
      ring
    rw [hcomm]
    exact integral_const_mul (c - a) fun y => |q y|
  have hfinal : 1 < (c - a) * ∫ y in a..c, |q y| := by
    rw [hconst'] at hstrict_int
    exact hone.trans_lt hstrict_int
  exact (div_lt_iff₀ hca).mpr (by simpa [mul_comm] using hfinal)

theorem problem1 (q u : ℝ → ℝ) (a b : ℝ) (hab : a < b)
    (hq : ContinuousOn q (Set.Icc a b)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Set.Ioo a b, deriv (deriv u) x + q x * u x = 0)
    (ha : u a = 0) (hb : u b = 0) (hne : ∃ x ∈ Set.Ioo a b, u x ≠ 0) :
    4 < (b - a) * ∫ x in a..b, |q x| := by
  have hu_cont : Continuous u := hu.continuous
  obtain ⟨c, hc, hcmax⟩ :=
    (isCompact_Icc (a := a) (b := b)).exists_isMaxOn
      (⟨a, left_mem_Icc.mpr hab.le⟩ : (Icc a b).Nonempty)
      (continuous_abs.comp_continuousOn hu_cont.continuousOn)
  have hMpos : 0 < |u c| := by
    obtain ⟨x, hx, hxne⟩ := hne
    exact (abs_pos.mpr hxne).trans_le (hcmax (Ioo_subset_Icc_self hx))
  have ha_lt_c : a < c := by
    refine lt_of_le_of_ne hc.1 ?_
    intro hca
    have : u c = 0 := by simpa [← hca] using ha
    rw [this, abs_zero] at hMpos
    exact lt_irrefl _ hMpos
  have hc_lt : c < b := by
    refine lt_of_le_of_ne hc.2 ?_
    intro hcb
    have : u c = 0 := by simpa [hcb] using hb
    rw [this, abs_zero] at hMpos
    exact lt_irrefl _ hMpos
  set s : ℝ := if 0 ≤ u c then 1 else -1 with hs
  have hs_abs : |s| = 1 := by by_cases h : 0 ≤ u c <;> simp [hs, h]
  have hvc : s * u c = |u c| := by
    by_cases h : 0 ≤ u c
    · simp [hs, h, abs_of_nonneg h]
    · simp [hs, h, abs_of_neg (lt_of_not_ge h)]
  set v : ℝ → ℝ := fun x => s * u x with hvdef
  have hv : ContDiff ℝ 2 v := by
    simpa [v, smul_eq_mul] using hu.const_smul s
  have hv_abs : ∀ x, |v x| = |u x| := by
    intro x
    simp [v, abs_mul, hs_abs]
  have hv_c : v c = |u c| := by simp [v, hvc]
  have hva : v a = 0 := by simp [v, ha]
  have hvb : v b = 0 := by simp [v, hb]
  have hderiv2 : deriv (deriv v) = fun x => s * deriv (deriv u) x := by
    have h1 : deriv v = fun x => s * deriv u x := by
      simp [v, deriv_const_mul_field']
    rw [h1]
    simp [deriv_const_mul_field']
  have hode_v : ∀ x ∈ Ioo a b, deriv (deriv v) x = -q x * v x := by
    intro x hx
    have hsum : deriv (deriv v) x + q x * v x = 0 := by
      rw [hderiv2]
      simp only [v]
      have h := hode x hx
      calc
        s * deriv (deriv u) x + q x * (s * u x)
            = s * (deriv (deriv u) x + q x * u x) := by ring
        _ = 0 := by rw [h]; ring
    have hneg := (add_eq_zero_iff_eq_neg).1 hsum
    rw [neg_mul]
    exact hneg
  have hbound : ∀ x ∈ Icc a b, |v x| ≤ v c := by
    intro x hx
    calc
      |v x| = |u x| := hv_abs x
      _ ≤ |u c| := hcmax hx
      _ = v c := hv_c.symm
  have hmax : IsMaxOn v (Icc a b) c := by
    intro x hx
    calc
      v x ≤ |v x| := le_abs_self _
      _ ≤ v c := hbound x hx
  have hdc : deriv v c = 0 :=
    (hmax.isLocalMax (Icc_mem_nhds ha_lt_c hc_lt)).deriv_eq_zero
  have habs : ContinuousOn (fun t => |q t|) (Icc a b) := continuous_abs.comp_continuousOn hq
  have hleft : 1 / (c - a) < ∫ x in a..c, |q x| := by
    refine lyapunov_half q v a c ha_lt_c ?_ hv ?_ ?_ (by simpa [hv_c] using hMpos) hva hdc
    · exact hq.mono fun t ht => ⟨ht.1, ht.2.trans hc.2⟩
    · intro x hx
      exact hode_v x ⟨hx.1, hx.2.trans hc_lt⟩
    · intro x hx
      exact hbound x ⟨hx.1, hx.2.trans hc.2⟩
  let d : ℝ := c + b
  let qR : ℝ → ℝ := fun x => q (d - x)
  let vR : ℝ → ℝ := fun x => v (d - x)
  have hvR : ContDiff ℝ 2 vR := contDiff_reflect v d hv
  have hqR : ContinuousOn qR (Icc c b) := by
    refine hq.comp (continuous_const.sub continuous_id).continuousOn ?_
    intro x hx
    constructor <;> linarith [hx.1, hx.2]
  have hodeR : ∀ x ∈ Ioo c b, deriv (deriv vR) x = -qR x * vR x := by
    intro x hx
    have hσ : d - x ∈ Ioo c b := by constructor <;> linarith [hx.1, hx.2]
    have hσ' : d - x ∈ Ioo a b := ⟨ha_lt_c.trans hσ.1, hσ.2.trans_le le_rfl⟩
    rw [show deriv (deriv vR) x = deriv (deriv v) (d - x) from deriv2_reflect v d x hv,
      hode_v (d - x) hσ']
  have hboundR : ∀ x ∈ Icc c b, |vR x| ≤ vR b := by
    intro x hx
    have hσ : d - x ∈ Icc a b := by
      constructor <;> linarith [hx.1, hx.2, ha_lt_c.le]
    simpa [vR, d] using hbound (d - x) hσ
  have hdcR : deriv vR b = 0 := by
    have hdb : d - b = c := by simp [d]
    rw [deriv_reflect v d b ((hv.differentiable (by decide)) (d - b)), hdb, hdc]
    simp
  have hposR : 0 < vR b := by simpa [vR, d] using (by simpa [hv_c] using hMpos : 0 < v c)
  have hvaR : vR c = 0 := by simpa [vR, d] using hvb
  have hright_R : 1 / (b - c) < ∫ x in c..b, |qR x| :=
    lyapunov_half qR vR c b hc_lt hqR hvR hodeR hboundR hposR hvaR hdcR
  have hright : 1 / (b - c) < ∫ x in c..b, |q x| := by
    have hint : ∫ x in c..b, |qR x| = ∫ x in c..b, |q x| := by
      have hfun : (fun x => |qR x|) = fun x => |q (d - x)| := by ext x; rfl
      rw [hfun]
      simpa [d] using
        (integral_comp_sub_left (fun x => |q x|) d (a := c) (b := b))
    simpa [hint] using hright_R
  have hsplit : ∫ x in a..b, |q x| = (∫ x in a..c, |q x|) + ∫ x in c..b, |q x| := by
    symm
    refine integral_add_adjacent_intervals ?_ ?_
    · exact (habs.mono fun t ht => ⟨ht.1, ht.2.trans hc.2⟩).intervalIntegrable_of_Icc ha_lt_c.le
    · exact (habs.mono fun t ht => ⟨hc.1.trans ht.1, ht.2⟩).intervalIntegrable_of_Icc hc_lt.le
  have hsum : 1 / (c - a) + 1 / (b - c) < ∫ x in a..b, |q x| := by
    calc
      1 / (c - a) + 1 / (b - c)
          < (∫ x in a..c, |q x|) + ∫ x in c..b, |q x| := add_lt_add hleft hright
      _ = ∫ x in a..b, |q x| := hsplit.symm
  have hhm : 4 / (b - a) ≤ 1 / (c - a) + 1 / (b - c) := by
    have h1 : 0 < c - a := sub_pos.mpr ha_lt_c
    have h2 : 0 < b - c := sub_pos.mpr hc_lt
    have h3 : 0 < b - a := sub_pos.mpr hab
    have hfrac : 4 / (b - a) ≤ (b - a) / ((c - a) * (b - c)) := by
      rw [div_le_div_iff₀ h3 (mul_pos h1 h2)]
      nlinarith [sq_nonneg ((c - a) - (b - c))]
    have hsumeq : 1 / (c - a) + 1 / (b - c) = (b - a) / ((c - a) * (b - c)) := by
      rw [div_add_div _ _ h1.ne' h2.ne']
      congr 1
      ring
    linarith
  have hdiv : 4 / (b - a) < ∫ x in a..b, |q x| := lt_of_le_of_lt hhm hsum
  have hba : 0 < b - a := sub_pos.mpr hab
  have hmul : 4 < (∫ x in a..b, |q x|) * (b - a) := (div_lt_iff₀ hba).mp hdiv
  simpa [mul_comm] using hmul
